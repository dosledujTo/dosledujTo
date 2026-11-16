import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as queries from "../../../../shared/src/queries.js";
import * as store from "../../../../shared/src/store.js";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { notFound } from "../../../../shared/src/index.js";
import { adminDoc } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { actorOf } from "../../middleware/auth.js";
import { epoch, nameMap } from "../../lib/hydrate.js";

export const adminArticles = Router();

adminArticles.get("/", validate.query(schemas.articlesQuery), async (req, res) => {
  const f = req.validQuery;
  const result = await search.searchArticles({
    q: f.q,
    kind: f.kind,
    status: f.status,
    case_id: f.case_id,
    person_id: f.person_id,
    feed_id: f.feed_id,
    from: epoch(f.from),
    to: epoch(f.to),
    limit: f.limit,
    cursor: f.cursor,
    includeDocs: true,
  });

  res.json({
    items: result.items.map(listItem),
    next_cursor: result.next_cursor,
    total: result.total,
  });
});

/**
 * The moderator sees the extracted text — it is working material for deciding
 * what a source says. It never leaves through a public endpoint (produktové
 * zadanie §10: we take facts and link, we do not copy text).
 */
adminArticles.get("/:id", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "article") throw notFound("zdroj");

  // Bez mien je priradenie nečitateľné — a bez konaní, ktoré sa o tento zdroj
  // opierajú, by moderátor to isté rozhodnutie pripojil druhýkrát.
  const proceedings = await queries.proceedingsCitingArticle(doc._id);
  const names = await nameMap([
    ...(doc.case_ids ?? []),
    ...(doc.person_ids ?? []),
    ...(doc.org_ids ?? []),
    ...proceedings.map((p) => p.case_id),
  ]);

  res.json({
    article: adminDoc(doc),
    proceedings: proceedings.map((p) => ({ ...adminDoc(p), case: names[p.case_id] ?? null })),
    names,
  });
});

adminArticles.patch("/:id", validate.body(schemas.articlePatchBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "article") throw notFound("zdroj");

  const { reason, rev, ...patch } = req.body;
  // Linking an article to a case or a person is what turns a candidate into a
  // source; the status follows from it unless the moderator said otherwise.
  if (patch.case_ids || patch.person_ids || patch.org_ids) {
    const linked = [
      ...(patch.case_ids ?? doc.case_ids ?? []),
      ...(patch.person_ids ?? doc.person_ids ?? []),
      ...(patch.org_ids ?? doc.org_ids ?? []),
    ];
    if (!patch.status && linked.length > 0) patch.status = "linked";
  }

  const updated = await store.updateDoc({
    id: doc._id,
    rev,
    patch,
    actor: actorOf(req),
    reason,
  });

  res.json({ article: adminDoc(updated) });
});

/**
 * Manually added source — in the MVP this is how official documents get in
 * (produktové zadanie §7, point 9). The crawler creates media articles; a court
 * decision or a contract is entered by a moderator with a link to the original.
 */
adminArticles.post("/", validate.body(schemas.articleBody), async (req, res) => {
  const doc = await store.createDoc({
    type: "article",
    data: {
      ...req.body,
      status:
        req.body.case_ids.length || req.body.person_ids.length || req.body.org_ids.length
          ? "linked"
          : "processed",
      fetched_at: new Date().toISOString(),
      feed_id: null,
      paywall: false,
    },
    actor: actorOf(req),
    reason: `ručne pridaný zdroj (${req.body.kind})`,
  });

  res.status(201).json({ article: adminDoc(doc) });
});

function listItem(doc) {
  const { body, ...rest } = doc;
  return { ...adminDoc(rest), has_body: typeof body === "string" && body.length > 0 };
}

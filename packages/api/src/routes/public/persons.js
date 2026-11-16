import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as queries from "../../../../shared/src/queries.js";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { notFound } from "../../../../shared/src/index.js";
import { publicEntity, publicRole, publicLink, publicArticle } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { sourceMap, nameMap } from "../../lib/hydrate.js";
import { articlesPage, graphOf, profileCounts } from "../../lib/connections.js";

export const persons = Router();

/**
 * Prijíma id aj slug: verejné adresy sú slugy, ale API ostáva použiteľné aj
 * s identifikátorom.
 */
async function publishedPerson(idOrSlug) {
  const doc = idOrSlug.startsWith("person:")
    ? await couch.get(idOrSlug)
    : await queries.bySlug("person", idOrSlug);
  if (!doc || doc.type !== "person" || doc.publish_state !== "published") {
    throw notFound("osoba");
  }
  return doc;
}

/**
 * Filtering people by party or by case cannot go through Lucene: the relation
 * lives in `link` and `role` documents, and a search index cannot join. Both
 * sets are small — the members of one party, the people in one case — so they
 * are resolved through the views and paginated in memory.
 */
async function byRelation({ party, case_id, role, limit }) {
  let ids;

  if (party) {
    const links = await queries.linksOf(party);
    ids = links
      .filter((l) => l.doc.kind === "member" && !l.doc.valid_to)
      .map((l) => l.other_id)
      .filter((id) => id.startsWith("person:"));
  } else {
    const { roles } = await queries.caseChildren(case_id);
    ids = roles.filter((r) => !role || r.role === role).map((r) => r.person_id);
  }

  const docs = await couch.getMany([...new Set(ids)]);
  const visible = docs.filter((d) => d.publish_state === "published");
  return { items: visible.slice(0, limit).map(publicEntity), next_cursor: null, total: visible.length };
}

persons.get("/", validate.query(schemas.personsQuery), async (req, res) => {
  const f = req.validQuery;

  if (f.party || f.case_id) {
    return res.json(await byRelation(f));
  }

  const result = await search.searchEntities({
    type: "person",
    q: f.q,
    limit: f.limit,
    cursor: f.cursor,
  });
  res.json({ items: result.items, next_cursor: result.next_cursor, total: result.total });
});

persons.get("/:id", async (req, res) => {
  const doc = await publishedPerson(req.params.id);
  const links = await queries.linksOf(doc._id);

  const names = await nameMap(links.map((l) => l.other_id));
  // Links to entities we do not publish are dropped, not rendered as an id.
  const visible = links.filter((l) => names[l.other_id]?.publish_state === "published");

  const [sources, profile] = await Promise.all([
    sourceMap([doc, ...visible.map((l) => l.doc)]),
    profileCounts(doc),
  ]);
  res.json({
    ...publicEntity(doc),
    links: visible.map((l) => ({ ...publicLink(l.doc), other: names[l.other_id] })),
    sources,
    // Hlava profilu (handoff kap. 3): štyri počítadlá a čísla zdrojov popisu.
    counts: profile.counts,
    source_nos: profile.source_nos,
  });
});

persons.get("/:id/cases", async (req, res) => {
  const doc = await publishedPerson(req.params.id);
  const rows = await queries.personCases(doc._id);

  const caseDocs = await couch.getMany([...new Set(rows.map((r) => r.case_id))]);
  const published = caseDocs.filter((c) => c.publish_state === "published");

  res.json({
    items: published.map((c) => ({
      ...publicEntity(c),
      roles: rows.filter((r) => r.case_id === c._id).map((r) => publicRole(r.role)),
    })),
    sources: await sourceMap([...published, ...rows.map((r) => r.role)]),
  });
});

/**
 * Zdroje osoby po stránkach, so stabilným číslom `no` a s tým, čo každý zdroj
 * podopiera (`supports`). Handoff „Červená niť" kap. 7.2.
 */
persons.get("/:id/articles", validate.query(schemas.entityArticlesQuery), async (req, res) => {
  const doc = await publishedPerson(req.params.id);
  res.json(await articlesPage(doc, req.validQuery));
});

/** Graf prepojení do jedného alebo dvoch krokov (kap. 7.1). */
persons.get("/:id/graph", validate.query(schemas.graphQuery), async (req, res) => {
  const doc = await publishedPerson(req.params.id);
  res.json(await graphOf(doc, req.validQuery));
});

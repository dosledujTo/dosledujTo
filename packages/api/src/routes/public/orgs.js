import { Router } from "express";
import { z } from "zod";
import * as couch from "../../../../shared/src/couch.js";
import * as queries from "../../../../shared/src/queries.js";
import * as search from "../../../../shared/src/search.js";
import { notFound } from "../../../../shared/src/index.js";
import { publicEntity, publicLink, publicRole, publicArticle } from "../../../../shared/src/projection.js";
import { ORG_KINDS } from "../../../../shared/src/schemas.js";
import * as validate from "../../middleware/validate.js";
import { nameMap, sourceMap } from "../../lib/hydrate.js";
import { articlesPage, graphOf, profileCounts } from "../../lib/connections.js";
import * as schemas from "../../../../shared/src/schemas.js";

export const orgs = Router();

const orgsQuery = z.object({
  q: z.string().max(200).optional(),
  kind: z.enum(ORG_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  cursor: z.string().max(4000).optional(),
});

// Not in the endpoint list of backend-zadanie.md §5, which has only the detail
// route — but the case filter "podľa politickej strany" needs a list of parties
// to offer, and without this the client would have to hardcode them.
orgs.get("/", validate.query(orgsQuery), async (req, res) => {
  const f = req.validQuery;
  const result = await search.searchEntities({
    type: "org",
    kind: f.kind,
    q: f.q,
    limit: f.limit,
    cursor: f.cursor,
  });
  res.json({ items: result.items, next_cursor: result.next_cursor, total: result.total });
});

/**
 * Prijíma id aj slug — rovnako ako osoby: verejné adresy sú slugy, ale API
 * ostáva použiteľné aj s identifikátorom.
 */
async function publishedOrg(idOrSlug) {
  const doc = idOrSlug.startsWith("org:")
    ? await couch.get(idOrSlug)
    : await queries.bySlug("org", idOrSlug);
  if (!doc || doc.type !== "org" || doc.publish_state !== "published") {
    throw notFound("subjekt");
  }
  return doc;
}

orgs.get("/:id", async (req, res) => {
  const doc = await publishedOrg(req.params.id);

  const links = await queries.linksOf(doc._id);
  const names = await nameMap(links.map((l) => l.other_id));
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

/**
 * Kauzy subjektu — dve rôzne väzby, ktoré sa nesmú zliať do jedného zoznamu:
 *
 *   - `items` — subjekt v kauze **priamo figuruje** a má v nej rolu. Je to
 *     tvrdenie o ňom, so zdrojom a s platnosťou v čase;
 *   - `via_members` — kauzy, ktoré sa strany týkajú **cez jej ľudí** (členstvo).
 *     To nie je tvrdenie o strane; je to odvodená súvislosť a takto sa aj
 *     pomenúva.
 */
orgs.get("/:id/cases", async (req, res) => {
  const doc = await publishedOrg(req.params.id);

  const rows = await queries.entityCases(doc._id);
  const caseDocs = await couch.getMany([...new Set(rows.map((r) => r.case_id))]);
  const published = caseDocs.filter((c) => c.publish_state === "published");

  const viaMembers = await search.searchEntities({ type: "case", party: doc._id, limit: 50 });
  const direct = new Set(published.map((c) => c._id));

  res.json({
    items: published.map((c) => ({
      ...publicEntity(c),
      roles: rows.filter((r) => r.case_id === c._id).map((r) => publicRole(r.role)),
    })),
    via_members: (viaMembers.items ?? []).filter((c) => !direct.has(c.id)),
    sources: await sourceMap([...published, ...rows.map((r) => r.role)]),
  });
});

/** Zdroje subjektu po stránkach, so stabilným číslom (kap. 7.2). */
orgs.get("/:id/articles", validate.query(schemas.entityArticlesQuery), async (req, res) => {
  const doc = await publishedOrg(req.params.id);
  res.json(await articlesPage(doc, req.validQuery));
});

/** Graf prepojení subjektu (kap. 7.1). */
orgs.get("/:id/graph", validate.query(schemas.graphQuery), async (req, res) => {
  const doc = await publishedOrg(req.params.id);
  res.json(await graphOf(doc, req.validQuery));
});

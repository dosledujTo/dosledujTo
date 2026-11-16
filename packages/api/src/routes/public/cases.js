import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as queries from "../../../../shared/src/queries.js";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { notFound } from "../../../../shared/src/index.js";
import {
  publicEntity, publicRole, publicEvent, publicProceeding, publicArticle,
} from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { sourceMap, nameMap, epoch } from "../../lib/hydrate.js";
import { articlesPage, graphOf } from "../../lib/connections.js";
import { entitySources } from "../../../../shared/src/connections.js";
import * as metrics from "../../../../shared/src/metrics.js";
import { config } from "../../../../shared/src/config.js";
import { latestCases } from "../../lib/latest.js";

export const cases = Router();

/**
 * Prijíma id aj slug: verejné adresy sú slugy, ale API ostáva použiteľné aj
 * s identifikátorom.
 */
async function publishedCase(idOrSlug) {
  const doc = idOrSlug.startsWith("case:")
    ? await couch.get(idOrSlug)
    : await queries.bySlug("case", idOrSlug);
  if (!doc || doc.type !== "case" || doc.publish_state !== "published") {
    throw notFound("kauza");
  }
  return doc;
}

cases.get("/", validate.query(schemas.casesQuery), async (req, res) => {
  const f = req.validQuery;

  const result = await search.searchEntities({
    type: "case",
    q: f.q,
    status: f.status,
    phase: f.phase,
    case_kind: f.case_kind,
    party: f.party,
    person_id: f.person_id,
    tag: f.tag,
    amount_min: f.amount_min,
    amount_max: f.amount_max,
    from: epoch(f.from),
    to: epoch(f.to),
    sort: f.sort,
    limit: f.limit,
    cursor: f.cursor,
    // Facet counts come back with the page, so the filter UI costs no second query.
    counts: ["status", "phase", "tag", "kind_main"],
  });

  res.json({
    items: result.items,
    next_cursor: result.next_cursor,
    total: result.total,
    facets: result.counts,
  });
});

// ── Rebríčky titulky (handoff „Červená niť" kap. 5.1, 6) ─────────────────────
// Musia byť pred `/:id`, inak by ich Express prečítal ako slug kauzy.

/** O čom sa najviac píše — `?period=30d|12m|all&limit=5`. */
cases.get("/top", validate.query(schemas.topCasesQuery), async (req, res) => {
  res.json({ items: await metrics.topCases(req.validQuery), period: req.validQuery.period });
});

/** Zabudnuté, ale nevyriešené — `?limit=3`. */
cases.get("/forgotten", validate.query(schemas.limitQuery), async (req, res) => {
  res.json({
    items: await metrics.forgottenCases(req.validQuery),
    rules: { min_articles: config.FORGOTTEN_MIN_ARTICLES, silence_days: config.FORGOTTEN_SILENCE_DAYS },
  });
});

/**
 * Naposledy sa pohlo — posledný článok alebo udalosť, ktorá sa stala
 * (rozhodnutie vlastníka F). Ak verejný údaj kauzy neskôr zmenila revízia,
 * príde aj tá ako `correction` („oprava").
 */
cases.get("/latest", validate.query(schemas.limitQuery), async (req, res) => {
  res.json({ items: await latestCases(req.validQuery.limit) });
});

cases.get("/:id", async (req, res) => {
  const doc = await publishedCase(req.params.id);
  const { roles: allRoles, events, proceedings } = await queries.caseChildren(doc._id);

  const related = (doc.related_case_ids?.sources?.length ? doc.related_case_ids.value : []) ?? [];
  const names = await nameMap([...allRoles.map((r) => r.person_id ?? r.org_id), ...related]);
  // Rola nezverejnenej osoby alebo subjektu sa neukáže — inak by stránka
  // prezradila, že register o niekom vie, hoci o ňom nič nezverejnil.
  const roles = allRoles.filter((r) => names[r.person_id ?? r.org_id]?.publish_state === "published");

  const [sources, { list, numbers }] = await Promise.all([
    sourceMap([doc, ...roles, ...events, ...proceedings]),
    entitySources(doc),
  ]);
  const entities = (key) => [...new Set(roles.map((r) => r[key]).filter(Boolean))].map((id) => names[id]);

  res.json({
    ...publicEntity(doc),
    roles: roles.map(publicRole),
    events: events.map(publicEvent).sort(byDate),
    proceedings: proceedings.map(publicProceeding),
    related_cases: related.map((id) => names[id]).filter((c) => c?.publish_state === "published"),
    persons: entities("person_id"),
    // Subjekty s vlastnou rolou v kauze (handoff kap. 5.2): firma z perexu
    // musí mať záznam a odkaz.
    orgs: entities("org_id"),
    // Every datum's source, resolved once for the whole page.
    sources,
    // Čísla `[n]` rovnaké ako v záložke Zdroje.
    source_nos: Object.fromEntries(Object.keys(sources).map((id) => [id, numbers.get(id) ?? null])),
    sources_total: list.length,
  });
});

cases.get("/:id/timeline", validate.query(schemas.timelineQuery), async (req, res) => {
  const doc = await publishedCase(req.params.id);
  const { events } = await queries.caseChildren(doc._id);

  const wanted = req.validQuery.kind
    ? events.filter((e) => e.kind === req.validQuery.kind)
    : events;

  res.json({
    items: wanted.map(publicEvent).sort(byDate),
    sources: await sourceMap(wanted),
  });
});

cases.get("/:id/persons", async (req, res) => {
  const doc = await publishedCase(req.params.id);
  const { roles } = await queries.caseChildren(doc._id);

  const people = await couch.getMany([...new Set(roles.map((r) => r.person_id))]);
  const visible = people.filter((p) => p.publish_state === "published");

  res.json({
    items: visible.map((person) => ({
      ...publicEntity(person),
      // Current and historical roles alike: an acquittal is as visible as the
      // charge that preceded it (produktové zadanie §6).
      roles: roles.filter((r) => r.person_id === person._id).map(publicRole),
    })),
    sources: await sourceMap([...visible, ...roles]),
  });
});

/** Zdroje kauzy po stránkach, so stabilným číslom (kap. 7.2). */
cases.get("/:id/articles", validate.query(schemas.entityArticlesQuery), async (req, res) => {
  const doc = await publishedCase(req.params.id);
  res.json(await articlesPage(doc, req.validQuery));
});

/** Ľudia a subjekty okolo kauzy, súvisiace kauzy cez spoločných ľudí (kap. 5.2). */
cases.get("/:id/graph", validate.query(schemas.graphQuery), async (req, res) => {
  const doc = await publishedCase(req.params.id);
  res.json(await graphOf(doc, req.validQuery));
});

function byDate(a, b) {
  return String(a.occurred_on).localeCompare(String(b.occurred_on));
}

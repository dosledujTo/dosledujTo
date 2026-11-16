// Stav registra a najbližšie termíny — dve čísla a jeden zoznam, ktoré potrebuje
// titulka. Bez nich by si ich frontend musel poskladať z viacerých volaní alebo
// siahnuť do databázy mimo API.

import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as queries from "../../../../shared/src/queries.js";
import * as metrics from "../../../../shared/src/metrics.js";
import { nameMap } from "../../lib/hydrate.js";
import * as schemas from "../../../../shared/src/schemas.js";
import * as validate from "../../middleware/validate.js";

export const stats = Router();

stats.get("/", async (req, res) => {
  const [coverage, cases, outcomes, buckets, pairs] = await Promise.all([
    queries.coverage(),
    metrics.caseRows(),
    metrics.outcomesByCase(),
    metrics.phaseBuckets(),
    metrics.entityCasePairs(),
  ]);

  const documents = (type, bucket) =>
    coverage.find((row) => row.type === type && row.bucket === bucket)?.documents ?? 0;

  const published = coverage.filter((row) => row.bucket === "published");
  const fields = published.reduce((sum, row) => sum + row.fields, 0);
  const withSource = published.reduce((sum, row) => sum + row.with_source, 0);
  const media = documents("article", "media");
  const official = documents("article", "official");

  // Peniaze v kauzách (kap. 6.1): suma je najvyššia zdrojovaná hodnota,
  // segment podľa fázy z číselníka, pri viacerých obvinených najzávažnejší
  // uzavretý výsledok. Pravidlá sú v `shared/src/metrics.js`.
  const money = metrics.moneyBreakdown(cases, outcomes, buckets);

  // Mená v najviac kauzách — len zverejnené kauzy a zverejnené mená. Výskyt
  // v kauze nie je vina; web to pri zozname hovorí.
  const caseIds = new Set(cases.map((c) => c.id));
  const counts = new Map();
  for (const p of pairs) if (caseIds.has(p.case_id)) counts.set(p.entity, (counts.get(p.entity) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const names = await nameMap(ranked.map(([id]) => id));
  const topEntities = ranked
    .filter(([id]) => names[id]?.publish_state === "published")
    .slice(0, 4)
    .map(([id, n]) => ({ id, type: names[id].type, slug: names[id].slug, name: names[id].name, kind: names[id].kind, cases: n }));

  res.json({
    cases: documents("case", "published"),
    persons: documents("person", "published"),
    orgs: documents("org", "published"),
    sources: media + official,
    // Súčet len tých súm, ktoré majú zdroj — inak by verejné číslo tvrdilo
    // viac, než čím sa dá podložiť.
    amount: money.amount,
    amount_cases: money.cases_with_amount,
    cases_with_amount: money.cases_with_amount,
    amount_closed: money.amount_closed,
    recovered: money.recovered,
    official_share: media + official === 0 ? null : Number((official / (media + official)).toFixed(4)),
    source_coverage: fields === 0 ? null : Number((withSource / fields).toFixed(4)),
    money: {
      buckets: money.buckets,
      amount_open: money.amount_open,
      cases_open: money.cases_open,
      cases_closed: money.cases_closed,
      // Kauzy zaradené odvodene (pravidlo 3), s popisom postupu.
      derived: money.derived,
    },
    non_money: money.non_money,
    top_entities: topEntities,
  });
});

export const events = Router();

/**
 * Časová os dopredu naprieč kauzami. Je to dôvod, prečo si register niekto
 * otvorí druhýkrát — termín pojednávania sa inak dá zistiť len náhodou.
 */
events.get("/upcoming", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 50);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await queries.eventsBetween({ from: today, limit: limit * 4 });
  const expected = rows.filter((event) => event.kind === "expected");

  // Kauzy a konania jedným čítaním — súd udalosti je v konaní (`proceeding_id`).
  const docs = await couch.getMany([
    ...new Set([...expected.map((e) => e.case_id), ...expected.map((e) => e.proceeding_id).filter(Boolean)]),
  ]);
  const byId = new Map(docs.map((doc) => [doc._id, doc]));

  const items = expected
    .filter((event) => byId.get(event.case_id)?.publish_state === "published")
    .slice(0, limit)
    .map((event) => {
      const caseDoc = byId.get(event.case_id);
      return {
        id: event._id,
        occurred_on: event.occurred_on,
        title: event.title,
        category: event.category,
        sources: event.sources ?? [],
        court: event.proceeding_id ? byId.get(event.proceeding_id)?.court ?? null : null,
        case: { id: caseDoc._id, slug: caseDoc.slug, title: caseDoc.title },
      };
    });

  res.json({ items });
});

/**
 * Kalendár „Čo sa chystá" (handoff „Červená niť" kap. 5.6): všetky budúce
 * očakávané udalosti, filter podľa súdu a kauzy, stránkovanie.
 *
 * Budúcich udalostí je málo (desiatky, nie tisíce), preto sa prečítajú jedným
 * dotazom z `by_date/events` a filtrujú v pamäti; kauzy a konania jedným
 * hromadným čítaním. Súd je v konaní, na ktoré udalosť odkazuje
 * (`proceeding_id`, rozhodnutie vlastníka B).
 */
events.get("/calendar", validate.query(schemas.calendarQuery), async (req, res) => {
  const f = req.validQuery;
  const today = new Date().toISOString().slice(0, 10);

  const rows = await queries.eventsBetween({ from: today, limit: 2000 });
  const expected = rows.filter((event) => event.kind === "expected");
  const docs = await couch.getMany([
    ...new Set([...expected.map((e) => e.case_id), ...expected.map((e) => e.proceeding_id).filter(Boolean)]),
  ]);
  const byId = new Map(docs.map((doc) => [doc._id, doc]));

  const all = expected
    .filter((event) => byId.get(event.case_id)?.publish_state === "published")
    .map((event) => {
      const caseDoc = byId.get(event.case_id);
      return {
        id: event._id,
        occurred_on: event.occurred_on,
        title: event.title,
        category: event.category,
        sources: event.sources ?? [],
        court: event.proceeding_id ? byId.get(event.proceeding_id)?.court ?? null : null,
        case: { id: caseDoc._id, slug: caseDoc.slug, title: caseDoc.title },
      };
    });

  const filtered = all.filter((e) =>
    (!f.court || e.court === f.court) && (!f.case || e.case.slug === f.case || e.case.id === f.case));
  const start = (f.page - 1) * f.per_page;

  const count = (key) => {
    const map = new Map();
    for (const e of all) {
      const k = key(e);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };

  res.json({
    items: filtered.slice(start, start + f.per_page),
    total: filtered.length,
    page: f.page,
    per_page: f.per_page,
    pages: Math.max(1, Math.ceil(filtered.length / f.per_page)),
    facets: {
      courts: [...count((e) => e.court)].map(([court, n]) => ({ court, count: n })).sort((a, b) => a.court.localeCompare(b.court, "sk")),
      cases: [...count((e) => e.case.slug)].map(([slug, n]) => ({ slug, title: all.find((e) => e.case.slug === slug).case.title, count: n }))
        .sort((a, b) => a.title.localeCompare(b.title, "sk")),
    },
  });
});

// Spoločné odpovede záložiek profilu: zdroje so stabilným číslom a graf.
// Osoba, subjekt aj kauza ich dávajú rovnako (handoff „Červená niť" kap. 7).

import * as couch from "../../../shared/src/couch.js";
import * as queries from "../../../shared/src/queries.js";
import { entitySources, graph, overlaps, ownDocs } from "../../../shared/src/connections.js";
import { publicArticle } from "../../../shared/src/projection.js";
import { nameMap } from "./hydrate.js";

/**
 * `GET /api/{persons|orgs|cases}/:id/articles` — stránka zdrojov.
 *
 * `no` je poradie v celom nefiltrovanom zozname (úradné prvé, potom od
 * najnovšieho), takže filter ani opačné triedenie číslo nezmenia a `[4]`
 * v Mape je ten istý článok ako `4` tu.
 *
 * @param {Record<string, any>} doc
 * @param {{ page: number, per_page: number, type?: string, case?: string, sort: "asc"|"desc" }} f
 */
export async function articlesPage(doc, f) {
  const { list, supports } = await entitySources(doc);

  let caseId = null;
  if (f.case) {
    caseId = f.case.startsWith("case:") ? f.case : (await queries.bySlug("case", f.case))?._id ?? "case:none";
  }
  let filtered = list.filter((item) =>
    (!f.type || item.kind === f.type) && (!caseId || item.case_ids.includes(caseId)));
  if (f.sort === "asc") filtered = [...filtered].reverse();

  const start = (f.page - 1) * f.per_page;
  const page = filtered.slice(start, start + f.per_page);

  // Dokumenty len pre túto stránku; mená len pre čipy na nej.
  const docs = await couch.getMany(page.map((item) => item.id));
  const byId = new Map(docs.map((d) => [d._id, d]));
  const refs = page.flatMap((item) => (supports.get(item.id) ?? []).flatMap((s) => [s.case_id, s.other_id, s.entity_id]));

  // Kauzy, podľa ktorých sa dá filtrovať — z celého zoznamu, nie zo stránky.
  const caseCounts = new Map();
  for (const item of list) for (const id of item.case_ids) caseCounts.set(id, (caseCounts.get(id) ?? 0) + 1);
  const names = await nameMap([...refs, ...caseCounts.keys()]);
  const brief = (id) => {
    const n = names[id];
    return n && n.publish_state === "published" ? { id, type: n.type, slug: n.slug, name: n.name } : null;
  };

  return {
    items: page
      .filter((item) => byId.has(item.id))
      .map((item) => ({
        ...publicArticle(byId.get(item.id)),
        no: item.no,
        supports: (supports.get(item.id) ?? []).map((s) => ({
          ...s,
          ...(s.case_id ? { case: brief(s.case_id) } : {}),
          ...(s.other_id ? { other: brief(s.other_id) } : {}),
          ...(s.entity_id ? { entity: brief(s.entity_id) } : {}),
        })),
      })),
    total: filtered.length,
    page: f.page,
    per_page: f.per_page,
    pages: Math.max(1, Math.ceil(filtered.length / f.per_page)),
    facets: {
      all: list.length,
      official: list.filter((i) => i.kind === "official").length,
      media: list.filter((i) => i.kind !== "official").length,
      cases: [...caseCounts.entries()]
        .map(([id, count]) => ({ ...brief(id), count }))
        .filter((c) => c.id && c.type === "case" && c.id !== doc._id)
        .sort((a, b) => b.count - a.count),
    },
  };
}

/**
 * `GET /api/{persons|orgs|cases}/:id/graph`.
 *
 * @param {Record<string, any>} doc
 * @param {{ depth: number, active?: boolean, derived?: boolean, cases_only?: boolean, events?: boolean }} f
 */
export async function graphOf(doc, f) {
  const { numbers } = await entitySources(doc);
  const out = await graph(doc, {
    depth: f.depth === 2 ? 2 : 1,
    active: f.active,
    derived: f.derived,
    casesOnly: f.cases_only,
    withEvents: f.events,
    numbers,
  });
  // Prekrytie patrí k záložke V čase (kap. 3.2) — počíta sa len s udalosťami.
  if (f.events) out.insights = await overlaps(doc, { numbers });
  return out;
}

/**
 * Počítadlá do hlavy profilu: kauzy · firmy a strany · ľudia v okolí · zdroje.
 * Ľudia v okolí sú osoby do dvoch krokov (cez spoločnú firmu, stranu alebo
 * kauzu, alebo priamym prepojením), bez stredu.
 *
 * @param {Record<string, any>} doc
 */
export async function profileCounts(doc) {
  const own = await ownDocs(doc);
  const [{ list, numbers }, net] = await Promise.all([
    entitySources(doc, own),
    graph(doc, { depth: 2, limit: Infinity }),
  ]);
  const near = (type, maxDistance) =>
    net.nodes.filter((n) => n.type === type && n.id !== doc._id && n.distance <= maxDistance).length;

  // Čísla zdrojov vlastných polí (popis osoby, subjektu), aby hlava profilu
  // ukázala `[n]` rovnaké ako záložka Zdroje.
  const sourceNos = {};
  for (const value of Object.values(doc)) {
    for (const id of value && typeof value === "object" && Array.isArray(value.sources) ? value.sources : []) {
      if (numbers.has(id)) sourceNos[id] = numbers.get(id);
    }
  }
  return {
    counts: {
      cases: near("case", 1),
      orgs: near("org", 1),
      people: near("person", 2),
      sources: list.length,
    },
    source_nos: sourceNos,
  };
}

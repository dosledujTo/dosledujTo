// Prepojenia a zdroje entity (handoff „Červená niť" kap. 3 a 7.1–7.2).
//
// Dve veci, na ktorých stoja záložky profilu osoby, subjektu aj kauzy:
//
//   - **zdroje so stabilným číslom** — `[4]` v Mape, vo V čase aj v záložke
//     Zdroje je ten istý článok. Číslo sa preto počíta tu, nad celým
//     nefiltrovaným zoznamom, nie na klientovi a nie nad jednou stránkou;
//   - **graf** do jedného alebo dvoch krokov — dávkovo, s pevným počtom dotazov
//     bez ohľadu na veľkosť okolia (žiadne N+1).
//
// Pravidlá, ktoré tu platia a ľahko sa porušia:
//
//   - von ide len to, čo je zverejnené: rola v koncepte kauzy, prepojenie na
//     skrytú osobu ani článok, ktorý cituje len taká rola, sa neukážu — inak by
//     profil prezradil existenciu niečoho, čo register nezverejnil;
//   - hrana osoba ↔ osoba vzniká **len zo skutočného `link`**. Spoločná kauza
//     alebo firma sa nekreslí ako priama hrana, ide vždy cez uzol kauzy alebo
//     firmy — inak by graf tvrdil vzťah, ktorý nikto nepotvrdil;
//   - hrana bez zdroja do grafu nejde (validácia ju aj tak nepustí).

import * as couch from "./couch.js";
import * as queries from "./queries.js";
import { isSourced } from "./sourced.js";

/** Maximálny počet uzlov Siete (kap. 3.3). */
export const GRAPH_LIMIT = 60;

// ── Vlastné dokumenty entity ──────────────────────────────────────────────────

/**
 * Dokumenty, ktoré o entite niečo tvrdia: ona sama, jej roly a prepojenia
 * (osoba, subjekt), resp. roly, udalosti a konania (kauza). Len zverejnené —
 * rola v koncepte kauzy ani prepojenie na skrytú osobu sem nepatria.
 *
 * @param {Record<string, any>} doc
 */
export async function ownDocs(doc) {
  if (doc.type === "case") {
    const { roles, events, proceedings } = await queries.caseChildren(doc._id);
    const names = await nameIndex(roles.map((r) => r.person_id ?? r.org_id));
    return {
      roles: roles.filter((r) => isPublic(names[r.person_id ?? r.org_id])),
      links: [],
      events,
      proceedings,
      names,
    };
  }

  const [caseRows, linkRows] = await Promise.all([queries.entityCases(doc._id), queries.linksOf(doc._id)]);
  const names = await nameIndex([...caseRows.map((r) => r.case_id), ...linkRows.map((l) => l.other_id)]);
  return {
    roles: caseRows.map((r) => r.role).filter((r) => isPublic(names[r.case_id])),
    links: linkRows.filter((l) => isPublic(names[l.other_id])).map((l) => l.doc),
    events: [],
    proceedings: [],
    names,
  };
}

const isPublic = (entry) => entry?.publish_state === "published";

/**
 * Mená a stav zverejnenia pre množinu id jedným čítaním.
 * @param {string[]} ids
 */
async function nameIndex(ids) {
  const docs = await couch.getMany([...new Set(ids.filter(Boolean))]);
  return Object.fromEntries(docs.map((d) => [d._id, describe(d)]));
}

/** Uzol, ako ho vidí verejnosť — meno, slug, a pri kauze to, čo ukazuje karta. */
export function describe(doc) {
  const base = {
    id: doc._id,
    type: doc.type,
    slug: doc.slug ?? null,
    label: doc.title ?? doc.full_name ?? doc.name ?? null,
    publish_state: doc.publish_state ?? null,
  };
  if (doc.type === "org") return { ...base, meta: { kind: doc.kind ?? null } };
  if (doc.type !== "case") return { ...base, meta: {} };
  const sourcedValue = (field) => (isSourced(field) && field.sources.length ? field.value : null);
  return {
    ...base,
    meta: {
      amount: sourcedValue(doc.amount),
      impact: sourcedValue(doc.impact),
      status: sourcedValue(doc.status),
      phase: sourcedValue(doc.phase),
      kind: sourcedValue(doc.kind) ?? [],
    },
  };
}

// ── Zdroje so stabilným číslom (kap. 7.2) ─────────────────────────────────────

/**
 * Čo článok podopiera — z dokumentov entity, v ktorých `sources[]` je jeho id.
 * Štruktúra, nie hotový text: slovenské popisy skladá web, API ostáva zmluvou.
 *
 * @param {Record<string, any>} doc
 * @param {Awaited<ReturnType<typeof ownDocs>>} own
 * @returns {Map<string, any[]>}
 */
function supportsOf(doc, own) {
  /** @type {Map<string, any[]>} */
  const map = new Map();
  const add = (ids, support) => {
    for (const id of ids ?? []) {
      const list = map.get(id) ?? map.set(id, []).get(id);
      if (!list.some((s) => JSON.stringify(s) === JSON.stringify(support))) list.push(support);
    }
  };

  for (const [field, value] of Object.entries(doc)) {
    if (!isSourced(value)) continue;
    add(value.sources, { type: "field", field });
    for (const alt of value.disputed ?? []) add(alt.sources, { type: "field", field, disputed: true });
  }
  for (const r of own.roles) {
    add(r.sources, {
      type: "role", role: r.role, case_id: r.case_id, entity_id: r.person_id ?? r.org_id ?? null,
      valid_from: r.valid_from ?? null, valid_to: r.valid_to ?? null,
    });
  }
  for (const l of own.links) {
    add(l.sources, {
      type: "link", kind: l.kind, other_id: l.from_id === doc._id ? l.to_id : l.from_id,
      valid_from: l.valid_from ?? null, valid_to: l.valid_to ?? null, derived: !!l.derived,
    });
  }
  for (const e of own.events) {
    add(e.sources, { type: "event", title: e.title ?? null, occurred_on: e.occurred_on ?? null, kind: e.kind });
  }
  for (const p of own.proceedings) {
    add(p.sources, { type: "proceeding", court: p.court ?? null, file_number: p.file_number ?? null });
  }
  return map;
}

/**
 * Poradie zdrojov: úradný dokument prvý, potom od najnovšieho, pri zhode `_id`.
 * @param {{ id: string, kind: string, published_at: string|null }} a
 * @param {{ id: string, kind: string, published_at: string|null }} b
 */
export function sourceOrder(a, b) {
  const official = (b.kind === "official") - (a.kind === "official");
  if (official) return official;
  const date = String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""));
  if (date) return date;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Celý zoznam zdrojov entity s číslom `no`. Zdroje osoby a subjektu sú články
 * priradené cez `person_ids`/`org_ids` **plus** články citované v ich rolách a
 * prepojeniach (rozhodnutie vlastníka 15. 11. 2026); pri kauze priradené
 * články plus citované v kauze, rolách, udalostiach a konaniach.
 *
 * Zamietnutý článok sa vynechá, ak ho nič necituje. Citovaný zostáva: podopiera
 * zverejnený údaj a ten musí ostať overiteľný.
 *
 * @param {Record<string, any>} doc
 * @param {Awaited<ReturnType<typeof ownDocs>>} [own]
 */
export async function entitySources(doc, own) {
  own ??= await ownDocs(doc);
  const supports = supportsOf(doc, own);
  const assigned = await queries.allArticlesOfEntity(doc._id);

  /** @type {Map<string, { id: string, kind: string, published_at: string|null, status: string, case_ids: string[] }>} */
  const byId = new Map();
  for (const row of assigned) {
    if (row.status === "rejected" && !supports.has(row.id)) continue;
    byId.set(row.id, {
      id: row.id, kind: row.kind, published_at: row.published_at, status: row.status, case_ids: row.case_ids ?? [],
    });
  }
  const missing = [...supports.keys()].filter((id) => !byId.has(id));
  for (const a of await couch.getMany(missing)) {
    if (a.type !== "article") continue;
    byId.set(a._id, {
      id: a._id, kind: a.kind ?? "media", published_at: a.published_at ?? null, status: a.status, case_ids: a.case_ids ?? [],
    });
  }

  const list = [...byId.values()].sort(sourceOrder).map((item, i) => ({ ...item, no: i + 1 }));
  return { list, supports, own, numbers: new Map(list.map((item) => [item.id, item.no])) };
}

// ── Graf (kap. 7.1) ───────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} center
 * @param {object} [opts]
 * @param {1|2} [opts.depth]
 * @param {boolean} [opts.active]     len platné väzby (bez `valid_to`)
 * @param {boolean} [opts.derived]    false = skryť odvodené
 * @param {boolean} [opts.casesOnly]  len roly v kauzách
 * @param {number} [opts.limit]
 * @param {boolean} [opts.withEvents] udalosti káuz v prvom kroku (záložka V čase)
 * @param {Map<string, number>} [opts.numbers]  čísla zdrojov stredu (z entitySources)
 */
export async function graph(center, opts = {}) {
  const depth = opts.depth === 2 ? 2 : 1;
  const limit = opts.limit ?? GRAPH_LIMIT;

  const keep = (e) =>
    (!opts.active || !e.valid_to) &&
    (opts.derived !== false || !e.derived) &&
    (!opts.casesOnly || e.kind === "role") &&
    e.sources.length > 0;

  // Krok 1 a 2: jeden dotaz na krok. Hrana príde raz za každý koniec v `keys`.
  const edgeMap = new Map();
  const collect = (rows) => {
    for (const e of rows) if (keep(e) && !edgeMap.has(e.edge)) edgeMap.set(e.edge, e);
  };
  const first = await queries.edgesOf([center._id]);
  collect(first);
  const ring1 = new Set();
  for (const e of edgeMap.values()) ring1.add(e.from === center._id ? e.to : e.from);
  if (depth === 2 && ring1.size) collect(await queries.edgesOf([...ring1]));

  // Uzly: jedno hromadné čítanie. Nezverejnené vypadnú aj s hranami.
  const ids = new Set([center._id]);
  for (const e of edgeMap.values()) ids.add(e.from).add(e.to);
  const docs = await couch.getMany([...ids]);
  const nodes = new Map(docs.filter((d) => d._id === center._id || d.publish_state === "published").map((d) => [d._id, describe(d)]));
  let edges = [...edgeMap.values()].filter((e) => nodes.has(e.from) && nodes.has(e.to));

  // Vzdialenosť od stredu (BFS cez povolené hrany).
  const adjacency = new Map();
  for (const e of edges) {
    (adjacency.get(e.from) ?? adjacency.set(e.from, new Set()).get(e.from)).add(e.to);
    (adjacency.get(e.to) ?? adjacency.set(e.to, new Set()).get(e.to)).add(e.from);
  }
  const distance = new Map([[center._id, 0]]);
  let frontier = [center._id];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const id of frontier) {
      for (const other of adjacency.get(id) ?? []) {
        if (!distance.has(other)) {
          distance.set(other, d);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  for (const id of [...nodes.keys()]) if (!distance.has(id)) nodes.delete(id);

  // Orezanie: najdôležitejšie podľa počtu spoločných káuz so stredom; prvý
  // krok má prednosť pred druhým.
  const total = nodes.size;
  if (nodes.size > limit) {
    const centerCases = new Set([...(adjacency.get(center._id) ?? [])].filter((id) => id.startsWith("case:")));
    const shared = (id) => {
      if (id.startsWith("case:")) return centerCases.has(id) ? 1 : 0;
      let n = 0;
      for (const other of adjacency.get(id) ?? []) if (centerCases.has(other)) n++;
      return n;
    };
    const ranked = [...nodes.keys()]
      .filter((id) => id !== center._id)
      .map((id) => ({ id, d: distance.get(id), s: shared(id), degree: (adjacency.get(id) ?? new Set()).size }))
      .sort((a, b) => a.d - b.d || b.s - a.s || b.degree - a.degree || (a.id < b.id ? -1 : 1));
    const kept = new Set([center._id, ...ranked.slice(0, limit - 1).map((r) => r.id)]);
    for (const id of [...nodes.keys()]) if (!kept.has(id)) nodes.delete(id);
  }
  edges = edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));

  // Udalosti káuz prvého kroku (záložka V čase) — jeden dotaz s `keys`.
  let events = null;
  if (opts.withEvents) {
    const caseIds = [...nodes.values()].filter((n) => n.type === "case" && distance.get(n.id) <= 1).map((n) => n.id);
    events = await queries.eventsOfCases(caseIds);
  }

  // Zdroje hrán a udalostí: metadáta jedným čítaním, čísla zo zoznamu
  // zdrojov stredu.
  const numbers = opts.numbers ?? new Map();
  const sourceIds = [...new Set([...edges.flatMap((e) => e.sources), ...(events ?? []).flatMap((e) => e.sources)])];
  const articles = await couch.getMany(sourceIds);
  const sources = Object.fromEntries(
    articles.map((a) => [a._id, {
      no: numbers.get(a._id) ?? null,
      title: a.title ?? null,
      publisher: a.publisher ?? null,
      published_at: a.published_at ?? null,
      url: a.url,
      official: a.kind === "official",
    }]),
  );
  const nos = (ids) => ids.map((id) => numbers.get(id) ?? null);

  const out = {
    nodes: [...nodes.values()].map(({ publish_state, ...n }) => ({ ...n, distance: distance.get(n.id) })),
    edges: edges.map((e) => ({
      id: e.edge, from: e.from, to: e.to, kind: e.kind, role: e.role,
      valid_from: e.valid_from, valid_to: e.valid_to, derived: e.derived, derivation: e.derivation,
      sources: e.sources, source_nos: nos(e.sources),
    })),
    truncated: total > nodes.size ? { shown: nodes.size, total } : null,
    sources,
  };
  if (events) {
    out.events = events.map((e) => ({
      id: e.id, case_id: e.case_id, occurred_on: e.occurred_on, kind: e.kind, category: e.category,
      title: e.title, sources: e.sources, source_nos: nos(e.sources),
    }));
  }

  return out;
}

// ── Prekrytie (kap. 3.2) ──────────────────────────────────────────────────────

const yearOf = (d) => Number(String(d).slice(0, 4));

/**
 * Prekrytie: obdobie väzby osoby na firmu (`link`) sa prekrýva s udalosťou
 * kauzy, v ktorej má **tá firma vlastnú rolu**. Obe tvrdenia musia mať zdroj.
 *
 * Je to **naše tvrdenie** (README §5.10) — dva zdroje spojil register, nie
 * médiá — preto ide von vždy s `derivation` a s oboma zdrojmi. Udalosť
 * v budúcnosti sa nepočíta: prekrytie s niečím, čo sa ešte nestalo, nie je
 * zistenie.
 *
 * Dotazy: hrany firiem jedným `keys`, udalosti ich káuz jedným `keys`, mená
 * jedným `_all_docs` — pevný počet bez ohľadu na počet firiem.
 *
 * @param {Record<string, any>} person
 * @param {{ numbers?: Map<string, number>, today?: string, limit?: number }} [opts]
 */
export async function overlaps(person, opts = {}) {
  if (person.type !== "person") return [];
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const numbers = opts.numbers ?? new Map();

  const own = await queries.edgesOf([person._id]);
  const links = own.filter((e) => e.kind !== "role" && e.sources.length && (e.from === person._id ? e.to : e.from).startsWith("org:"));
  if (links.length === 0) return [];
  const orgIds = [...new Set(links.map((l) => (l.from === person._id ? l.to : l.from)))];

  const orgRoles = (await queries.edgesOf(orgIds)).filter((e) => e.kind === "role" && orgIds.includes(e.from) && e.sources.length);
  if (orgRoles.length === 0) return [];
  const events = await queries.eventsOfCases(orgRoles.map((r) => r.to));
  const names = await nameIndex([...orgIds, ...orgRoles.map((r) => r.to)]);

  const out = [];
  for (const link of links) {
    const org = link.from === person._id ? link.to : link.from;
    if (!isPublic(names[org])) continue;
    const from = link.valid_from ?? "0000";
    const to = link.valid_to ?? today;
    for (const role of orgRoles.filter((r) => r.from === org && isPublic(names[r.to]))) {
      for (const ev of events.filter((e) => e.case_id === role.to && e.sources.length && e.kind === "past")) {
        const day = String(ev.occurred_on).slice(0, 10);
        if (day < from || day > to || day > today) continue;
        out.push({
          org: { id: org, slug: names[org].slug, name: names[org].label },
          case: { id: role.to, slug: names[role.to].slug, name: names[role.to].label },
          link: { id: link.edge, kind: link.kind, valid_from: link.valid_from, valid_to: link.valid_to, derived: link.derived },
          event: { id: ev.id, title: ev.title, category: ev.category, occurred_on: ev.occurred_on },
          sources: [...new Set([...link.sources, ...ev.sources])],
          source_nos: [...new Set([...link.sources, ...ev.sources])].map((id) => numbers.get(id) ?? null),
          derived: true,
          derivation:
            `Obdobie väzby na ${names[org].label} (${from === "0000" ? "?" : yearOf(from)}–${link.valid_to ? yearOf(link.valid_to) : "dnes"}) ` +
            `sa prekrýva s udalosťou „${ev.title ?? ev.category}" (${day}) v kauze, v ktorej má ${names[org].label} vlastnú rolu. ` +
            "Oba údaje majú zdroj; spojil ich register, nie zdroje samotné.",
        });
      }
    }
  }
  // Jedna položka na dvojicu väzba × kauza — najnovšia udalosť.
  const best = new Map();
  for (const o of out.sort((a, b) => String(b.event.occurred_on).localeCompare(String(a.event.occurred_on)))) {
    const key = `${o.link.id}|${o.case.id}`;
    if (!best.has(key)) best.set(key, o);
  }
  return [...best.values()].slice(0, opts.limit ?? 5);
}

// Metriky titulky (handoff „Červená niť" kap. 6): peniaze v kauzách, o čom sa
// najviac píše, zabudnuté kauzy, naposledy sa pohlo, mená v najviac kauzách.
//
// Pravidlá výpočtu sú rozhodnutia, nie fyzika — preto sú tu, v čistých
// funkciách s testami (`test/metrics.test.js`), a web ich vypisuje na
// `/ako-pocitame`. Dáta prichádzajú z view `stats/*`, nikdy z dočítania
// všetkých článkov na každú požiadavku.

import * as couch from "./couch.js";
import * as queries from "./queries.js";
import { config } from "./config.js";

/** Segmenty metriky „Peniaze v kauzách" v poradí na grafe. */
export const BUCKETS = ["none", "investigation", "charge", "trial", "convicted", "acquitted", "discontinued", "lapsed"];
export const CLOSED_BUCKETS = new Set(["convicted", "acquitted", "discontinued", "lapsed"]);
/** Poradie závažnosti uzavretých výsledkov (pravidlo 3). */
const SEVERITY = ["convicted", "acquitted", "discontinued", "lapsed"];

const DAY = 86_400_000;

// ── Pravidlá ──────────────────────────────────────────────────────────────────

/**
 * Do ktorého segmentu kauza patrí.
 *
 *   2. podľa najďalšej fázy, ktorú dosiahla (mapovanie fáza → segment je
 *      v číselníku `phase`, pole `bucket`); bez fázy `none`,
 *   3. uzavretá kauza s viacerými obvinenými s rôznym koncom ide do
 *      najzávažnejšieho uzavretého výsledku (odsúdenie > oslobodenie >
 *      zastavené > premlčané). Ktorý koniec sa týka väčšej časti sumy, zdroje
 *      neuvádzajú — preto poradie, a výsledok je **odvodený** údaj s popisom.
 *
 * @param {{ phase?: string|null, status?: string|null, outcomes?: string[] }} c
 * @param {Record<string, string>} phaseBuckets  kód fázy → segment
 * @returns {{ bucket: string, derived: boolean, derivation: string|null }}
 */
export function caseBucket(c, phaseBuckets) {
  const base = (c.phase && phaseBuckets[c.phase]) || "none";
  const outcomes = [...new Set(c.outcomes ?? [])];
  const closed = CLOSED_BUCKETS.has(base) || c.status === "closed";
  if (!closed || outcomes.length === 0) return { bucket: base, derived: false, derivation: null };

  const candidates = new Set(outcomes);
  if (CLOSED_BUCKETS.has(base)) candidates.add(base);
  const bucket = SEVERITY.find((b) => candidates.has(b)) ?? base;
  if (candidates.size <= 1 && bucket === base) return { bucket, derived: false, derivation: null };
  return {
    bucket,
    derived: true,
    derivation:
      "Viac obvinených s rôznym koncom konania. Zdroje neuvádzajú, ktorý koniec sa týka väčšej časti " +
      "sumy, preto je kauza zaradená podľa najzávažnejšieho uzavretého výsledku v poradí odsúdenie > " +
      "oslobodenie > zastavené > premlčané.",
  };
}

/**
 * Peniaze v kauzách (kap. 6.1).
 *
 * @param {Array<{ id: string, amount: number|null, recovered: number|null, phase: string|null,
 *   status: string|null, kinds: string[] }>} cases
 * @param {Map<string, string[]>} outcomes  kauza → konečné výsledky rolí
 * @param {Record<string, string>} phaseBuckets
 */
export function moneyBreakdown(cases, outcomes, phaseBuckets) {
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, { bucket: b, group: CLOSED_BUCKETS.has(b) ? "closed" : "open", amount: 0, cases: 0 }]));
  const nonMoney = new Map();
  const derived = [];
  let recovered = 0;

  for (const c of cases) {
    if (typeof c.recovered === "number") recovered += c.recovered;
    if (typeof c.amount !== "number" || c.amount <= 0) {
      const kind = c.kinds?.[0] ?? "other";
      nonMoney.set(kind, (nonMoney.get(kind) ?? 0) + 1);
      continue;
    }
    const b = caseBucket({ phase: c.phase, status: c.status, outcomes: outcomes.get(c.id) }, phaseBuckets);
    buckets[b.bucket].amount += c.amount;
    buckets[b.bucket].cases += 1;
    if (b.derived) derived.push({ id: c.id, bucket: b.bucket, derivation: b.derivation });
  }

  const list = BUCKETS.map((b) => buckets[b]);
  const sum = (group) => list.filter((b) => b.group === group).reduce((s, b) => s + b.amount, 0);
  const count = (group) => list.filter((b) => b.group === group).reduce((s, b) => s + b.cases, 0);
  return {
    amount: sum("open") + sum("closed"),
    amount_open: sum("open"),
    amount_closed: sum("closed"),
    cases_with_amount: count("open") + count("closed"),
    cases_open: count("open"),
    cases_closed: count("closed"),
    recovered,
    buckets: list,
    non_money: [...nonMoney.entries()].map(([kind, n]) => ({ kind, cases: n })).sort((a, b) => b.cases - a.cases),
    derived,
  };
}

/**
 * Skóre „najviac sa píše" (kap. 6.2): počet článkov × (rôzni vydavatelia /
 * články)^0,5. Kauzu tak nevytiahne jedno médium, ktoré o nej píše každý deň:
 * 30 článkov z jedného média má skóre ~5,5, 10 článkov z 10 médií 10.
 *
 * @param {number} articles
 * @param {number} publishers
 */
export function buzzScore(articles, publishers) {
  if (!articles) return 0;
  return articles * Math.sqrt(Math.min(publishers, articles) / articles);
}

/**
 * Zabudnutá kauza (kap. 6.3): otvorená, aspoň `minArticles` článkov celkovo a
 * za posledných `silenceDays` dní žiadny. Udalosti zo súdu sa nerátajú —
 * ráta sa len mediálne ticho.
 *
 * @param {{ open: boolean, total: number, lastArticle: string|null }} c
 * @param {{ now: string, minArticles: number, silenceDays: number }} opts
 */
export function isForgotten(c, { now, minArticles, silenceDays }) {
  if (!c.open || c.total < minArticles || !c.lastArticle) return false;
  return Date.parse(now) - Date.parse(c.lastArticle) > silenceDays * DAY;
}

/**
 * 24 mesačných počtov končiacich mesiacom `now` (krivka `Spark`).
 * @param {Array<{ day: string, count: number }>} rows
 * @param {string} now
 */
export function spark(rows, now) {
  const end = new Date(`${now.slice(0, 7)}-01T00:00:00Z`);
  const months = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const index = new Map(months.map((m, i) => [m, i]));
  const out = new Array(24).fill(0);
  for (const r of rows) {
    const i = index.get(r.day.slice(0, 7));
    if (i !== undefined) out[i] += r.count;
  }
  return out;
}

// ── Načítanie z view ─────────────────────────────────────────────────────────

/** Zverejnené kauzy s údajmi pre metriky — jeden dotaz. */
export async function caseRows() {
  const res = await couch.view("stats", "cases", {});
  return res.rows.map((row) => ({ id: row.id, ...row.value }));
}

/** Konečné výsledky rolí po kauzách. */
export async function outcomesByCase() {
  const res = await couch.view("stats", "outcomes", {});
  const map = new Map();
  for (const row of res.rows) (map.get(row.key) ?? map.set(row.key, []).get(row.key)).push(row.value);
  return map;
}

/** Mapovanie fáza → segment z číselníka. */
export async function phaseBuckets() {
  const docs = await queries.codelist("phase");
  return Object.fromEntries(docs.filter((d) => d.bucket).map((d) => [d.code, d.bucket]));
}

/**
 * Články po kauzách, dňoch a vydavateľoch.
 * @returns {Promise<Map<string, Array<{ day: string, publisher: string, count: number }>>>}
 */
export async function articleDays() {
  const res = await couch.view("stats", "articles_by_case_day", { group_level: 3 });
  const map = new Map();
  for (const row of res.rows) {
    const [caseId, day, publisher] = row.key;
    (map.get(caseId) ?? map.set(caseId, []).get(caseId)).push({ day, publisher, count: row.value });
  }
  return map;
}

/** Dvojice entita × kauza. */
export async function entityCasePairs() {
  const res = await couch.view("stats", "entity_cases", { group_level: 2 });
  return res.rows.map((row) => ({ entity: row.key[0], case_id: row.key[1] }));
}

// ── Odpovede ──────────────────────────────────────────────────────────────────

const PERIODS = { "30d": 30, "12m": 365, all: null };

/**
 * O čom sa najviac píše.
 * @param {{ period: "30d"|"12m"|"all", limit: number, now?: string }} opts
 */
export async function topCases({ period, limit, now = new Date().toISOString().slice(0, 10) }) {
  const [cases, days, outcomes, buckets] = await Promise.all([caseRows(), articleDays(), outcomesByCase(), phaseBuckets()]);
  const span = PERIODS[period];
  const from = span ? new Date(Date.parse(now) - span * DAY).toISOString().slice(0, 10) : "0000";
  const prevFrom = span ? new Date(Date.parse(now) - 2 * span * DAY).toISOString().slice(0, 10) : null;

  const items = cases.map((c) => {
    const rows = days.get(c.id) ?? [];
    const cur = rows.filter((r) => r.day > from && r.day <= now);
    const prev = prevFrom ? rows.filter((r) => r.day > prevFrom && r.day <= from) : [];
    const articles = cur.reduce((s, r) => s + r.count, 0);
    const publishers = new Set(cur.map((r) => r.publisher)).size;
    const before = prev.reduce((s, r) => s + r.count, 0);
    return {
      ...card(c, outcomes, buckets),
      articles,
      publishers,
      score: Number(buzzScore(articles, publishers).toFixed(3)),
      trend: span && before > 0 ? Math.round(((articles - before) / before) * 100) : null,
      spark: spark(rows, now),
    };
  });
  return items
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score || b.articles - a.articles || a.title.localeCompare(b.title, "sk"))
    .slice(0, limit);
}

/**
 * Zabudnuté, ale nevyriešené.
 * @param {{ limit: number, now?: string }} opts
 */
export async function forgottenCases({ limit, now = new Date().toISOString().slice(0, 10) }) {
  const [cases, days, outcomes, buckets] = await Promise.all([caseRows(), articleDays(), outcomesByCase(), phaseBuckets()]);
  const opts = { now, minArticles: config.FORGOTTEN_MIN_ARTICLES, silenceDays: config.FORGOTTEN_SILENCE_DAYS };
  const out = [];
  for (const c of cases) {
    const rows = days.get(c.id) ?? [];
    const total = rows.reduce((s, r) => s + r.count, 0);
    const sorted = rows.map((r) => r.day).sort();
    const info = card(c, outcomes, buckets);
    const candidate = { open: !CLOSED_BUCKETS.has(info.bucket) && c.status !== "closed", total, lastArticle: sorted.at(-1) ?? null };
    if (!isForgotten(candidate, opts)) continue;
    out.push({
      ...info,
      total_articles: total,
      first_article: sorted[0],
      last_article: candidate.lastArticle,
      months_silent: Math.floor((Date.parse(now) - Date.parse(candidate.lastArticle)) / (30.44 * DAY)),
      spark: spark(rows, now),
    });
  }
  return out.sort((a, b) => b.total_articles - a.total_articles).slice(0, limit);
}

/**
 * Údaje kauzy na kartu a do rebríčkov — všetko so zdrojom (view berie len
 * zdrojované hodnoty).
 */
function card(c, outcomes, buckets) {
  const b = caseBucket({ phase: c.phase, status: c.status, outcomes: outcomes.get(c.id) }, buckets);
  return {
    id: c.id, slug: c.slug, title: c.title, summary: c.summary ?? null,
    amount: c.amount, disputed: !!c.disputed, impact: c.impact ?? null, kinds: c.kinds ?? [],
    phase: c.phase, status: c.status, bucket: b.bucket,
  };
}

export { card as caseCard };

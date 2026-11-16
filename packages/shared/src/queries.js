// Reads that Lucene cannot do: relations and aggregates, through map/reduce
// views (backend-zadanie.md §2.3).

import * as couch from "./couch.js";

/**
 * Roles, events and proceedings of a case — **one** query, not three, and never
 * N+1 (backend-zadanie.md §5).
 *
 * @param {string} caseId
 * @returns {Promise<{roles: any[], events: any[], proceedings: any[]}>}
 */
export async function caseChildren(caseId) {
  const res = await couch.view("by_case", "children", {
    startkey: [caseId],
    endkey: [caseId, {}],
    include_docs: true,
  });

  const out = { roles: [], events: [], proceedings: [] };
  for (const row of res.rows) {
    const kind = row.key[1];
    if (kind === "role") out.roles.push(row.doc);
    else if (kind === "event") out.events.push(row.doc);
    else if (kind === "proceeding") out.proceedings.push(row.doc);
  }
  return out;
}

/**
 * Cases an entity appears in, current and historical roles alike.
 *
 * Rola viaže ku kauze osobu **alebo** subjekt, takže tento dotaz odpovedá pre
 * oboje; view sa stále volá `by_person/cases`, lebo premenovanie by stálo
 * prestavbu indexu bez inej zmeny.
 *
 * @param {string} entityId  `person:…` alebo `org:…`
 */
export async function personCases(entityId) {
  const res = await couch.view("by_person", "cases", {
    startkey: [entityId],
    endkey: [entityId, {}],
    include_docs: true,
  });
  return res.rows.map((row) => ({ case_id: row.key[1], role: row.doc }));
}

/** Čitateľnejšie meno pre to isté — rola už nie je len o osobách. */
export const entityCases = personCases;

/**
 * Subscribers of a target, for the notifier.
 * @param {"case"|"person"|"org"} targetType
 * @param {string} targetId
 */
export async function subscribersOf(targetType, targetId) {
  const res = await couch.view("by_target", "subscriptions", {
    startkey: [targetType, targetId],
    endkey: [targetType, targetId, {}],
    include_docs: true,
  });
  return res.rows.map((row) => row.doc);
}

/**
 * CouchDB has no unique constraint; this is the check before insert.
 *
 * @param {"case"|"person"|"org"} type
 * @param {string} slug
 * @param {string} [exceptId]  Id allowed to hold the slug (when renaming).
 */
export async function slugTaken(type, slug, exceptId) {
  const res = await couch.view("slugs", "unique", {
    key: [type, slug],
    reduce: false,
  });
  return res.rows.some((row) => row.value !== exceptId);
}

/**
 * Sourcing coverage per document type (produktové zadanie §9).
 * Slots: [docs, sourced fields, with source, derived, disputed].
 */
export async function coverage() {
  const res = await couch.view("stats", "coverage", { group_level: 2, reduce: true });
  return res.rows.map((row) => ({
    type: row.key[0],
    bucket: row.key[1],
    documents: row.value[0],
    fields: row.value[1],
    with_source: row.value[2],
    derived: row.value[3],
    disputed: row.value[4],
  }));
}

/**
 * Objem peňazí v kauzách podľa publikačného stavu.
 * @returns {Promise<Record<string, { cases: number, total: number, withAmount: number }>>}
 */
export async function amounts() {
  const res = await couch.view("stats", "amounts", { group: true, reduce: true });
  const out = {};
  for (const row of res.rows) {
    out[row.key] = { cases: row.value[0], total: row.value[1], withAmount: row.value[2] };
  }
  return out;
}

/**
 * Find an article by its canonical URL or by the guid its feed gave it.
 *
 * Deduplication has to be exact and immediately consistent, so it goes through
 * a view rather than the search index — the crawler asks this question once per
 * feed item, right before deciding whether to write.
 *
 * @param {string} url
 * @returns {Promise<{ id: string, status: string }|null>}
 */
export async function articleByUrl(url) {
  const res = await couch.view("by_article", "url", { key: url, limit: 1 });
  const row = res.rows[0];
  return row ? { id: row.id, status: row.value.status } : null;
}

/**
 * Všetky súdne konania, zoradené podľa súdu a spisovej značky.
 * @param {{ court?: string, limit?: number }} [opts]
 */
export async function allProceedings(opts = {}) {
  // `by_court` má reduce `_count` (počty konaní pre číselník súdov), takže
  // zoznam si ho musí vypnúť — inak by CouchDB vrátil súčet, nie riadky.
  const params = { include_docs: true, reduce: false, limit: opts.limit ?? 200 };
  if (opts.court) {
    params.startkey = [opts.court];
    params.endkey = [opts.court, {}];
  }
  const res = await couch.view("proceedings", "by_court", params);
  return res.rows.map((row) => row.doc);
}

/**
 * Konanie podľa spisovej značky — jediný praktický kľúč na spárovanie
 * anonymizovaného rozhodnutia s kauzou (produktové zadanie §5.10).
 * @param {string} fileNumber
 */
export async function proceedingByFileNumber(fileNumber) {
  const res = await couch.view("proceedings", "by_file_number", {
    key: String(fileNumber).trim(),
    include_docs: true,
    limit: 1,
  });
  return res.rows[0]?.doc ?? null;
}

/**
 * Dokument podľa sluggu. Verejné URL sú `/kauza/kauza-testovaci-most`, nie
 * `/kauza/case:0192a1b0-…` — čitateľná adresa je súčasť toho, že sa dá kauza
 * poslať ďalej.
 *
 * @param {"case"|"person"|"org"} type
 * @param {string} slug
 * @returns {Promise<any|null>}
 */
export async function bySlug(type, slug) {
  const res = await couch.view("slugs", "unique", { key: [type, slug], reduce: false, limit: 1 });
  const id = res.rows[0]?.value;
  return id ? couch.get(id) : null;
}

/**
 * Udalosti v časovom rozsahu naprieč kauzami — pre „najbližšie pojednávania"
 * a „posledný pohyb" na titulke.
 *
 * @param {{ from?: string, to?: string, limit?: number, descending?: boolean }} opts
 */
export async function eventsBetween(opts = {}) {
  const params = {
    include_docs: true,
    limit: opts.limit ?? 10,
    descending: !!opts.descending,
  };
  if (opts.descending) {
    params.startkey = opts.to ?? "9999";
    params.endkey = opts.from ?? "0000";
  } else {
    params.startkey = opts.from ?? "0000";
    params.endkey = opts.to ?? "9999";
  }

  const res = await couch.view("by_date", "events", params);
  return res.rows.map((row) => ({ ...row.doc, occurred_on: row.key }));
}

/**
 * Look up a user by e-mail. CouchDB has no unique index, so uniqueness is held
 * by the check before insert — and remains auditable afterwards through the
 * same view.
 *
 * @param {string} email
 * @returns {Promise<any|null>}
 */
export async function userByEmail(email) {
  const res = await couch.view("by_user", "by_email", {
    key: String(email).toLowerCase(),
    include_docs: true,
  });
  return res.rows[0]?.doc ?? null;
}

/**
 * Links touching an entity, from either end.
 * @param {string} id  person, org — any end of a `link`
 */
export async function linksOf(id) {
  const res = await couch.view("by_person", "links", {
    startkey: [id],
    endkey: [id, {}],
    include_docs: true,
  });
  // Both ends are emitted, so a self-link would appear twice.
  const seen = new Set();
  return res.rows
    .filter((row) => !seen.has(row.id) && seen.add(row.id))
    .map((row) => ({ direction: row.key[1], other_id: row.value.other_id, doc: row.doc }));
}

/** @param {string} userId */
export async function subscriptionsOfUser(userId) {
  const res = await couch.view("by_user", "subscriptions", {
    startkey: [userId],
    endkey: [userId, {}],
    include_docs: true,
  });
  return res.rows.map((row) => row.doc);
}

/**
 * @param {string} userId
 * @param {{ state?: string, limit?: number }} [opts]
 */
export async function notificationsOfUser(userId, opts = {}) {
  const res = await couch.view("by_user", "notifications", {
    startkey: [userId, {}],
    endkey: [userId],
    descending: true,
    include_docs: true,
    limit: opts.limit ?? 20,
  });
  const docs = res.rows.map((row) => row.doc);
  return opts.state ? docs.filter((d) => d.state === opts.state) : docs;
}

/**
 * The full revision chain of a document, oldest first. Complete from creation,
 * which is what makes a revert a replay rather than a guess.
 *
 * @param {string} targetId
 */
export async function revisionsOfTarget(targetId) {
  const res = await couch.view("revisions", "by_target", {
    startkey: [targetId],
    endkey: [targetId, {}],
    include_docs: true,
  });
  return res.rows.map((row) => row.doc);
}

/**
 * @param {string} actorId
 * @param {{ limit?: number }} [opts]
 */
export async function revisionsOfActor(actorId, opts = {}) {
  const res = await couch.view("revisions", "by_actor", {
    startkey: [actorId, {}],
    endkey: [actorId],
    descending: true,
    include_docs: true,
    limit: opts.limit ?? 50,
  });
  return res.rows.map((row) => row.doc);
}

/**
 * Jeden číselník, zoradený tak, ako ho vidí moderátor vo formulári: podľa
 * `sort`, pri zhode podľa názvu. Neaktívne položky sú súčasťou výsledku —
 * administrácia ich musí ukázať, hoci ich už neponúka.
 *
 * @param {string} [kind]  `court | case_tag | event_category | link_type`
 */
export async function codelist(kind) {
  const params = { include_docs: true, reduce: false, limit: 1000 };
  if (kind) {
    params.startkey = [kind];
    params.endkey = [kind, {}];
  }
  const res = await couch.view("codelists", "by_kind", params);
  return res.rows.map((row) => row.doc);
}

/**
 * Koľko káuz nesie ktorý tag. Tag je v kauze obyčajný reťazec, takže bez tohto
 * počtu je číselník tagov zoznam slov, o ktorom nikto nevie, či sa používa.
 *
 * @returns {Promise<Record<string, number>>}
 */
export async function tagUsage() {
  const res = await couch.view("codelists", "tag_usage", { group: true });
  return Object.fromEntries(res.rows.map((row) => [row.key, row.value]));
}

/**
 * Koľko konaní je vedených na ktorom súde — rovnaký dôvod ako pri tagoch, a
 * navyše to ukáže súdy zapísané mimo číselníka.
 *
 * @returns {Promise<Record<string, number>>}
 */
export async function courtUsage() {
  const res = await couch.view("proceedings", "by_court", { group_level: 1 });
  return Object.fromEntries(res.rows.map((row) => [row.key[0], row.value]));
}


/**
 * Články priradené ku kauze, osobe alebo subjektu.
 *
 * Ide o väzbu, nie o hľadanie: odpoveď musí byť presná hneď po uložení, takže
 * view, nie Clouseau (`couch/databases/.../by_article/views/entity`).
 *
 * @param {string} entityId
 * @param {{ limit?: number }} [opts]
 */
export async function articlesOfEntity(entityId, opts = {}) {
  const res = await couch.view("by_article", "entity", {
    startkey: [entityId, {}],
    endkey: [entityId],
    descending: true,
    limit: opts.limit ?? 100,
  });
  return res.rows.map((row) => ({ id: row.id, ...row.value }));
}

/**
 * Konania, v ktorých je entita vedená menovite.
 * @param {string} entityId
 */
export async function proceedingsOfEntity(entityId) {
  const res = await couch.view("proceedings", "by_entity", {
    startkey: [entityId],
    endkey: [entityId, {}],
    include_docs: true,
  });
  return res.rows.map((row) => row.doc);
}

/**
 * Konania, ktoré sa opierajú o tento článok — aby ho moderátor nepripájal
 * druhýkrát.
 * @param {string} articleId
 */
export async function proceedingsCitingArticle(articleId) {
  const res = await couch.view("proceedings", "by_source", {
    key: articleId,
    include_docs: true,
  });
  return res.rows.map((row) => row.doc);
}

// ── Prepojenia (handoff „Červená niť" kap. 7) ────────────────────────────────

/**
 * Hrany grafu (`link` aj `role`) pre viac entít naraz — jeden dotaz s `keys`,
 * nie dotaz na uzol. Každá hrana príde raz za každý koniec, ktorý je v `ids`;
 * odstránenie duplicít je na volajúcom.
 *
 * @param {string[]} ids
 * @returns {Promise<Array<{ key: string, edge: string, kind: string, role: string|null,
 *   from: string, to: string, valid_from: string|null, valid_to: string|null,
 *   derived: boolean, derivation: string|null, sources: string[] }>>}
 */
export async function edgesOf(ids) {
  const keys = [...new Set(ids.filter(Boolean))];
  if (keys.length === 0) return [];
  const res = await couch.view("graph", "edges", { keys });
  return res.rows.map((row) => ({ key: row.key, ...row.value }));
}

/**
 * Udalosti viacerých káuz jedným dotazom.
 * @param {string[]} caseIds
 */
export async function eventsOfCases(caseIds) {
  const keys = [...new Set(caseIds.filter(Boolean))];
  if (keys.length === 0) return [];
  const res = await couch.view("graph", "events", { keys });
  return res.rows.map((row) => ({ id: row.id, case_id: row.key, ...row.value }));
}

/**
 * Všetky články priradené k entite, bez limitu — zoznam zdrojov sa čísluje nad
 * celým zoznamom, takže polovičný zoznam by dal iné čísla.
 *
 * @param {string} entityId
 */
export async function allArticlesOfEntity(entityId) {
  const res = await couch.view("by_article", "entity", {
    startkey: [entityId],
    endkey: [entityId, {}],
  });
  return res.rows.map((row) => ({ id: row.id, ...row.value }));
}

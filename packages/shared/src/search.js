// `_search` wrappers. The bookmark Clouseau returns is the API's `next_cursor`
// (backend-zadanie.md §4) — opaque to the client, which is the point: it cannot
// be turned into an offset scan.

import * as couch from "./couch.js";
import { and, or, term, range, freeText, sortBy } from "./lucene.js";

export const MAX_LIMIT = 200;

/**
 * @param {object} args
 * @param {string} args.index      entities | articles | moderation
 * @param {string} args.q          Composed by the server, never by the client.
 * @param {number} [args.limit]
 * @param {string} [args.cursor]   Bookmark from a previous response.
 * @param {string} [args.sort]
 * @param {string[]} [args.counts] Facet fields.
 * @param {boolean} [args.includeDocs]
 */
export async function query({ index, q, limit = 20, cursor, sort, counts, includeDocs = false }) {
  const params = {
    q,
    limit: Math.min(Math.max(Number(limit) || 20, 1), MAX_LIMIT),
    include_docs: includeDocs,
  };
  if (cursor) params.bookmark = cursor;
  if (sort) params.sort = sort;
  if (counts) params.counts = counts;

  // Faseta, ktorú ešte nemá žiadny dokument (napr. `kind_main` pred prvou
  // kauzou s druhom), je pre Clouseau chyba `dim "x" does not exist`. Pre
  // čitateľa je to prázdna faseta — preto sa dotaz zopakuje bez nej a faseta
  // sa vráti ako prázdna, namiesto 500 na celej stránke.
  const missing = [];
  let res;
  for (;;) {
    try {
      res = await couch.search("search", index, params);
      break;
    } catch (err) {
      const dim = /dim "([^"]+)" does not exist/.exec(err?.message ?? "")?.[1];
      if (!dim || !params.counts?.includes(dim)) throw err;
      missing.push(dim);
      params.counts = params.counts.filter((c) => c !== dim);
      if (params.counts.length === 0) delete params.counts;
    }
  }

  let resCounts = res.counts ?? null;
  if (missing.length > 0) {
    resCounts = { ...resCounts };
    for (const dim of missing) resCounts[dim] = {};
  }

  return {
    items: res.rows.map((row) => (includeDocs ? row.doc : { id: row.id, ...row.fields })),
    next_cursor: res.rows.length === params.limit ? res.bookmark : null,
    total: res.total_rows ?? null,
    counts: resCounts,
  };
}

/** Text fields the free-text query runs against, in the entities index. */
const ENTITY_TEXT_FIELDS = ["text", "title_fold", "variant_fold", "summary_fold"];

/**
 * Public entity search and the filtering behind `/api/cases` and `/api/persons`.
 * Every parameter is a named filter; the caller cannot inject query syntax.
 *
 * @param {object} f
 * @param {"case"|"person"|"org"} [f.type]
 * @param {string} [f.q]
 * @param {string} [f.status]
 * @param {string} [f.phase]
 * @param {string} [f.case_kind]    druh kauzy (ktorýkoľvek z jej druhov)
 * @param {string} [f.party]        org id of a political party
 * @param {string} [f.person_id]
 * @param {string} [f.tag]
 * @param {number} [f.amount_min]   in cents
 * @param {number} [f.amount_max]
 * @param {number} [f.from]         epoch ms, on started_on
 * @param {number} [f.to]
 * @param {boolean} [f.includeUnpublished]  Admin reads only.
 * @param {"updated"|"amount"|"started"|"relevance"} [f.sort]
 * @param {number} [f.limit]
 * @param {string} [f.cursor]
 * @param {string[]} [f.counts]
 */
export async function searchEntities(f = {}) {
  const clauses = [
    f.type ? term("type", f.type) : null,
    // Verejné čítanie vidí len publikované. Administrácia si pýta konkrétny
    // stav, alebo všetky — ale nikdy nie implicitne.
    f.publish_state
      ? term("publish_state", f.publish_state)
      : f.includeUnpublished
        ? null
        : term("publish_state", "published"),
    f.status ? term("status", f.status) : null,
    f.phase ? term("phase", f.phase) : null,
    f.case_kind ? term("case_kind", f.case_kind) : null,
    f.party ? term("party_id", f.party) : null,
    f.person_id ? term("person_id", f.person_id) : null,
    // „Len moje kauzy" — najdôležitejší filter v administrácii (§5.1).
    f.moderator_id ? term("moderator_id", f.moderator_id) : null,
    f.has_moderator ? term("has_moderator", f.has_moderator) : null,
    f.tag ? term("tag", f.tag) : null,
    f.kind ? term("kind", f.kind) : null,
    f.amount_min != null || f.amount_max != null
      ? range("amount", f.amount_min ?? null, f.amount_max ?? null)
      : null,
    f.from != null || f.to != null ? range("started_on", f.from ?? null, f.to ?? null) : null,
    f.q ? freeText(f.q, ENTITY_TEXT_FIELDS) : null,
  ];

  const sorts = {
    updated: sortBy("updated_at", "desc"),
    amount: sortBy("amount", "desc"),
    started: sortBy("started_on", "desc"),
    relevance: undefined,
  };

  return query({
    index: "entities",
    q: and(...clauses),
    sort: sorts[f.sort ?? (f.q ? "relevance" : "updated")],
    limit: f.limit,
    cursor: f.cursor,
    counts: f.counts,
    includeDocs: f.includeDocs ?? false,
  });
}

/**
 * Articles — sources, media and official alike.
 *
 * @param {object} f
 * @param {string} [f.q]
 * @param {"media"|"official"} [f.kind]
 * @param {string} [f.status]
 * @param {string} [f.case_id]
 * @param {string} [f.person_id]
 * @param {string} [f.feed_id]
 * @param {number} [f.from] epoch ms on published_at
 * @param {number} [f.to]
 */
export async function searchArticles(f = {}) {
  const clauses = [
    f.kind ? term("kind", f.kind) : null,
    f.status ? term("status", f.status) : null,
    f.case_id ? term("case_id", f.case_id) : null,
    f.person_id ? term("person_id", f.person_id) : null,
    f.feed_id ? term("feed_id", f.feed_id) : null,
    f.from != null || f.to != null
      ? range("published_at", f.from ?? null, f.to ?? null)
      : null,
    // `excerpt_fold` je nutné: články z kroku 1 nemajú `body`, len perex z feedu.
    f.q ? freeText(f.q, ["title_fold", "excerpt_fold", "body_fold"]) : null,
  ];

  return query({
    index: "articles",
    q: and(...clauses),
    sort: f.sort === "relevance" ? undefined : sortBy("published_at", "desc"),
    limit: f.limit,
    cursor: f.cursor,
    includeDocs: f.includeDocs ?? false,
  });
}

/**
 * The moderator queue.
 *
 * @param {object} f
 * @param {string} [f.status]
 * @param {"user"|"bot"} [f.origin]
 * @param {string} [f.target_type]
 * @param {string} [f.target_id]
 * @param {string} [f.author_id]
 */
export async function searchSuggestions(f = {}) {
  const clauses = [
    f.status ? term("status", f.status) : null,
    f.origin ? term("origin", f.origin) : null,
    f.target_type ? term("target_type", f.target_type) : null,
    f.target_id ? term("target_id", f.target_id) : null,
    f.author_id ? term("author_id", f.author_id) : null,
  ];

  return query({
    index: "moderation",
    q: and(...clauses),
    sort: sortBy("created_at", "desc"),
    limit: f.limit,
    cursor: f.cursor,
    counts: f.counts,
    includeDocs: f.includeDocs ?? true,
  });
}

export { and, or, term, range, freeText, sortBy };

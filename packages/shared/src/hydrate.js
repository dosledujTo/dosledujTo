// Turning source ids into something a reader can click.
//
// "Zdroj je viditeľný priamo pri údaji, nie schovaný v poznámke pod čiarou"
// (produktové zadanie §4.6). The API therefore returns every referenced source
// alongside the entity, resolved in one bulk read — a case page must not cost
// one request per footnote.

import * as couch from "./couch.js";
import { publicArticle } from "./projection.js";
import { isSourced } from "./sourced.js";

/**
 * Collect every source id referenced by a set of documents: from sourced
 * fields, from their disputed alternatives, and from root-level `sources`.
 *
 * @param {Array<Record<string, any>>} docs
 * @returns {string[]}
 */
export function collectSourceIds(docs) {
  const ids = new Set();

  for (const doc of docs) {
    if (!doc) continue;
    for (const [key, value] of Object.entries(doc)) {
      if (key === "sources" && Array.isArray(value)) {
        for (const id of value) ids.add(id);
        continue;
      }
      if (!isSourced(value)) continue;
      for (const id of value.sources) ids.add(id);
      for (const alt of value.disputed ?? []) {
        for (const id of alt.sources ?? []) ids.add(id);
      }
    }
  }
  return [...ids];
}

/**
 * `{ "article:018f…": { title, publisher, url, … } }` for the given documents.
 * @param {Array<Record<string, any>>} docs
 */
export async function sourceMap(docs) {
  const ids = collectSourceIds(docs);
  if (ids.length === 0) return {};

  const articles = await couch.getMany(ids);
  const map = {};
  for (const article of articles) map[article._id] = publicArticle(article);
  return map;
}

/**
 * Names for a set of entity ids — enough to render a link without a second
 * round trip.
 * @param {string[]} ids
 */
export async function nameMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};

  const docs = await couch.getMany(unique);
  const map = {};
  for (const doc of docs) {
    map[doc._id] = {
      id: doc._id,
      type: doc.type,
      name: doc.title ?? doc.full_name ?? doc.name ?? null,
      slug: doc.slug ?? null,
      // Pri subjekte je `kind` reťazec (strana, firma, inštitúcia), pri kauze
      // zdrojovaný zoznam druhov — von ide len so zdrojom a len ako zoznam kódov.
      kind: doc.type === "case"
        ? (doc.kind?.sources?.length ? doc.kind.value : null)
        : (doc.kind ?? null),
      publish_state: doc.publish_state ?? null,
    };
  }
  return map;
}

/** ISO date → epoch ms, for range queries against the numeric index fields. */
export function epoch(iso) {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

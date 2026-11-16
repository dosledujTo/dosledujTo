// The sourced value pattern (backend-zadanie.md §2.1). A publishable field is
// never a scalar:
//
//   { value, unit?, sources[], derived, derivation, disputed[], asserted_at }
//
// Empty `sources` means the value is not published. That rule is enforced three
// times over — here, in the API projection, and in validate_doc_update — because
// it is the one promise the product cannot break (produktové zadanie §4.6).

/** Fields that are technical, not editorial, and therefore never sourced. */
export const TECHNICAL_FIELDS = new Set([
  "_id", "_rev", "_attachments", "type", "slug", "tags", "created_at", "updated_at",
  "created_by", "updated_by", "publish_state", "person_ids", "party_ids",
  "started_on", "closed_on", "name_variants", "title", "full_name", "name",
  "birth_year", "ico", "kind",
]);

/**
 * Build a sourced field.
 *
 * @param {unknown} value
 * @param {string[]} sources          Ids of `article` documents.
 * @param {object} [opts]
 * @param {string} [opts.unit]
 * @param {boolean} [opts.derived]    True when we derived this ourselves.
 * @param {string} [opts.derivation]  Required when `derived` — it is our claim.
 * @param {Array<{value: unknown, sources: string[]}>} [opts.disputed]
 * @param {string} [opts.asserted_at]
 */
export function sourced(value, sources = [], opts = {}) {
  return {
    value,
    unit: opts.unit ?? undefined,
    sources: [...sources],
    derived: opts.derived ?? false,
    derivation: opts.derivation ?? null,
    disputed: opts.disputed ?? [],
    asserted_at: opts.asserted_at ?? null,
  };
}

/** @param {unknown} field */
export function isSourced(field) {
  return !!field && typeof field === "object" && !Array.isArray(field) &&
    Array.isArray(field.sources);
}

/** @param {unknown} field */
export function hasSource(field) {
  return isSourced(field) && field.sources.length > 0;
}

/** @param {unknown} field */
export function valueOf(field) {
  return isSourced(field) ? field.value : field;
}

/**
 * Every sourced field on a document, as [name, field] pairs.
 * @param {Record<string, any>} doc
 */
export function sourcedEntries(doc) {
  return Object.entries(doc).filter(([key, v]) => key[0] !== "_" && isSourced(v));
}

/**
 * Which sourced fields would block publishing. The caller decides whether that
 * is a 422 (moderator tried to publish) or a filter (public read).
 *
 * @param {Record<string, any>} doc
 * @returns {string[]} Field names with no source.
 */
export function unsourcedFields(doc) {
  return sourcedEntries(doc)
    .filter(([, field]) => field.sources.length === 0)
    .map(([name]) => name);
}

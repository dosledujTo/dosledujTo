// Helpers for the "sourced value" pattern (backend-zadanie.md §2.1): every
// publishable field is an object, not a scalar:
//
//   { value, unit?, sources[], derived, derivation, disputed[], asserted_at }
//
// Index and map functions run inside the query server, where an exception drops
// the document from the index silently. Everything here therefore returns a
// harmless fallback instead of throwing.

/**
 * The value carried by a sourced field. Tolerates a plain scalar, so a field
 * that has not been migrated yet still indexes.
 *
 * @param {*} field
 * @returns {*} `null` when there is nothing to index.
 */
export function value(field) {
  if (field === null || field === undefined) return null;
  if (typeof field === "object" && !isArray(field)) {
    return field.value === undefined ? null : field.value;
  }
  return field;
}

/**
 * Source document ids backing a field, always an array.
 *
 * @param {*} field
 * @returns {Array<string>}
 */
export function sources(field) {
  if (field && typeof field === "object" && isArray(field.sources)) {
    return field.sources;
  }
  return [];
}

/**
 * A field is publishable only if at least one source stands behind it
 * (produktové zadanie §4.6). Used by validate_doc_update and by the coverage
 * statistics.
 *
 * @param {*} field
 * @returns {boolean}
 */
export function hasSource(field) {
  return sources(field).length > 0;
}

/**
 * Is this a sourced field rather than a technical one? Technical fields
 * (`slug`, `tags`, timestamps) are plain values and are not counted anywhere.
 *
 * @param {*} field
 * @returns {boolean}
 */
export function isSourced(field) {
  return !!field && typeof field === "object" && !isArray(field) && isArray(field.sources);
}

/**
 * Epoch milliseconds for an ISO date or date-time. Dates must be indexed as
 * numbers — a string field supports neither range queries nor sorting
 * (backend-zadanie.md §2.3).
 *
 * Parsed by hand rather than with `Date.parse`, whose handling of ISO strings
 * varies between SpiderMonkey builds.
 *
 * @param {*} iso  e.g. "2025-03-11" or "2025-03-11T08:30:00Z"
 * @returns {number|null}
 */
export function epoch(iso) {
  if (typeof iso !== "string") return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) return null;
  return Date.UTC(
    +m[1],
    +m[2] - 1,
    +m[3],
    m[4] ? +m[4] : 0,
    m[5] ? +m[5] : 0,
    m[6] ? +m[6] : 0,
  );
}

/**
 * @param {*} v
 * @returns {boolean}
 */
function isArray(v) {
  return Object.prototype.toString.call(v) === "[object Array]";
}

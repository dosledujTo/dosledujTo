// Lucene query construction. **The client never sends a query** — it sends
// whitelisted parameters and the server composes them (backend-zadanie.md §3).
// Free text is escaped, split into tokens and reassembled; anything else is a
// named filter with a known shape.

// The same folding used by the index functions, imported from the design-document
// tree so query time and index time can never drift apart.
import { fold } from "../../../couch/shared/normalize.js";

/** Characters Lucene treats as syntax. */
const SPECIAL = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/**
 * @param {string} s
 * @returns {string} Safe to place inside a query as a literal.
 */
export function escape(s) {
  return String(s).replace(SPECIAL, "\\$&").replace(/\s+/g, " ").trim();
}

/**
 * `field:"value"` for an exact match on a keyword field.
 * @param {string} field
 * @param {string|number|boolean} value
 */
export function term(field, value) {
  if (typeof value === "number") return `${field}:${value}`;
  return `${field}:"${escape(value)}"`;
}

/**
 * `field:[min TO max]`. `null` means open-ended.
 * @param {string} field
 * @param {number|null} min
 * @param {number|null} max
 */
export function range(field, min, max) {
  const lo = min === null || min === undefined ? "*" : min;
  const hi = max === null || max === undefined ? "*" : max;
  return `${field}:[${lo} TO ${hi}]`;
}

/**
 * Free-text search over folded fields. Every token must match somewhere (AND),
 * but may match in any of the given fields (OR) — the behaviour a search box is
 * expected to have.
 *
 * @param {string} text
 * @param {string[]} fields  Folded field names.
 * @returns {string|null} null when the query has no usable token.
 */
export function freeText(text, fields) {
  const tokens = fold(String(text || ""))
    .split(/\s+/)
    .map((t) => escape(t))
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  const clauses = tokens.map((token) => {
    const perField = fields.map((f) => `${f}:${token}*`);
    return `(${perField.join(" OR ")})`;
  });
  return clauses.join(" AND ");
}

/**
 * Join clauses with AND, dropping the empty ones.
 * @param {...(string|null|undefined|false)} clauses
 */
export function and(...clauses) {
  const used = clauses.filter(Boolean);
  return used.length ? used.join(" AND ") : "*:*";
}

/**
 * `(a OR b OR c)` — for a parameter that accepts several values.
 * @param {string[]} clauses
 */
export function or(clauses) {
  const used = clauses.filter(Boolean);
  if (used.length === 0) return null;
  return used.length === 1 ? used[0] : `(${used.join(" OR ")})`;
}

/**
 * Sort spec for `_search`. Dates and amounts are numbers in the index, so the
 * `<number>` suffix is mandatory — without it Lucene sorts them as strings.
 *
 * Returned as an array, not a JSON string: nano POSTs the search parameters as
 * a JSON body, so a pre-stringified value would arrive as a string and CouchDB
 * would reject it.
 *
 * @param {string} field
 * @param {"asc"|"desc"} [direction]
 * @param {"number"|"string"} [kind]
 * @returns {string[]}
 */
export function sortBy(field, direction = "desc", kind = "number") {
  const prefix = direction === "desc" ? "-" : "";
  return [`${prefix}${field}<${kind}>`];
}

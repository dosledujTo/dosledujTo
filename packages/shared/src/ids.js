// Document ids are `<type>:<uuid7>` — enforced by validate_doc_update. UUIDv7 is
// time-ordered, so ids sort by creation and `_all_docs` ranges stay useful.

import { randomBytes } from "node:crypto";

/** @returns {string} RFC 9562 UUIDv7 */
export function uuid7() {
  const bytes = randomBytes(16);
  const ms = Date.now();

  // 48-bit big-endian timestamp
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = bytes.toString("hex");
  return (
    hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" + hex.slice(20)
  );
}

/**
 * @param {string} type
 * @returns {string} e.g. "case:0192a1b0-…"
 */
export function newId(type) {
  return `${type}:${uuid7()}`;
}

/**
 * The type encoded in a document id, or null.
 * @param {unknown} id
 */
export function typeOf(id) {
  if (typeof id !== "string") return null;
  const i = id.indexOf(":");
  return i > 0 ? id.slice(0, i) : null;
}

/**
 * @param {unknown} id
 * @param {string} type
 */
export function isId(id, type) {
  return typeOf(id) === type && String(id).length > type.length + 1;
}

// Minimal RFC 6902 diff. Every write records one, because CouchDB's `_rev`
// history is not an audit trail — compaction erases it (backend-zadanie.md §2.2).
//
// Only `add`, `remove` and `replace` are produced: `move` and `copy` would make
// the diff shorter and the audit log harder to read, which is the wrong trade
// for a document a moderator may have to explain in public.

/**
 * @param {unknown} a  Document before.
 * @param {unknown} b  Document after.
 * @param {string} [path]
 * @returns {Array<{op: string, path: string, value?: unknown}>}
 */
export function diff(a, b, path = "") {
  if (equal(a, b)) return [];

  if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) {
    return [{ op: "replace", path: path || "/", value: b }];
  }

  // Arrays are compared as whole values: an index-wise diff of a reordered
  // array of source ids is noise, not information.
  if (Array.isArray(a)) return [{ op: "replace", path, value: b }];

  const ops = [];
  for (const key of Object.keys(a)) {
    if (!(key in b)) ops.push({ op: "remove", path: `${path}/${escape(key)}` });
  }
  for (const key of Object.keys(b)) {
    const p = `${path}/${escape(key)}`;
    if (!(key in a)) ops.push({ op: "add", path: p, value: b[key] });
    else ops.push(...diff(a[key], b[key], p));
  }
  return ops;
}

/**
 * Apply a patch to a copy of `doc`.
 *
 * Used to replay a revision chain. There is no inverse-patch stored anywhere —
 * a `replace` op does not record the value it replaced — so reverting means
 * rebuilding the state from the beginning. The chain starts at document
 * creation, so that is always possible.
 *
 * @param {unknown} doc
 * @param {Array<{op: string, path: string, value?: unknown}>} ops
 */
export function apply(doc, ops) {
  let out = structuredClone(doc);

  for (const op of ops) {
    const parts = op.path.split("/").slice(1).map(unescape);
    if (parts.length === 0) {
      out = op.op === "remove" ? undefined : structuredClone(op.value);
      continue;
    }

    const last = parts.pop();
    let node = out;
    for (const part of parts) {
      if (node[part] === undefined || node[part] === null) node[part] = {};
      node = node[part];
    }

    if (op.op === "remove") delete node[last];
    else node[last] = structuredClone(op.value);
  }
  return out;
}

function escape(key) {
  return String(key).replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescape(key) {
  return key.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isObject(v) {
  return v !== null && typeof v === "object";
}

function equal(a, b) {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => k in b && equal(a[k], b[k]));
}

// The single write path. Nothing else in the codebase calls `couch.put`
// directly (backend-zadanie.md §2.2): every write records a `revision` here, or
// it does not happen. CouchDB's `_rev` history does not survive compaction, so
// this is the audit trail.

import { createHash } from "node:crypto";
import * as couch from "./couch.js";
import { newId, typeOf } from "./ids.js";
import { diff } from "./jsonpatch.js";
import { badRequest, conflict, notFound } from "./errors.js";
import { unsourcedFields } from "./sourced.js";
import { logger } from "./logger.js";

/** Fields whose change carries no information for an audit log. */
const VOLATILE = new Set(["_rev", "updated_at", "updated_by", "couchman:fixture"]);

// Every write goes through this module, but not every write belongs in the
// audit trail. Sessions, notifications and subscriptions are machinery: a
// revision per login or per read notification would bury the editorial history
// this log exists for. What a moderator changed about a person is auditable;
// that somebody logged in is a log line.
const AUDITED = new Set([
  "case", "person", "org", "role", "link", "event", "proceeding",
  "article", "suggestion", "user", "feed", "codelist",
]);

/**
 * Secrets that must be diffed but never recorded. A password change has to be
 * visible in the audit trail; the hash itself must not be, or the log becomes
 * the most attractive document in the database.
 */
const SECRET = new Set(["password_hash", "token_hash"]);

function auditable(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (VOLATILE.has(k)) continue;
    out[k] = SECRET.has(k) ? digest(v) : v;
  }
  return out;
}

/** An opaque marker that changes when the secret changes, and reveals nothing. */
function digest(value) {
  if (!value) return null;
  return `[secret:${createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}]`;
}

function now() {
  return new Date().toISOString();
}

/**
 * @typedef {{ id: string, role: "user"|"moderator"|"admin"|"bot" }} Actor
 */

/**
 * Create a document. The id is generated as `<type>:<uuid7>`.
 *
 * @param {object} args
 * @param {string} args.type
 * @param {Record<string, any>} args.data
 * @param {Actor} args.actor
 * @param {string} args.reason
 * @param {string|null} [args.suggestionId]
 */
export async function createDoc({ type, data, actor, reason, suggestionId = null }) {
  const at = now();
  const doc = {
    ...data,
    _id: data._id ?? newId(type),
    type,
    created_at: at,
    updated_at: at,
    created_by: actor.id,
    updated_by: actor.id,
  };

  await couch.put(doc);
  const stored = await couch.get(doc._id);

  await writeRevision({
    target: stored,
    revBefore: null,
    revAfter: stored._rev,
    ops: diff({}, auditable(stored)),
    actor,
    reason,
    suggestionId,
  });

  return stored;
}

/**
 * Update a document and record what changed.
 *
 * `rev` is the revision the caller was looking at. A mismatch is a 409 with the
 * current state attached — never a silent overwrite (backend-zadanie.md §9).
 *
 * @param {object} args
 * @param {string} args.id
 * @param {string} [args.rev]
 * @param {Record<string, any>|((doc: any) => any)} args.patch
 * @param {Actor} args.actor
 * @param {string} args.reason
 * @param {string|null} [args.suggestionId]
 * @param {boolean} [args.audit]  False for operational state on an otherwise
 *   audited document — the crawler's `last_etag` and `last_run_at` on a `feed`
 *   are not editorial history, and a revision per crawl run would bury the
 *   changes that are.
 */
export async function updateDoc({
  id, rev, patch, actor, reason, suggestionId = null, audit = true,
}) {
  const current = await couch.get(id);
  if (!current) throw notFound(id);

  if (rev && rev !== current._rev) {
    throw conflict("dokument bol medzičasom zmenený, načítaj ho znova", {
      expected_rev: rev,
      current_rev: current._rev,
      current: current,
    });
  }

  const draft =
    typeof patch === "function"
      ? patch(structuredClone(current))
      : { ...current, ...patch };

  const next = {
    ...draft,
    _id: current._id,
    _rev: current._rev,
    type: current.type,
    created_at: current.created_at,
    created_by: current.created_by,
    updated_at: now(),
    updated_by: actor.id,
  };

  const ops = diff(auditable(current), auditable(next));
  if (ops.length === 0) return current; // nothing changed, nothing to record

  const res = await couch.put(next);

  if (audit) {
    await writeRevision({
      target: current,
      revBefore: current._rev,
      revAfter: res.rev,
      ops,
      actor,
      reason,
      suggestionId,
    });
  }

  return { ...next, _rev: res.rev };
}

/**
 * Publish an entity. The unsourced check runs here so the moderator gets a
 * readable 422 naming the fields; validate_doc_update enforces the same rule
 * again at the database, for writers that never came through this function.
 *
 * @param {object} args
 * @param {string} args.id
 * @param {string} [args.rev]
 * @param {Actor} args.actor
 * @param {string} args.reason
 */
export async function publishDoc({ id, rev, actor, reason }) {
  const doc = await couch.get(id);
  if (!doc) throw notFound(id);

  const missing = unsourcedFields(doc);
  // Druh kauzy je pri zverejnení povinný — bez neho by sa nefinančná kauza
  // na webe tvárila ako kauza s nulovou sumou. Databáza to stráži tiež.
  if (doc.type === "case" && !doc.kind?.value?.length && !missing.includes("kind")) missing.push("kind");
  if (missing.length > 0) {
    throw badRequest(
      "dokument sa nedá zverejniť: údaj bez zdroja sa nezverejňuje",
      missing.map((field) => ({ field, message: "chýba zdroj" })),
    );
  }

  return updateDoc({
    id,
    rev,
    patch: { publish_state: "published" },
    actor,
    reason: reason || "zverejnenie",
  });
}

/**
 * Zmazanie dokumentu s revíziou.
 *
 * Mazanie v CouchDB nechá po sebe len náhrobok, z ktorého sa nedá zistiť, čo
 * tam bolo. Preto sa najprv zapíše revízia s celým obsahom dokumentu — audit
 * musí prežiť aj to, čo v databáze už nie je. Dôvod je povinný.
 *
 * @param {object} args
 * @param {string} args.id
 * @param {Actor} args.actor
 * @param {string} args.reason
 */
export async function deleteDoc({ id, actor, reason }) {
  const doc = await couch.get(id);
  if (!doc) throw notFound(id);
  if (!reason || reason.trim().length < 3) {
    throw badRequest("zmazanie musí mať dôvod — zostane v histórii");
  }

  const content = auditable(doc);

  await writeRevision({
    target: doc,
    revBefore: doc._rev,
    revAfter: null,
    // Diff smerom k prázdnemu dokumentu. Prehrávanie reťazca revízií tak skončí
    // na prázdnom stave, čo je správne — ale samotné `remove` operácie
    // neuchovávajú, čo v poliach bolo. Preto `snapshot` nižšie: bez neho by po
    // zmazaní zostal záznam, že sa niečo stalo, a nie čo zaniklo.
    ops: diff(content, {}),
    snapshot: content,
    actor,
    reason: `zmazané: ${reason}`,
    suggestionId: null,
  });

  await couch.destroy(doc._id, doc._rev);
  return { id: doc._id, deleted: true };
}

/**
 * The audit record. Written after the document, because it has to carry the
 * revision the write produced.
 *
 * A failure here is logged at error level and does not roll back the document —
 * CouchDB has no transactions, and losing the change would be worse than losing
 * its audit entry. The gap is visible: `revision` documents are queryable by
 * target, and a missing one shows up as a jump in `_rev`.
 */
async function writeRevision({
  target, revBefore, revAfter, ops, actor, reason, suggestionId, snapshot = null,
}) {
  const type = target.type ?? typeOf(target._id);
  if (!AUDITED.has(type)) return null;

  const at = now();
  const revision = {
    _id: newId("revision"),
    type: "revision",
    target_type: target.type ?? typeOf(target._id),
    target_id: target._id,
    target_rev_before: revBefore,
    target_rev_after: revAfter,
    diff: ops,
    // Len pri zmazaní: obsah dokumentu, ktorý zanikol.
    snapshot,
    actor_id: actor.id,
    actor_role: actor.role,
    at,
    suggestion_id: suggestionId,
    reason: reason ?? null,
    created_at: at,
    updated_at: at,
  };

  try {
    await couch.put(revision);
  } catch (err) {
    logger.error(
      { err, target_id: target._id, target_rev_after: revAfter },
      "revíziu sa nepodarilo zapísať — dokument je zmenený, audit chýba",
    );
  }
  return revision;
}

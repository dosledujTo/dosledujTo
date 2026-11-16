import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { apply } from "../../../../shared/src/jsonpatch.js";
import { badRequest, notFound } from "../../../../shared/src/index.js";
import { adminDoc } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { requireRole, actorOf } from "../../middleware/auth.js";

export const adminRevisions = Router();

/** Types a revert may touch. Reverting a user or a session is not history-keeping. */
const REVERTABLE = new Set([
  "case", "person", "org", "role", "link", "event", "proceeding", "article",
]);

adminRevisions.get("/", validate.query(schemas.revisionsQuery), async (req, res) => {
  const f = req.validQuery;
  if (!f.target_id && !f.actor_id) {
    throw badRequest("uveď target_id alebo actor_id");
  }

  let docs = f.target_id
    ? await queries.revisionsOfTarget(f.target_id)
    : await queries.revisionsOfActor(f.actor_id, { limit: f.limit });

  if (f.from) docs = docs.filter((d) => d.at >= f.from);
  if (f.to) docs = docs.filter((d) => d.at <= f.to);

  res.json({ items: docs.slice(0, f.limit).map(adminDoc), total: docs.length });
});

/**
 * Undo a change by replaying history.
 *
 * A JSON Patch does not record what it replaced, so there is no inverse to
 * apply. What there is, is a complete chain: `createDoc` writes a revision for
 * the document's birth, and every write since has added one. Applying every
 * diff older than the one being reverted reconstructs the state just before it.
 *
 * The revert itself is a new revision. Nothing is erased — an audit trail that
 * can be rewound would not be one.
 */
adminRevisions.post("/:id/revert", requireRole("admin"), async (req, res) => {
  const revision = await couch.get(req.params.id);
  if (!revision || revision.type !== "revision") throw notFound("revízia");

  if (!REVERTABLE.has(revision.target_type)) {
    throw badRequest(`revert nie je povolený pre typ ${revision.target_type}`);
  }

  const target = await couch.get(revision.target_id);
  if (!target) throw notFound("dokument, ktorého sa revízia týka");

  const chain = await queries.revisionsOfTarget(revision.target_id);
  const older = chain.filter((r) => r.at < revision.at);
  if (older.length === 0) {
    throw badRequest("toto je prvá revízia dokumentu, nie je na čo sa vrátiť");
  }

  let state = {};
  for (const r of older) state = apply(state, r.diff ?? []);

  const restored = await store.updateDoc({
    id: target._id,
    patch: () => ({ ...state, _id: target._id, _rev: target._rev, type: target.type }),
    actor: actorOf(req),
    reason: `revert revízie ${revision._id} (${revision.reason ?? "bez dôvodu"})`,
  });

  res.json({ reverted_to: older.at(-1)._id, document: adminDoc(restored) });
});

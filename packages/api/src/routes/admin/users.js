import { Router } from "express";
import { z } from "zod";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { badRequest, forbidden, notFound } from "../../../../shared/src/index.js";
import { publicUser, adminDoc } from "../../../../shared/src/projection.js";
import { nameMap } from "../../lib/hydrate.js";
import * as validate from "../../middleware/validate.js";
import { requireRole, actorOf } from "../../middleware/auth.js";

export const adminUsers = Router();

adminUsers.use(requireRole("admin"));

const usersQuery = z.object({
  role: z.enum(schemas.USER_ROLES).optional(),
  status: z.enum(["active", "blocked"]).optional(),
});

adminUsers.get("/", validate.query(usersQuery), async (req, res) => {
  const docs = await couch.listByType("user");
  const f = req.validQuery;

  const items = docs
    .filter((d) => (!f.role || d.role === f.role) && (!f.status || d.status === f.status))
    .map(publicUser);

  res.json({ items, total: items.length });
});

/**
 * Profil registrovaného používateľa (admin-zadanie.md §9): prezývka, odbery
 * a v akom režime ich má.
 *
 * Režim oznámení admin **vidí, ale nemení** — je to voľba používateľa.
 */
adminUsers.get("/:id", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "user") throw notFound("používateľ");

  const subscriptions = await queries.subscriptionsOfUser(doc._id);
  const names = await nameMap(subscriptions.map((s) => s.target_id));

  res.json({
    user: {
      ...publicUser(doc),
      marketing_consent: doc.marketing_consent ?? false,
      email_verified_at: doc.email_verified_at ?? null,
    },
    subscriptions: subscriptions.map((s) => ({
      id: s._id,
      target_type: s.target_type,
      target_id: s.target_id,
      target: names[s.target_id] ?? null,
      // Produkt sa zúžil na dva režimy: pri každej zmene, alebo týždenný súhrn.
      mode: s.frequency === "instant" ? "instant" : "weekly",
      frequency: s.frequency,
      level: s.level,
      created_at: s.created_at,
    })),
  });
});

/**
 * Kto koho spravuje (admin-zadanie.md §2):
 *
 *   - **superadmin** upravuje profil, rolu a stav *všetkých* účtov vrátane
 *     adminov a iných superadminov;
 *   - **admin** upravuje moderátorov a bežných používateľov — teda aj ich rolu,
 *     ale nikdy nie účet iného admina;
 *   - vyššiu rolu, než má sám, nikto neprideľuje.
 *
 * Rovnaké pravidlo platí v administrácii (`permissions.js`), ale rozhoduje sa
 * tu: skryté tlačidlo nie je oprávnenie.
 */
const RANK = { user: 1, moderator: 2, admin: 3, superadmin: 4 };

function canManage(actor, target) {
  if (actor.role === "superadmin") return true;
  if (actor.role !== "admin") return false;
  return (RANK[target.role] ?? 0) <= RANK.moderator;
}

function assignableRoles(actor) {
  return actor.role === "superadmin" ? schemas.USER_ROLES : ["user", "moderator"];
}

/**
 * Zmena profilu, roly a stavu účtu. Povýšenie na moderátora je jediná cesta,
 * ako sa ním niekto stane — registrácia vždy vyrobí bežného používateľa
 * (backend-zadanie.md §7).
 */
adminUsers.patch("/:id", validate.body(schemas.userPatchBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "user") throw notFound("používateľ");

  const { reason, ...patch } = req.body;
  if (Object.keys(patch).length === 0) throw badRequest("nie je čo meniť");

  if (!canManage(req.user, doc)) {
    throw forbidden(
      doc._id === req.user._id
        ? "vlastný účet sa upravuje cez profil, nie cez správu účtov"
        : `účet s rolou ${doc.role} smie upravovať len superadmin`,
    );
  }

  if (patch.role && !assignableRoles(req.user).includes(patch.role)) {
    throw forbidden(`rolu ${patch.role} prideľuje len superadmin`);
  }

  // Admin, ktorý si odoberie rolu alebo vypne vlastný účet, zamkne sebe aj
  // ostatným prístup do inštancie.
  if (doc._id === req.user._id) {
    if (patch.role && patch.role !== doc.role) {
      throw badRequest("vlastnú rolu si nemôžeš zmeniť");
    }
    if (patch.status === "blocked") {
      throw badRequest("vlastný účet si nemôžeš deaktivovať");
    }
  }

  const updated = await store.updateDoc({
    id: doc._id,
    patch,
    actor: actorOf(req),
    reason,
  });

  res.json({ user: publicUser(updated) });
});

export const adminFeeds = Router();

adminFeeds.use(requireRole("admin"));

adminFeeds.get("/", async (req, res) => {
  const docs = await couch.listByType("feed");
  res.json({ items: docs.map(adminDoc), total: docs.length });
});

/**
 * Request a crawl. The crawler is the worker's job (backend-zadanie.md §8.1)
 * and does not exist yet, so this records the request and returns 202: the API
 * and the worker talk through the database, never directly.
 */
adminFeeds.post("/:id/run", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "feed") throw notFound("feed");

  const updated = await store.updateDoc({
    id: doc._id,
    patch: { run_requested_at: new Date().toISOString(), run_requested_by: req.user._id },
    actor: actorOf(req),
    reason: "manuálne spustenie crawlu",
  });

  res.status(202).json({
    feed: adminDoc(updated),
    note: "požiadavka zapísaná; crawl vykoná worker, ktorý zatiaľ nie je nasadený",
  });
});

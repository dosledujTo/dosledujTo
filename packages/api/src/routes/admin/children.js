// Úprava a mazanie toho, čo visí na kauze: role, udalosti, konania.
//
// Zakladajú sa cez `/admin/cases/:id/...`, lebo bez kauzy nedávajú zmysel.
// Upravovať a mazať sa ale musia samostatne — moderátor opravuje konkrétny
// riadok, nie celú kauzu.
//
// Dve pravidlá, ktoré tu platia všade:
//   - zmena aj zmazanie majú **povinný dôvod** a zapisujú revíziu,
//   - zmazanie je oprava omylu, nie spôsob, ako prepísať históriu. Zmena
//     statusu osoby sa robí novou rolou (`supersedes`), nie prepisom starej.

import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { badRequest, notFound } from "../../../../shared/src/index.js";
import { adminDoc } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { actorOf } from "../../middleware/auth.js";
import { nameMap } from "../../lib/hydrate.js";
import { checkEventProceeding } from "../../lib/checks.js";
import { syncCaseEntities } from "../../lib/denormalise.js";

/**
 * @param {"role"|"event"|"proceeding"} type
 * @param {string} label
 */
function loader(type, label) {
  return async (id) => {
    const doc = await couch.get(id);
    if (!doc || doc.type !== type) throw notFound(label);
    return doc;
  };
}

// ── udalosti ─────────────────────────────────────────────────────────────────

export const adminEvents = Router();
const loadEvent = loader("event", "udalosť");

adminEvents.patch("/:id", validate.body(schemas.eventPatchBody), async (req, res) => {
  const doc = await loadEvent(req.params.id);
  const { reason, rev, ...patch } = req.body;
  await checkEventProceeding(patch.proceeding_id, doc.case_id);

  const updated = await store.updateDoc({
    id: doc._id, rev, patch, actor: actorOf(req), reason,
  });
  res.json({ event: adminDoc(updated) });
});

adminEvents.delete("/:id", validate.body(schemas.deleteBody), async (req, res) => {
  const doc = await loadEvent(req.params.id);
  await store.deleteDoc({ id: doc._id, actor: actorOf(req), reason: req.body.reason });
  res.json({ deleted: doc._id, case_id: doc.case_id });
});

// ── súdne konania ────────────────────────────────────────────────────────────

export const adminProceedings = Router();
const loadProceeding = loader("proceeding", "konanie");

/**
 * Zoznam konaní naprieč kauzami — samostatná sekcia administrácie. Spisová
 * značka je jediný kľúč, ktorým sa dá anonymizované rozhodnutie priradiť ku
 * kauze, takže sa s ňou pracuje aj mimo detailu kauzy.
 */
adminProceedings.get("/", validate.query(schemas.proceedingsQuery), async (req, res) => {
  const f = req.validQuery;
  let items = await queries.allProceedings({ court: f.court, limit: 500 });

  if (f.q) {
    const needle = f.q.toLowerCase();
    items = items.filter(
      (item) =>
        String(item.file_number ?? "").toLowerCase().includes(needle) ||
        String(item.court ?? "").toLowerCase().includes(needle),
    );
  }
  if (f.phase) items = items.filter((item) => item.phase === f.phase);

  const names = await nameMap(items.map((item) => item.case_id));

  res.json({
    items: items.slice(0, f.limit).map((item) => ({
      ...adminDoc(item),
      case: names[item.case_id] ?? null,
    })),
    total: items.length,
    // Zoznam súdov pre filter. Číselník súdov zatiaľ neexistuje (§12 zadania),
    // takže sa odvodzuje z toho, čo je zapísané.
    courts: [...new Set(items.map((item) => item.court).filter(Boolean))].sort(),
  });
});

adminProceedings.get("/:id", async (req, res) => {
  const doc = await loadProceeding(req.params.id);
  const names = await nameMap([doc.case_id]);
  res.json({ proceeding: adminDoc(doc), case: names[doc.case_id] ?? null });
});

adminProceedings.patch("/:id", validate.body(schemas.proceedingPatchBody), async (req, res) => {
  const doc = await loadProceeding(req.params.id);
  const { reason, rev, ...patch } = req.body;

  const updated = await store.updateDoc({
    id: doc._id, rev, patch, actor: actorOf(req), reason,
  });
  res.json({ proceeding: adminDoc(updated) });
});

adminProceedings.delete("/:id", validate.body(schemas.deleteBody), async (req, res) => {
  const doc = await loadProceeding(req.params.id);
  await store.deleteDoc({ id: doc._id, actor: actorOf(req), reason: req.body.reason });
  res.json({ deleted: doc._id, case_id: doc.case_id });
});

// ── role ─────────────────────────────────────────────────────────────────────

export const adminRoles = Router();
const loadRole = loader("role", "rola");

/**
 * Ukončenie role. Toto je bežná cesta, keď sa niečí status zmení — stará rola
 * dostane dátum konca a **zostane v histórii** (produktové zadanie §6).
 */
adminRoles.post("/:id/end", validate.body(schemas.endRoleBody), async (req, res) => {
  const doc = await loadRole(req.params.id);
  if (doc.valid_to) throw badRequest("rola je už ukončená");

  const updated = await store.updateDoc({
    id: doc._id,
    patch: { valid_to: req.body.valid_to },
    actor: actorOf(req),
    reason: req.body.reason ?? `ukončenie role ${doc.role}`,
  });
  res.json({ role: adminDoc(updated) });
});

adminRoles.patch("/:id", validate.body(schemas.rolePatchBody), async (req, res) => {
  const doc = await loadRole(req.params.id);
  const { reason, rev, ...patch } = req.body;

  const updated = await store.updateDoc({
    id: doc._id, rev, patch, actor: actorOf(req), reason,
  });
  res.json({ role: adminDoc(updated) });
});

/**
 * Zmazanie role je **oprava omylu**, nie zmena statusu. Keď niekoho status
 * naozaj zmenil súd, patrí to do novej role s `supersedes` — inak by z registra
 * zmizlo, že bol niekto obvinený, hoci to tak bolo.
 */
adminRoles.delete("/:id", validate.body(schemas.deleteBody), async (req, res) => {
  const doc = await loadRole(req.params.id);
  await store.deleteDoc({ id: doc._id, actor: actorOf(req), reason: req.body.reason });

  // Zoznam osôb na kauze sa prepočíta — inak by tam ostal niekto, kto v nej
  // už nefiguruje, a filter podľa osoby by klamal.
  await syncCaseEntities(doc.case_id, actorOf(req));

  res.json({ deleted: doc._id, case_id: doc.case_id });
});

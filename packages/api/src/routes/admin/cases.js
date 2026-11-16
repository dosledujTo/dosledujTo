import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { badRequest, conflict, notFound } from "../../../../shared/src/index.js";
import { adminDoc } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { requireRole, actorOf } from "../../middleware/auth.js";
import { syncCaseEntities } from "../../lib/denormalise.js";
import { nameMap } from "../../lib/hydrate.js";
import { checkEventProceeding } from "../../lib/checks.js";

export const adminCases = Router();

async function loadCase(id) {
  const doc = await couch.get(id);
  if (!doc || doc.type !== "case") throw notFound("kauza");
  return doc;
}

// Zoznam pre administráciu: koncepty a skryté kauzy sú tu tie najdôležitejšie
// položky, nie výnimka. Verejný `/api/cases` ich nikdy nevráti.
adminCases.get("/", validate.query(schemas.adminEntitiesQuery), async (req, res) => {
  const f = req.validQuery;
  const result = await search.searchEntities({
    ...f,
    type: "case",
    from: f.from ? Date.parse(f.from) : undefined,
    to: f.to ? Date.parse(f.to) : undefined,
    includeUnpublished: true,
    counts: ["publish_state", "phase", "status", "tag"],
  });

  res.json({
    items: result.items,
    next_cursor: result.next_cursor,
    total: result.total,
    facets: result.counts,
  });
});

adminCases.post("/", validate.body(schemas.caseCreateBody), async (req, res) => {
  if (await queries.slugTaken("case", req.body.slug)) {
    throw conflict(`slug "${req.body.slug}" je už použitý`);
  }

  // A case is always born as a draft. Publishing is a separate, deliberate act
  // that checks every field for a source.
  const doc = await store.createDoc({
    type: "case",
    data: { ...req.body, publish_state: "draft", person_ids: [], party_ids: [] },
    actor: actorOf(req),
    reason: "založenie kauzy",
  });

  res.status(201).json({ case: adminDoc(doc) });
});

// Unlike the public route, this one shows drafts, hidden cases and fields that
// have no source yet — that is what the moderator is here to fix.
adminCases.get("/:id", async (req, res) => {
  const doc = await loadCase(req.params.id);
  const children = await queries.caseChildren(doc._id);

  // Bez mien je detail nečitateľný — moderátor nemá dôvod poznať `person:018f…`
  // naspamäť. Rozpúšťa sa to jedným hromadným čítaním, nie dotazom na riadok.
  const names = await nameMap([
    ...children.roles.map((r) => r.person_id ?? r.org_id),
    ...children.events.flatMap((e) => e.person_ids ?? []),
    ...(doc.person_ids ?? []),
    ...(doc.party_ids ?? []),
    ...(doc.moderator_ids ?? []),
    ...children.proceedings.flatMap((p) => [...(p.person_ids ?? []), ...(p.org_ids ?? [])]),
  ]);

  const moderators = await couch.getMany(doc.moderator_ids ?? []);

  res.json({
    case: adminDoc(doc),
    // Rola patrí osobe alebo subjektu; `entity` je to, čo obrazovka vykresľuje,
    // `person` zostáva kvôli spätnej kompatibilite volajúcich.
    roles: children.roles.map((role) => ({
      ...adminDoc(role),
      person: names[role.person_id] ?? null,
      entity_id: role.person_id ?? role.org_id ?? null,
      entity_type: role.person_id ? "person" : "org",
      entity: names[role.person_id ?? role.org_id] ?? null,
    })),
    events: children.events.map(adminDoc),
    proceedings: children.proceedings.map(adminDoc),
    moderators: moderators.map((u) => ({ id: u._id, email: u.email, display_name: u.display_name })),
    names,
  });
});

/**
 * Priradenie moderátora ku kauze (admin-zadanie.md §5.3).
 *
 * Väzba je pole na kauze, nie samostatný dokument: je to malá množina, mení sa
 * zriedka a takto ju vie indexovať `entities` — filter „len moje kauzy" tak
 * ostáva jedným dotazom namiesto dočítavania na klientovi.
 */
adminCases.post(
  "/:id/moderators",
  requireRole("admin"),
  validate.body(schemas.moderatorBody),
  async (req, res) => {
    const doc = await loadCase(req.params.id);
    const user = await couch.get(req.body.user_id);
    if (!user || user.type !== "user") throw notFound("používateľ");
    if (user.role === "user") {
      throw badRequest("používateľ nemá rolu moderátora — najprv mu ju prideľ");
    }

    const current = doc.moderator_ids ?? [];
    if (current.includes(user._id)) return res.json({ moderator_ids: current });

    const updated = await store.updateDoc({
      id: doc._id,
      patch: { moderator_ids: [...current, user._id] },
      actor: actorOf(req),
      reason: req.body.reason ?? `priradený moderátor ${user.email}`,
    });

    res.json({ moderator_ids: updated.moderator_ids });
  },
);

adminCases.delete("/:id/moderators/:userId", requireRole("admin"), async (req, res) => {
  const doc = await loadCase(req.params.id);
  const current = doc.moderator_ids ?? [];

  const updated = await store.updateDoc({
    id: doc._id,
    patch: { moderator_ids: current.filter((id) => id !== req.params.userId) },
    actor: actorOf(req),
    reason: "odobraný moderátor",
  });

  res.json({ moderator_ids: updated.moderator_ids ?? [] });
});

adminCases.patch("/:id", validate.body(schemas.patchBody), async (req, res) => {
  const doc = await loadCase(req.params.id);

  if (req.body.patch.slug && req.body.patch.slug !== doc.slug) {
    if (await queries.slugTaken("case", req.body.patch.slug, doc._id)) {
      throw conflict(`slug "${req.body.patch.slug}" je už použitý`);
    }
  }

  const updated = await store.updateDoc({
    id: doc._id,
    rev: req.body.rev,
    patch: req.body.patch,
    actor: actorOf(req),
    reason: req.body.reason,
  });

  res.json({ case: adminDoc(updated) });
});

adminCases.post("/:id/publish", async (req, res) => {
  const doc = await loadCase(req.params.id);
  const updated = await store.publishDoc({
    id: doc._id,
    rev: req.body?.rev,
    actor: actorOf(req),
    reason: req.body?.reason ?? "zverejnenie kauzy",
  });
  res.json({ case: adminDoc(updated) });
});

// Vrátenie do konceptu. Skrytie (`/hide`) je rozhodnutie administrátora o tom,
// že vec sa zverejniť **nemá**; toto je krok späť v redakčnej práci — kauza
// zmizne z verejnej stránky, ale zostáva rozrobená.
adminCases.post("/:id/unpublish", validate.body(schemas.hideBody), async (req, res) => {
  const doc = await loadCase(req.params.id);
  const updated = await store.updateDoc({
    id: doc._id,
    rev: req.body.rev,
    patch: { publish_state: "draft" },
    actor: actorOf(req),
    reason: req.body.reason,
  });
  res.json({ case: adminDoc(updated) });
});

// Hiding is an admin decision, and it always has a stated reason: a case that
// disappears without one looks exactly like a case somebody tidied away.
adminCases.post(
  "/:id/hide",
  requireRole("admin"),
  validate.body(schemas.hideBody),
  async (req, res) => {
    const doc = await loadCase(req.params.id);
    const updated = await store.updateDoc({
      id: doc._id,
      rev: req.body.rev,
      patch: { publish_state: "hidden" },
      actor: actorOf(req),
      reason: req.body.reason,
    });
    res.json({ case: adminDoc(updated) });
  },
);

adminCases.post("/:id/roles", validate.body(schemas.roleBody), async (req, res) => {
  const doc = await loadCase(req.params.id);

  // Osoba alebo subjekt — schéma zaručila, že prišlo práve jedno z nich.
  const entityId = req.body.person_id ?? req.body.org_id;
  const entity = await couch.get(entityId);
  const wanted = req.body.person_id ? "person" : "org";
  if (!entity || entity.type !== wanted) throw notFound(wanted === "person" ? "osoba" : "subjekt");

  // A status change closes the previous role and opens a new one. The old
  // document is never rewritten — history is the product (produktové zadanie §6).
  if (req.body.supersedes) {
    const previous = await couch.get(req.body.supersedes);
    if (!previous || previous.case_id !== doc._id) throw notFound("predchádzajúca rola");
    if (previous.valid_to) throw badRequest("predchádzajúca rola je už uzavretá");

    await store.updateDoc({
      id: previous._id,
      patch: { valid_to: req.body.valid_from },
      actor: actorOf(req),
      reason: `ukončenie role pri zmene na ${req.body.role}`,
    });
  }

  const { supersedes, ...data } = req.body;
  const role = await store.createDoc({
    type: "role",
    data: { ...data, case_id: doc._id },
    actor: actorOf(req),
    reason: `nová rola ${req.body.role}`,
  });

  await syncCaseEntities(doc._id, actorOf(req));
  res.status(201).json({ role: adminDoc(role) });
});

adminCases.post("/:id/events", validate.body(schemas.eventBody), async (req, res) => {
  const doc = await loadCase(req.params.id);
  await checkEventProceeding(req.body.proceeding_id, doc._id);
  const event = await store.createDoc({
    type: "event",
    data: { ...req.body, case_id: doc._id },
    actor: actorOf(req),
    reason: `nová udalosť: ${req.body.title}`,
  });
  res.status(201).json({ event: adminDoc(event) });
});

adminCases.post("/:id/proceedings", validate.body(schemas.proceedingBody), async (req, res) => {
  const doc = await loadCase(req.params.id);
  const proceeding = await store.createDoc({
    type: "proceeding",
    data: { ...req.body, case_id: doc._id },
    actor: actorOf(req),
    reason: `nové konanie ${req.body.file_number}`,
  });
  res.status(201).json({ proceeding: adminDoc(proceeding) });
});

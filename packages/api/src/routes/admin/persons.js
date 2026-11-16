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
import { syncCasesOfPerson } from "../../lib/denormalise.js";
import { nameMap, sourceMap } from "../../lib/hydrate.js";

export const adminPersons = Router();

/**
 * Zoznam entít pre administráciu — vrátane konceptov a skrytých.
 * @param {"person"|"org"} type
 * @param {Record<string, any>} f
 */
async function listEntities(type, f) {
  const result = await search.searchEntities({
    ...f,
    type,
    includeUnpublished: true,
    counts: ["publish_state"],
  });
  return {
    items: result.items,
    next_cursor: result.next_cursor,
    total: result.total,
    facets: result.counts,
  };
}

adminPersons.get("/", validate.query(schemas.adminEntitiesQuery), async (req, res) => {
  const result = await listEntities("person", req.validQuery);
  res.json(result);
});

adminPersons.post("/", validate.body(schemas.personCreateBody), async (req, res) => {
  if (await queries.slugTaken("person", req.body.slug)) {
    throw conflict(`slug "${req.body.slug}" je už použitý`);
  }

  const doc = await store.createDoc({
    type: "person",
    data: { ...req.body, publish_state: "draft" },
    actor: actorOf(req),
    reason: "založenie osoby",
  });

  res.status(201).json({ person: adminDoc(doc) });
});

adminPersons.get("/:id", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "person") throw notFound("osoba");
  res.json(await entityDetail(doc, "person"));
});

/**
 * Detail osoby alebo subjektu so všetkým, čo z nich robí čitateľný profil:
 * mená naviazaných entít, články, a časová os poskladaná z rolí a udalostí.
 *
 * Ide o štyri hromadné čítania, nie o dotaz na riadok — profil s desiatkami
 * väzieb by inak znamenal desiatky requestov.
 */
async function entityDetail(doc, type) {
  // Rola viaže ku kauze osobu aj subjekt, takže kauzy sa čítajú rovnako pre
  // oboje. Pri subjekte k nim ešte pribudnú kauzy odvodené z členstva jeho ľudí
  // (`org_cases`) — to je iný druh väzby a mieša sa nesmie.
  const [links, cases, proceedings] = await Promise.all([
    queries.linksOf(doc._id),
    queries.entityCases(doc._id),
    queries.proceedingsOfEntity(doc._id),
  ]);

  // Subjekt nemá role; jeho kauzy sú tie, kde figuruje ako strana.
  const orgCases =
    type === "org"
      ? await search.searchEntities({
          type: "case", party: doc._id, includeUnpublished: true, limit: 100,
        })
      : null;

  const caseIds = [
    ...new Set([
      ...cases.map((c) => c.case_id),
      ...(orgCases?.items ?? []).map((c) => c.id),
    ]),
  ];

  const [names, caseDocs, articles] = await Promise.all([
    nameMap([
      ...links.map((l) => l.other_id),
      ...caseIds,
      ...proceedings.map((p) => p.case_id),
    ]),
    couch.getMany(caseIds),
    // Priradené články sú väzba, nie hľadanie: view odpovedá presne a hneď po
    // uložení, a `org_id` v Lucene indexe nie je (jeho zmena = celý rebuild).
    queries.articlesOfEntity(doc._id, { limit: 100 }),
  ]);

  // Časová os osoby: udalosti káuz, v ktorých má rolu, plus samotné role ako
  // body v čase. Odpovedá na „čo sa s ňou kedy dialo", nie na „v čom figuruje".
  const timeline = [];
  for (const { case_id, role } of cases) {
    timeline.push({
      at: role.valid_from,
      kind: "role",
      case_id,
      case: names[case_id]?.name ?? case_id,
      label: role.role,
      current: !role.valid_to,
      sources: role.sources ?? [],
    });
    if (role.valid_to) {
      timeline.push({
        at: role.valid_to, kind: "role_ended", case_id,
        case: names[case_id]?.name ?? case_id, label: role.role, sources: role.sources ?? [],
      });
    }
  }
  for (const caseDoc of caseDocs) {
    const children = await queries.caseChildren(caseDoc._id);
    for (const event of children.events) {
      if (type === "person" && !(event.person_ids ?? []).includes(doc._id)) continue;
      timeline.push({
        at: event.occurred_on,
        kind: event.kind === "expected" ? "event_expected" : "event",
        case_id: caseDoc._id,
        case: names[caseDoc._id]?.name ?? caseDoc._id,
        label: event.title,
        category: event.category,
        sources: event.sources ?? [],
      });
    }
  }
  timeline.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return {
    [type]: adminDoc(doc),
    proceedings: proceedings.map((p) => ({
      ...adminDoc(p),
      case: names[p.case_id] ?? null,
    })),
    links: links.map((l) => ({
      ...adminDoc(l.doc),
      direction: l.direction,
      other_id: l.other_id,
      other: names[l.other_id] ?? null,
    })),
    cases: cases.map((c) => ({
      case_id: c.case_id,
      case: names[c.case_id] ?? null,
      role: adminDoc(c.role),
    })),
    org_cases: (orgCases?.items ?? []).map((c) => ({ id: c.id, title: c.title, publish_state: c.publish_state })),
    articles,
    timeline,
    names,
    sources: await sourceMap([doc, ...links.map((l) => l.doc)]),
  };
}

adminPersons.patch("/:id", validate.body(schemas.patchBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "person") throw notFound("osoba");

  const updated = await store.updateDoc({
    id: doc._id,
    rev: req.body.rev,
    patch: req.body.patch,
    actor: actorOf(req),
    reason: req.body.reason,
  });

  res.json({ person: adminDoc(updated) });
});

adminPersons.post("/:id/publish", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "person") throw notFound("osoba");

  const updated = await store.publishDoc({
    id: doc._id,
    rev: req.body?.rev,
    actor: actorOf(req),
    reason: req.body?.reason ?? "zverejnenie osoby",
  });
  res.json({ person: adminDoc(updated) });
});

// Vrátenie osoby do konceptu — pozri poznámku pri kauze.
adminPersons.post("/:id/unpublish", validate.body(schemas.hideBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "person") throw notFound("osoba");

  const updated = await store.updateDoc({
    id: doc._id,
    rev: req.body.rev,
    patch: { publish_state: "draft" },
    actor: actorOf(req),
    reason: req.body.reason,
  });
  res.json({ person: adminDoc(updated) });
});

/**
 * Merging duplicates is not optional: the crawler will create them from name
 * variants, and two half-profiles of the same person are worse than none
 * (backend-zadanie.md §6).
 *
 * Roles and links are repointed, name variants are merged, and the losing
 * document is hidden rather than deleted — its id may be referenced from
 * anywhere, including an outside link.
 */
adminPersons.post(
  "/merge",
  requireRole("admin"),
  validate.body(schemas.mergeBody),
  async (req, res) => {
    const { keep_id, merge_id, reason } = req.body;
    if (keep_id === merge_id) throw badRequest("nedá sa zlúčiť osoba sama so sebou");

    const [keep, merge] = await couch.getMany([keep_id, merge_id]);
    if (!keep || keep.type !== "person") throw notFound("cieľová osoba");
    if (!merge || merge.type !== "person") throw notFound("zlučovaná osoba");

    const actor = actorOf(req);
    const moved = { roles: 0, links: 0 };

    const rows = await queries.personCases(merge_id);
    for (const { role } of rows) {
      await store.updateDoc({
        id: role._id,
        patch: { person_id: keep_id },
        actor,
        reason: `zlúčenie osôb: ${reason}`,
      });
      moved.roles++;
    }

    const links = await queries.linksOf(merge_id);
    for (const { doc } of links) {
      await store.updateDoc({
        id: doc._id,
        patch: {
          from_id: doc.from_id === merge_id ? keep_id : doc.from_id,
          to_id: doc.to_id === merge_id ? keep_id : doc.to_id,
        },
        actor,
        reason: `zlúčenie osôb: ${reason}`,
      });
      moved.links++;
    }

    const variants = [
      ...new Set([...(keep.name_variants ?? []), ...(merge.name_variants ?? []), merge.full_name]),
    ].filter(Boolean);

    await store.updateDoc({
      id: keep_id,
      patch: { name_variants: variants },
      actor,
      reason: `zlúčenie osôb: ${reason}`,
    });

    await store.updateDoc({
      id: merge_id,
      patch: { publish_state: "hidden", merged_into: keep_id },
      actor,
      reason: `zlúčené do ${keep_id}: ${reason}`,
    });

    await syncCasesOfPerson(keep_id, actor);

    res.json({ keep_id, merge_id, moved });
  },
);

export const adminOrgs = Router();

// backend-zadanie.md §6 lists no create route for organisations, but a case
// cannot be filtered by a political party that nobody can enter. Same shape as
// the other editorial types.
adminOrgs.get("/", validate.query(schemas.adminEntitiesQuery), async (req, res) => {
  res.json(await listEntities("org", req.validQuery));
});

adminOrgs.get("/:id", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "org") throw notFound("subjekt");
  res.json(await entityDetail(doc, "org"));
});

adminOrgs.post("/", validate.body(schemas.orgCreateBody), async (req, res) => {
  if (await queries.slugTaken("org", req.body.slug)) {
    throw conflict(`slug "${req.body.slug}" je už použitý`);
  }

  const doc = await store.createDoc({
    type: "org",
    data: { ...req.body, publish_state: "draft" },
    actor: actorOf(req),
    reason: "založenie subjektu",
  });

  res.status(201).json({ org: adminDoc(doc) });
});

adminOrgs.patch("/:id", validate.body(schemas.patchBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "org") throw notFound("subjekt");

  const updated = await store.updateDoc({
    id: doc._id,
    rev: req.body.rev,
    patch: req.body.patch,
    actor: actorOf(req),
    reason: req.body.reason,
  });

  res.json({ org: adminDoc(updated) });
});

adminOrgs.post("/:id/publish", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "org") throw notFound("subjekt");

  const updated = await store.publishDoc({
    id: doc._id,
    rev: req.body?.rev,
    actor: actorOf(req),
    reason: req.body?.reason ?? "zverejnenie subjektu",
  });
  res.json({ org: adminDoc(updated) });
});

export const adminLinks = Router();

adminLinks.post("/", validate.body(schemas.linkBody), async (req, res) => {
  const [from, to] = await couch.getMany([req.body.from_id, req.body.to_id]);
  if (!from) throw notFound("východiskový subjekt prepojenia");
  if (!to) throw notFound("cieľový subjekt prepojenia");

  const doc = await store.createDoc({
    type: "link",
    data: req.body,
    actor: actorOf(req),
    reason: `nové prepojenie ${req.body.kind}`,
  });

  // Party membership feeds the case filter, so the affected cases are refreshed.
  if (from.type === "person") await syncCasesOfPerson(from._id, actorOf(req));
  if (to.type === "person") await syncCasesOfPerson(to._id, actorOf(req));

  res.status(201).json({ link: adminDoc(doc) });
});

/**
 * Ukončenie a zmazanie prepojenia sú dve rôzne veci, rovnako ako pri role:
 * členstvo, ktoré skončilo, dostane `valid_to` a zostáva v histórii; prepojenie,
 * ktoré tam nikdy nemalo byť, sa zmaže.
 */
adminLinks.patch("/:id", validate.body(schemas.linkPatchBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "link") throw notFound("prepojenie");

  const { reason, rev, ...patch } = req.body;
  const updated = await store.updateDoc({
    id: doc._id, rev, patch, actor: actorOf(req), reason,
  });

  for (const id of [doc.from_id, doc.to_id]) {
    if (id.startsWith("person:")) await syncCasesOfPerson(id, actorOf(req));
  }

  res.json({ link: adminDoc(updated) });
});

adminLinks.delete("/:id", validate.body(schemas.deleteBody), async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "link") throw notFound("prepojenie");

  await store.deleteDoc({ id: doc._id, actor: actorOf(req), reason: req.body.reason });

  // Kauza by inak ďalej vykazovala stranu, ktorej člen v nej už nefiguruje.
  for (const id of [doc.from_id, doc.to_id]) {
    if (id.startsWith("person:")) await syncCasesOfPerson(id, actorOf(req));
  }

  res.json({ deleted: doc._id });
});

// Väzby medzi záznamami: kauza ↔ osoba/subjekt, článok ↔ entita, konanie ↔
// entita a ↔ zdroj.
//
// Rozhodnutie, ktoré tieto testy strážia: rola viaže ku kauze **osobu alebo
// subjekt**, nikdy oboje. Bez toho by sa firma dala do kauzy dostať len
// nepriamo, cez členstvo svojich ľudí — a to je iná vec než obvinenie.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app, request, login, track, cleanup, cleanupRevisions, store } from "./helpers.js";

const suffix = Math.random().toString(36).slice(2, 8);

let mod;
let caseId;
let personId;
let orgId;
let articleId;
let proceedingId;
const cleanupIds = [];

const remember = (id) => {
  cleanupIds.push(track(id));
  return id;
};

beforeAll(async () => {
  mod = await login("moderator");

  const article = await store.createDoc({
    type: "article",
    data: {
      kind: "official",
      url: `https://sud.example/vazby/${suffix}`,
      title: "Uznesenie o väzbách",
      publisher: "Okresný súd Testovice",
      published_at: "2026-02-01T00:00:00Z",
      excerpt: "Testovací zdroj.",
      status: "processed",
      case_ids: [], person_ids: [], org_ids: [],
    },
    actor: { id: mod.user._id, role: "moderator" },
    reason: "test väzieb",
  });
  articleId = remember(article._id);

  const created = await mod.auth(request(app).post("/api/admin/cases"))
    .send({ title: `Kauza väzby ${suffix}`, slug: `kauza-vazby-${suffix}`, tags: [] });
  caseId = remember(created.body.case.id);

  const person = await mod.auth(request(app).post("/api/admin/persons"))
    .send({ full_name: `Testovací Väzbový ${suffix}`, slug: `testovaci-vazbovy-${suffix}` });
  personId = remember(person.body.person.id);

  const org = await mod.auth(request(app).post("/api/admin/orgs"))
    .send({ name: `TestVäzba s.r.o. ${suffix}`, slug: `testvazba-${suffix}`, kind: "company" });
  orgId = remember(org.body.org.id);

  const proceeding = await mod.auth(request(app).post(`/api/admin/cases/${caseId}/proceedings`))
    .send({
      court: "Okresný súd Testovice",
      file_number: `9T/${suffix}/2026`,
      phase: "trial",
      sources: [articleId],
    });
  proceedingId = remember(proceeding.body.proceeding.id);
});

afterAll(async () => {
  for (const id of cleanupIds) await cleanupRevisions(id);
  await cleanup();
});

describe("rola v kauze", () => {
  it("subjekt má v kauze rolu rovnako ako osoba", async () => {
    const res = await mod.auth(request(app).post(`/api/admin/cases/${caseId}/roles`))
      .send({ org_id: orgId, role: "accused", valid_from: "2026-02-01", sources: [articleId] });
    expect(res.status).toBe(201);
    remember(res.body.role.id);

    const detail = await mod.auth(request(app).get(`/api/admin/cases/${caseId}`));
    const role = detail.body.roles.find((r) => r.org_id === orgId);
    expect(role.entity_type).toBe("org");
    expect(role.entity.name).toContain("TestVäzba");

    // Profil subjektu vidí tú istú väzbu — je to jeden dotaz do toho istého view.
    const org = await mod.auth(request(app).get(`/api/admin/orgs/${orgId}`));
    expect(org.body.cases.map((c) => c.case_id)).toContain(caseId);
  });

  it("rola patrí osobe alebo subjektu, nie obom naraz ani žiadnemu", async () => {
    const both = await mod.auth(request(app).post(`/api/admin/cases/${caseId}/roles`))
      .send({ person_id: personId, org_id: orgId, role: "accused", valid_from: "2026-02-01", sources: [articleId] });
    expect(both.status).toBe(422);

    const neither = await mod.auth(request(app).post(`/api/admin/cases/${caseId}/roles`))
      .send({ role: "accused", valid_from: "2026-02-01", sources: [articleId] });
    expect(neither.status).toBe(422);
  });
});

describe("článok a entity", () => {
  it("článok sa priradí k subjektu a profil subjektu ho vidí", async () => {
    const res = await mod.auth(request(app).patch(`/api/admin/articles/${articleId}`))
      .send({ org_ids: [orgId], reason: "priradenie zdroja (subjekt)" });
    expect(res.status).toBe(200);
    // Priradenie je to, čo z kandidáta robí zdroj.
    expect(res.body.article.status).toBe("linked");

    const org = await mod.auth(request(app).get(`/api/admin/orgs/${orgId}`));
    expect(org.body.articles.map((a) => a.id)).toContain(articleId);
  });

  it("detail článku povie, ktoré konania sa oň opierajú", async () => {
    const res = await mod.auth(request(app).get(`/api/admin/articles/${articleId}`));
    expect(res.status).toBe(200);
    expect(res.body.proceedings.map((p) => p.id)).toContain(proceedingId);
    expect(res.body.proceedings[0].case.name).toContain("Kauza väzby");
  });
});

describe("konanie a entity", () => {
  it("osoba sa priradí ku konaniu menovite a vidí ho na profile", async () => {
    const res = await mod.auth(request(app).patch(`/api/admin/proceedings/${proceedingId}`))
      .send({ person_ids: [personId], reason: "obvinený v konaní" });
    expect(res.status).toBe(200);

    const person = await mod.auth(request(app).get(`/api/admin/persons/${personId}`));
    expect(person.body.proceedings.map((p) => p.id)).toContain(proceedingId);
    expect(person.body.proceedings[0].case.name).toContain("Kauza väzby");
  });

  it("konanie sa nedá nechať bez jediného zdroja", async () => {
    const res = await mod.auth(request(app).patch(`/api/admin/proceedings/${proceedingId}`))
      .send({ sources: [], reason: "pokus o odpojenie posledného zdroja" });
    expect(res.status).toBe(422);
  });
});

describe("prepojenia", () => {
  it("prepojenie sa dá založiť aj zmazať", async () => {
    const created = await mod.auth(request(app).post("/api/admin/links"))
      .send({ from_id: personId, to_id: orgId, kind: "statutory", sources: [articleId] });
    expect(created.status).toBe(201);
    const linkId = remember(created.body.link.id);

    const person = await mod.auth(request(app).get(`/api/admin/persons/${personId}`));
    expect(person.body.links.map((l) => l.id)).toContain(linkId);

    const removed = await mod.auth(request(app).delete(`/api/admin/links/${linkId}`))
      .send({ reason: "prepojenie tam nikdy nepatrilo" });
    expect(removed.status).toBe(200);

    const after = await mod.auth(request(app).get(`/api/admin/persons/${personId}`));
    expect(after.body.links.map((l) => l.id)).not.toContain(linkId);
  });
});


describe("verejná sekcia subjektov", () => {
  it("subjekt sa číta cez slug a kauzy sú rozdelené na priame a cez ľudí", async () => {
    // Verejné čítanie vidí len publikované; kauza aj subjekt sa musia najprv
    // zverejniť, inak by test overoval prázdno.
    await mod.auth(request(app).post(`/api/admin/orgs/${orgId}/publish`)).send({ reason: "test" });

    const bySlug = await request(app).get(`/api/orgs/testvazba-${suffix}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.name).toContain("TestVäzba");

    const cases = await request(app).get(`/api/orgs/testvazba-${suffix}/cases`);
    expect(cases.status).toBe(200);
    // Kauza je koncept, takže von nejde ani cez priamu rolu.
    expect(cases.body.items).toEqual([]);
    expect(Array.isArray(cases.body.via_members)).toBe(true);
  });

  it("nepublikovaný subjekt verejné API nevráti", async () => {
    const draft = await mod.auth(request(app).post("/api/admin/orgs"))
      .send({ name: `Skrytá s.r.o. ${suffix}`, slug: `skryta-${suffix}`, kind: "company" });
    remember(draft.body.org.id);

    const res = await request(app).get(`/api/orgs/skryta-${suffix}`);
    expect(res.status).toBe(404);
  });
});

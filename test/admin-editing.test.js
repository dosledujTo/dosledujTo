// Úprava a mazanie potomkov kauzy, a vrátenie publikovaného dokumentu späť
// do konceptu.
//
// Dve veci, ktoré musia platiť aj o pol roka a nedajú sa overiť pohľadom na
// kód: že po zmazaní zostane v audite, čo tam bolo, a že úprava nedokáže
// vyprázdniť zdroje. Bez zdroja sa údaj nezverejňuje — ak by to patch obišiel,
// pravidlo drží už len databáza a moderátor sa o tom dozvie ako o chybe 500.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app, request, login, track, cleanup, cleanupRevisions, couch, store } from "./helpers.js";

const suffix = Math.random().toString(36).slice(2, 8);

let admin;
let caseId;
let personId;
let articleId;

/** Zdrojovaná hodnota so zdrojom — bez nej sa nedá nič publikovať. */
const sourced = (value, sources) => ({
  value, sources, derived: false, derivation: null, disputed: [], asserted_at: null,
});

const actor = () => ({ id: admin.user._id, role: "admin" });

beforeAll(async () => {
  admin = await login("admin");

  const article = await store.createDoc({
    type: "article",
    data: {
      kind: "official",
      url: `https://sud.example/uprava/${suffix}`,
      title: "Uznesenie na test úprav",
      publisher: "Okresný súd Testovice",
      published_at: "2026-01-01T00:00:00Z",
      status: "linked",
      case_ids: [],
      person_ids: [],
    },
    actor: actor(),
    reason: "test",
  });
  articleId = track(article._id);

  const person = await store.createDoc({
    type: "person",
    data: {
      full_name: `Skúšobný Človek ${suffix}`,
      slug: `skusobny-clovek-${suffix}`,
      name_variants: [],
      short_bio: sourced("Popis.", [articleId]),
      publish_state: "draft",
    },
    actor: actor(),
    reason: "test",
  });
  personId = track(person._id);

  const kase = await store.createDoc({
    type: "case",
    data: {
      title: `Kauza na test úprav ${suffix}`,
      slug: `kauza-uprav-${suffix}`,
      summary: sourced("Popis kauzy.", [articleId]),
      status: sourced("open", [articleId]),
      phase: sourced("trial", [articleId]),
      amount: sourced(1000, [articleId]),
      kind: sourced(["public_money"], [articleId]),
      tags: [],
      person_ids: [],
      party_ids: [],
      publish_state: "draft",
    },
    actor: actor(),
    reason: "test",
  });
  caseId = track(kase._id);
});

afterAll(async () => {
  for (const id of [caseId, personId, articleId]) if (id) await cleanupRevisions(id);
  await cleanup();
});

describe("úprava udalosti", () => {
  let eventId;

  it("udalosť sa dá založiť", async () => {
    const res = await admin.auth(request(app).post(`/api/admin/cases/${caseId}/events`)).send({
      occurred_on: "2026-02-01",
      kind: "past",
      category: "hearing",
      title: "Prvé pojednávanie",
      sources: [articleId],
      person_ids: [],
    });
    expect(res.status).toBe(201);
    eventId = track(res.body.event.id);
  });

  it("úprava zmení údaj a zapíše revíziu s dôvodom", async () => {
    const res = await admin.auth(request(app).patch(`/api/admin/events/${eventId}`)).send({
      title: "Prvé pojednávanie — presunuté",
      occurred_on: "2026-03-01",
      reason: "súd zmenil termín",
    });
    expect(res.status).toBe(200);
    expect(res.body.event.occurred_on).toBe("2026-03-01");

    const revisions = await couch.view("revisions", "by_target", {
      startkey: [eventId], endkey: [eventId, {}], include_docs: true,
    });
    const reasons = revisions.rows.map((row) => row.doc.reason);
    expect(reasons).toContain("súd zmenil termín");
  });

  it("úprava bez dôvodu neprejde", async () => {
    const res = await admin.auth(request(app).patch(`/api/admin/events/${eventId}`))
      .send({ title: "Bez dôvodu" });
    expect(res.status).toBe(422);
  });

  it("úprava nedokáže vyprázdniť zdroje", async () => {
    const res = await admin.auth(request(app).patch(`/api/admin/events/${eventId}`))
      .send({ sources: [], reason: "pokus o odstránenie zdrojov" });
    expect(res.status).toBe(422);
  });

  it("zmazanie vyžaduje dôvod", async () => {
    const res = await admin.auth(request(app).delete(`/api/admin/events/${eventId}`)).send({});
    expect(res.status).toBe(422);
  });

  it("zmazaná udalosť zmizne, ale jej obsah zostane v audite", async () => {
    const res = await admin.auth(request(app).delete(`/api/admin/events/${eventId}`))
      .send({ reason: "duplicitný záznam" });
    expect(res.status).toBe(200);
    expect(await couch.get(eventId)).toBeNull();

    // Toto je celý zmysel cvičenia: dokument je preč, ale z revízie sa dá
    // prečítať, čo v ňom bolo a kto ho zmazal.
    const revisions = await couch.view("revisions", "by_target", {
      startkey: [eventId], endkey: [eventId, {}], include_docs: true,
    });
    const removal = revisions.rows.map((row) => row.doc).find((doc) => /^zmazané:/.test(doc.reason ?? ""));
    expect(removal).toBeTruthy();
    expect(removal.actor_id).toBe(admin.user._id);
    // `diff` sú len `remove` operácie — z tých sa obsah prečítať nedá, preto
    // musí byť v revízii aj snímka zmazaného dokumentu.
    expect(removal.snapshot.title).toBe("Prvé pojednávanie — presunuté");
    expect(removal.snapshot.sources).toEqual([articleId]);
  });
});

describe("role v kauze", () => {
  let roleId;

  beforeAll(async () => {
    const res = await admin.auth(request(app).post(`/api/admin/cases/${caseId}/roles`)).send({
      person_id: personId,
      role: "suspect",
      valid_from: "2026-01-15",
      sources: [articleId],
    });
    expect(res.status).toBe(201);
    roleId = track(res.body.role.id);
  });

  it("ukončenie role ju zachová v histórii", async () => {
    const res = await admin.auth(request(app).post(`/api/admin/roles/${roleId}/end`))
      .send({ valid_to: "2026-04-01", reason: "obvinenie zrušené" });
    expect(res.status).toBe(200);
    expect(res.body.role.valid_to).toBe("2026-04-01");

    // Rola stále existuje — to je rozdiel oproti zmazaniu.
    const doc = await couch.get(roleId);
    expect(doc).toBeTruthy();
    expect(doc.role).toBe("suspect");
  });

  it("ukončiť sa dá len raz", async () => {
    const res = await admin.auth(request(app).post(`/api/admin/roles/${roleId}/end`))
      .send({ valid_to: "2026-05-01" });
    expect(res.status).toBe(422);
  });

  it("zmazanie role prepočíta osoby na kauze", async () => {
    const before = await couch.get(caseId);
    expect(before.person_ids).toContain(personId);

    const res = await admin.auth(request(app).delete(`/api/admin/roles/${roleId}`))
      .send({ reason: "omylom priradená osoba" });
    expect(res.status).toBe(200);

    // Bez prepočtu by osoba ostala vo filtri kauzy, hoci v nej už nefiguruje.
    const after = await couch.get(caseId);
    expect(after.person_ids ?? []).not.toContain(personId);
  });
});

describe("konania ako samostatná sekcia", () => {
  let proceedingId;
  const fileNumber = `9T/${suffix}/2026`;

  beforeAll(async () => {
    const res = await admin.auth(request(app).post(`/api/admin/cases/${caseId}/proceedings`)).send({
      court: "Okresný súd Testovice",
      file_number: fileNumber,
      phase: "trial",
      sources: [articleId],
      decisions: [],
    });
    expect(res.status).toBe(201);
    proceedingId = track(res.body.proceeding.id);
  });

  it("zoznam vráti konanie s názvom kauzy, nie len s jej id", async () => {
    const res = await admin.auth(request(app).get("/api/admin/proceedings")).query({ q: fileNumber });
    expect(res.status).toBe(200);

    const found = res.body.items.find((item) => item.id === proceedingId);
    expect(found).toBeTruthy();
    expect(found.case.name).toContain("Kauza na test úprav");
    expect(res.body.courts).toContain("Okresný súd Testovice");
  });

  it("filter podľa súdu funguje", async () => {
    const res = await admin.auth(request(app).get("/api/admin/proceedings"))
      .query({ court: "Okresný súd Testovice" });
    expect(res.status).toBe(200);
    expect(res.body.items.every((item) => item.court === "Okresný súd Testovice")).toBe(true);
  });

  it("úprava spisovej značky sa prejaví v zozname", async () => {
    const changed = `9T/${suffix}/2027`;
    const res = await admin.auth(request(app).patch(`/api/admin/proceedings/${proceedingId}`))
      .send({ file_number: changed, reason: "oprava preklepu" });
    expect(res.status).toBe(200);

    const list = await admin.auth(request(app).get("/api/admin/proceedings")).query({ q: changed });
    expect(list.body.items.some((item) => item.id === proceedingId)).toBe(true);
  });

  it("odstránenie konania zmaže dokument", async () => {
    const res = await admin.auth(request(app).delete(`/api/admin/proceedings/${proceedingId}`))
      .send({ reason: "konanie sem nepatrí" });
    expect(res.status).toBe(200);
    expect(await couch.get(proceedingId)).toBeNull();
  });
});

describe("vrátenie do konceptu", () => {
  it("publikovaná kauza sa dá vrátiť späť", async () => {
    const publish = await admin.auth(request(app).post(`/api/admin/cases/${caseId}/publish`))
      .send({ reason: "test" });
    expect(publish.status).toBe(200);
    expect(publish.body.case.publish_state).toBe("published");

    const res = await admin.auth(request(app).post(`/api/admin/cases/${caseId}/unpublish`))
      .send({ reason: "chýba overenie sumy" });
    expect(res.status).toBe(200);
    expect(res.body.case.publish_state).toBe("draft");
  });

  it("vrátenie bez dôvodu neprejde", async () => {
    const res = await admin.auth(request(app).post(`/api/admin/cases/${caseId}/unpublish`)).send({});
    expect(res.status).toBe(422);
  });

  it("to isté platí pre osobu", async () => {
    await admin.auth(request(app).post(`/api/admin/persons/${personId}/publish`)).send({ reason: "test" });

    const res = await admin.auth(request(app).post(`/api/admin/persons/${personId}/unpublish`))
      .send({ reason: "nesprávne meno" });
    expect(res.status).toBe(200);
    expect(res.body.person.publish_state).toBe("draft");
  });
});

describe("úprava názvu a mena", () => {
  it("názov kauzy sa dá opraviť, adresa zostáva", async () => {
    const before = await couch.get(caseId);
    const res = await admin.auth(request(app).patch(`/api/admin/cases/${caseId}`)).send({
      patch: { title: `Opravená kauza ${suffix}`, tags: ["doprava"] },
      reason: "preklep v názve",
    });
    expect(res.status).toBe(200);
    expect(res.body.case.title).toBe(`Opravená kauza ${suffix}`);
    expect(res.body.case.tags).toEqual(["doprava"]);
    // Adresa je verejný odkaz — oprava názvu ju nesmie zmeniť.
    expect(res.body.case.slug).toBe(before.slug);
  });

  it("meno osoby sa dá opraviť, adresa zostáva", async () => {
    const before = await couch.get(personId);
    const res = await admin.auth(request(app).patch(`/api/admin/persons/${personId}`)).send({
      patch: { full_name: `Opravený Človek ${suffix}` },
      reason: "preklep v mene",
    });
    expect(res.status).toBe(200);
    expect(res.body.person.full_name).toBe(`Opravený Človek ${suffix}`);
    expect(res.body.person.slug).toBe(before.slug);
  });
});

describe("zdroje kauzy", () => {
  it("články sa dajú filtrovať podľa kauzy na serveri", async () => {
    await admin.auth(request(app).patch(`/api/admin/articles/${articleId}`))
      .send({ case_ids: [caseId], reason: "pripojenie zdroja ku kauze" });

    const res = await admin.auth(request(app).get("/api/admin/articles")).query({ case_id: caseId });
    expect(res.status).toBe(200);
    expect(res.body.items.map((item) => item.id)).toContain(articleId);
  });
});

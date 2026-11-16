// The coverage backend-zadanie.md §9 calls mandatory: sourced-field validation,
// revision writing, authorization, and accepting or rejecting a suggestion.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  app, request, login, track, cleanup, cleanupRevisions, couch, store,
} from "./helpers.js";
import * as queries from "../packages/shared/src/queries.js";

const suffix = Math.random().toString(36).slice(2, 8);

let moderator;
let reader;
let caseId;
let articleId;

beforeAll(async () => {
  moderator = await login("moderator");
  reader = await login("user");

  const article = await store.createDoc({
    type: "article",
    data: {
      kind: "official",
      url: `https://sud.example/test/${suffix}`,
      title: "Testovacie uznesenie",
      publisher: "Okresný súd Testovice",
      published_at: "2026-01-01T00:00:00Z",
      body: "Tajný pracovný text, ktorý sa nesmie dostať von cez verejné API.",
      excerpt: "Krátky výťah.",
      status: "linked",
      case_ids: [],
      person_ids: [],
    },
    actor: { id: moderator.user._id, role: "moderator" },
    reason: "test",
  });
  articleId = track(article._id);
});

afterAll(async () => {
  if (caseId) await cleanupRevisions(caseId);
  if (articleId) await cleanupRevisions(articleId);
  await cleanup();
});

describe("autorizácia", () => {
  it("neprihlásený nemá prístup do administrácie", async () => {
    const res = await request(app).get("/api/admin/summary");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("bežný používateľ nie je moderátor", async () => {
    const res = await reader.auth(request(app).get("/api/admin/summary"));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("moderátor prejde", async () => {
    const res = await moderator.auth(request(app).get("/api/admin/summary"));
    expect(res.status).toBe(200);
    expect(res.body.coverage).toBeDefined();
  });

  it("moderátor nie je admin — skrytie kauzy je adminská operácia", async () => {
    const res = await moderator
      .auth(request(app).post(`/api/admin/cases/case:neexistuje/hide`))
      .send({ reason: "test" });
    expect(res.status).toBe(403);
  });

  it("bez CSRF tokenu neprejde žiadny zápis", async () => {
    const res = await request(app)
      .post("/api/admin/cases")
      .set("Cookie", "sid=nonsense")
      .send({ title: "X", slug: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/CSRF/);
  });
});

describe("sourced polia a zverejňovanie", () => {
  it("kauza vzniká ako draft", async () => {
    const res = await moderator.auth(request(app).post("/api/admin/cases")).send({
      title: `Testovacia kauza ${suffix}`,
      slug: `testovacia-kauza-${suffix}`,
      summary: { value: "Popis bez zdroja.", sources: [] },
      status: { value: "open", sources: [] },
      kind: { value: ["public_money"], sources: [] },
      tags: ["test"],
    });

    expect(res.status).toBe(201);
    expect(res.body.case.publish_state).toBe("draft");
    caseId = track(res.body.case.id);
  });

  it("draft nie je verejne dostupný", async () => {
    const res = await request(app).get(`/api/cases/${caseId}`);
    expect(res.status).toBe(404);
  });

  it("údaj bez zdroja sa nedá zverejniť a chyba menuje polia", async () => {
    const res = await moderator.auth(request(app).post(`/api/admin/cases/${caseId}/publish`)).send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(["kind", "status", "summary"]);
  });

  it("to isté pravidlo drží databáza aj pri obídení API", async () => {
    const doc = await couch.get(caseId);
    const err = await couch
      .put({ ...doc, publish_state: "published" })
      .catch((e) => e);

    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.message).toMatch(/no source/i);
  });

  it("po doplnení zdrojov zverejnenie prejde", async () => {
    const sourced = (value) => ({
      value,
      sources: [articleId],
      derived: false,
      derivation: null,
      disputed: [],
      asserted_at: "2026-01-01",
    });

    const patched = await moderator.auth(request(app).patch(`/api/admin/cases/${caseId}`)).send({
      reason: "doplnenie zdrojov",
      patch: { summary: sourced("Popis so zdrojom."), status: sourced("open"), kind: sourced(["public_money"]) },
    });
    expect(patched.status).toBe(200);

    const published = await moderator
      .auth(request(app).post(`/api/admin/cases/${caseId}/publish`))
      .send({});
    expect(published.status).toBe(200);
    expect(published.body.case.publish_state).toBe("published");
  });

  it("odvodený údaj bez opisu odvodenia je neplatný vstup", async () => {
    const res = await moderator.auth(request(app).patch(`/api/admin/cases/${caseId}`)).send({
      reason: "pokus o odvodenú sumu",
      patch: {
        amount: { value: 1000, sources: [articleId], derived: true, derivation: null },
      },
    });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.error.details)).toMatch(/odvoden/i);
  });

  it("verejné API nevracia nezdrojované polia ani plný text článku", async () => {
    await moderator.auth(request(app).patch(`/api/admin/cases/${caseId}`)).send({
      reason: "pole bez zdroja pre kontrolu projekcie",
      patch: { phase: { value: "trial", sources: [], derived: false, disputed: [] } },
    });

    const res = await request(app).get(`/api/cases/${caseId}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.value).toBe("Popis so zdrojom.");
    // Present in the document, absent from the response: no source, no publication.
    expect(res.body.phase).toBeUndefined();

    const sources = Object.values(res.body.sources);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(source.body).toBeUndefined();
  });
});

describe("revízie", () => {
  it("každý zápis zanechá revíziu s dôvodom a autorom", async () => {
    const revisions = await queries.revisionsOfTarget(caseId);

    expect(revisions.length).toBeGreaterThanOrEqual(3);
    expect(revisions[0].diff.length).toBeGreaterThan(0);
    expect(revisions.every((r) => r.actor_id === moderator.user._id)).toBe(true);
    expect(revisions.map((r) => r.reason)).toContain("doplnenie zdrojov");
    // The chain starts at creation, which is what makes a revert a replay.
    expect(revisions[0].target_rev_before).toBeNull();
  });

  it("úprava bez zmeny obsahu nezapíše revíziu navyše", async () => {
    const before = (await queries.revisionsOfTarget(caseId)).length;
    const doc = await couch.get(caseId);

    await store.updateDoc({
      id: caseId,
      patch: { title: doc.title },
      actor: { id: moderator.user._id, role: "moderator" },
      reason: "žiadna zmena",
    });

    expect((await queries.revisionsOfTarget(caseId)).length).toBe(before);
  });

  it("zastaraný _rev je konflikt, nie tichý prepis", async () => {
    const res = await moderator.auth(request(app).patch(`/api/admin/cases/${caseId}`)).send({
      rev: "1-zastarany",
      reason: "pokus o prepis",
      patch: { title: "Prepísané" },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details.current_rev).toBeDefined();
  });

  it("revízia nikdy neobsahuje hash hesla", async () => {
    const user = await store.createDoc({
      type: "user",
      data: {
        email: `secret-${suffix}@example.test`,
        password_hash: "$argon2id$v=19$m=19456,t=2,p=1$tajne",
        role: "user",
        status: "active",
      },
      actor: { id: "system:test", role: "admin" },
      reason: "test",
    });
    track(user._id);

    const [revision] = await queries.revisionsOfTarget(user._id);
    expect(JSON.stringify(revision.diff)).not.toContain("tajne");
    expect(JSON.stringify(revision.diff)).toMatch(/\[secret:[0-9a-f]{12}\]/);

    await cleanupRevisions(user._id);
  });
});

describe("správa účtov", () => {
  // Účty sa zakladajú raz pre celý blok: každý tracked dokument predlžuje
  // upratovanie v `afterAll`.
  let admin;
  let superadmin;
  let otherAdmin;
  let target;

  beforeAll(async () => {
    admin = await login("admin");
    superadmin = await login("superadmin");
    otherAdmin = await login("admin");
    target = await login("moderator");
  });

  afterAll(async () => {
    for (const account of [admin, superadmin, otherAdmin, target]) {
      if (account) await cleanupRevisions(account.user._id);
    }
  });

  it("admin upraví profil, meno aj stav moderátora", async () => {
    const renamed = await admin
      .auth(request(app).patch(`/api/admin/users/${target.user._id}`))
      .send({ display_name: "Premenovaný moderátor", reason: "oprava mena" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.user.display_name).toBe("Premenovaný moderátor");

    const deactivated = await admin
      .auth(request(app).patch(`/api/admin/users/${target.user._id}`))
      .send({ status: "blocked", reason: "dočasná deaktivácia" });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.user.status).toBe("blocked");

    const reactivated = await admin
      .auth(request(app).patch(`/api/admin/users/${target.user._id}`))
      .send({ status: "active", reason: "späť do práce" });
    expect(reactivated.body.user.status).toBe("active");
  });

  it("admin nezasiahne do účtu iného admina, ani neprideľuje rolu admina, ani nevypne seba", async () => {
    const foreign = await admin
      .auth(request(app).patch(`/api/admin/users/${otherAdmin.user._id}`))
      .send({ status: "blocked", reason: "pokus o zásah do cudzieho účtu" });
    expect(foreign.status).toBe(403);

    const promote = await admin
      .auth(request(app).patch(`/api/admin/users/${target.user._id}`))
      .send({ role: "admin", reason: "pokus o povýšenie" });
    expect(promote.status).toBe(403);

    const self = await admin
      .auth(request(app).patch(`/api/admin/users/${admin.user._id}`))
      .send({ status: "blocked", reason: "pokus o vypnutie seba" });
    expect(self.status).toBe(403);
  });

  it("superadmin upraví profil, stav aj rolu admina", async () => {
    const res = await superadmin
      .auth(request(app).patch(`/api/admin/users/${otherAdmin.user._id}`))
      .send({ display_name: "Správca", status: "blocked", reason: "deaktivácia admina" });
    expect(res.status).toBe(200);
    expect(res.body.user.display_name).toBe("Správca");
    expect(res.body.user.status).toBe("blocked");

    const promoted = await superadmin
      .auth(request(app).patch(`/api/admin/users/${otherAdmin.user._id}`))
      .send({ role: "superadmin", status: "active", reason: "povýšenie" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.role).toBe("superadmin");
  });
});

describe("podnety", () => {
  it("podnet bez zdroja sa neprijíma", async () => {
    const res = await request(app)
      .post(`/api/cases/${caseId}/suggestions`)
      .set("Cookie", "csrf=t")
      .set("x-csrf-token", "t")
      .send({ source_urls: [], comment: "toto je nepresné" });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.error.details)).toMatch(/zdroj/);
  });

  it("podnet môže poslať aj neprihlásený a moderátor ho vidí vo fronte", async () => {
    const res = await request(app)
      .post(`/api/cases/${caseId}/suggestions`)
      .set("Cookie", "csrf=t")
      .set("x-csrf-token", "t")
      .send({
        source_urls: ["https://skuska.example/oprava"],
        path: "summary",
        proposed_value: { value: "Presnejší popis." },
        comment: "Popis je zastaraný.",
      });

    expect(res.status).toBe(201);
    expect(res.body.suggestion.status).toBe("pending");
    track(res.body.suggestion.id);

    const queue = await moderator.auth(request(app).get("/api/admin/suggestions?status=pending"));
    expect(queue.status).toBe(200);
    expect(queue.body.items.some((s) => s.id === res.body.suggestion.id)).toBe(true);
  });

  it("prijatie zapíše hodnotu, zachová overené zdroje a označí revíziu podnetom", async () => {
    const created = await request(app)
      .post(`/api/cases/${caseId}/suggestions`)
      .set("Cookie", "csrf=t")
      .set("x-csrf-token", "t")
      .send({
        source_urls: ["https://skuska.example/oprava"],
        path: "summary",
        proposed_value: { value: "Prijatý popis." },
      });
    const suggestionId = track(created.body.suggestion.id);

    const res = await moderator
      .auth(request(app).post(`/api/admin/suggestions/${suggestionId}/accept`))
      .send({ note: "prijaté" });

    expect(res.status).toBe(200);
    expect(res.body.suggestion.status).toBe("accepted");
    expect(res.body.applied.summary.value).toBe("Prijatý popis.");
    // A URL in a suggestion is not a source: the article has to be entered first.
    expect(res.body.applied.summary.sources).toEqual([articleId]);

    const revisions = await queries.revisionsOfTarget(caseId);
    expect(revisions.at(-1).suggestion_id).toBe(suggestionId);
  });

  it("zamietnutie vyžaduje dôvod a uloží ho", async () => {
    const created = await request(app)
      .post(`/api/cases/${caseId}/suggestions`)
      .set("Cookie", "csrf=t")
      .set("x-csrf-token", "t")
      .send({ source_urls: ["https://skuska.example/nezmysel"], comment: "zmeňte to" });
    const suggestionId = track(created.body.suggestion.id);

    const missing = await moderator
      .auth(request(app).post(`/api/admin/suggestions/${suggestionId}/reject`))
      .send({});
    expect(missing.status).toBe(422);

    const res = await moderator
      .auth(request(app).post(`/api/admin/suggestions/${suggestionId}/reject`))
      .send({ reason: "zdroj netvrdí to, čo podnet" });

    expect(res.status).toBe(200);
    expect(res.body.suggestion.status).toBe("rejected");
    expect(res.body.suggestion.review_note).toBe("zdroj netvrdí to, čo podnet");
  });

  it("prijatý podnet sa nedá prijať druhýkrát", async () => {
    const created = await request(app)
      .post(`/api/cases/${caseId}/suggestions`)
      .set("Cookie", "csrf=t")
      .set("x-csrf-token", "t")
      .send({ source_urls: ["https://skuska.example/x"], comment: "dvakrát" });
    const id = track(created.body.suggestion.id);

    await moderator.auth(request(app).post(`/api/admin/suggestions/${id}/accept`)).send({});
    const second = await moderator
      .auth(request(app).post(`/api/admin/suggestions/${id}/accept`))
      .send({});

    expect(second.status).toBe(422);
  });
});

describe("podnet k subjektu", () => {
  it("subjekt má vlastný endpoint podnetu so zdrojom", async () => {
    const agent = request.agent(app);
    const csrf = await agent.get("/api/auth/csrf");
    const res = await agent
      .post("/api/orgs/org:0192a1b0-7c04-7000-8000-000000000002/suggestions")
      .set("x-csrf-token", csrf.body.csrf_token)
      .send({ source_urls: ["https://skuska.example/podnet"], comment: "test podnetu k subjektu" });
    expect(res.status).toBe(201);
    expect(res.body.suggestion.target.type).toBe("org");
    track(res.body.suggestion.id);
  });
});

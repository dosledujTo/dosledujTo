// Dátový model míľnika 2 („Červená niť", kap. 4 a 7.3): druh kauzy, dopad,
// vrátené peniaze, nové fázy, číselník fáz so segmentom metriky a väzba
// udalosti na konanie. Beží proti testovacej CouchDB, takže overuje API aj
// `validate_doc_update` naraz.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as couch from "../packages/shared/src/couch.js";
import { app, request, login, track, cleanup, cleanupRevisions } from "./helpers.js";

const suffix = Math.random().toString(36).slice(2, 8);
const CASE_A = "case:0192a1b0-7c05-7000-8000-000000000001"; // Testovací most
const CASE_B = "case:0192a1b0-7c05-7000-8000-000000000002"; // Skúšobné dotácie
const PROCEEDING_B = "proceeding:0192a1b0-7c08-7000-8000-000000000002";
const PROCEEDING_A = "proceeding:0192a1b0-7c08-7000-8000-000000000001";
const ARTICLE = "article:0192a1b0-7c02-7000-8000-000000000001";

let admin;
let moderator;
const created = [];

const sv = (value, sources = [ARTICLE]) => ({
  value, sources, derived: false, derivation: null, disputed: [], asserted_at: "2026-01-01",
});

beforeAll(async () => {
  admin = await login("admin");
  moderator = await login("moderator");
});

afterAll(async () => {
  for (const id of created) await cleanupRevisions(id);
  await cleanup();
});

async function draftCase(extra = {}) {
  const res = await moderator.auth(request(app).post("/api/admin/cases")).send({
    title: `Kauza modelu ${suffix} ${created.length}`,
    slug: `kauza-modelu-${suffix}-${created.length}`,
    summary: sv("Popis."),
    status: sv("open"),
    ...extra,
  });
  if (res.body?.case?.id) {
    created.push(track(res.body.case.id));
  }
  return res;
}

describe("druh kauzy", () => {
  it("kauza bez druhu sa nezverejní a chyba menuje pole", async () => {
    const res = await draftCase();
    expect(res.status).toBe(201);
    const pub = await moderator.auth(request(app).post(`/api/admin/cases/${res.body.case.id}/publish`)).send({});
    expect(pub.status).toBe(422);
    expect(pub.body.error.details.map((d) => d.field)).toContain("kind");
  });

  it("neznámy druh odmietne už API, nie až databáza", async () => {
    const res = await draftCase({ kind: sv(["korupcia"]) });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/druh kauzy/);
  });

  it("databáza nepustí zverejnenú kauzu bez druhu ani pri obídení API", async () => {
    const res = await draftCase();
    const doc = await couch.get(res.body.case.id);
    const err = await couch.put({ ...doc, publish_state: "published" }).catch((e) => e);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.message).toMatch(/kind/);
  });

  it("nefinančná kauza s dopadom sa zverejní a filter podľa druhu ju nájde", async () => {
    const res = await draftCase({
      kind: sv(["investigation_interference", "abuse_of_power"]),
      impact: sv({ value: 6, unit: "odvolaných vyšetrovateľov", note: "test" }),
    });
    expect(res.status).toBe(201);
    const pub = await moderator.auth(request(app).post(`/api/admin/cases/${res.body.case.id}/publish`)).send({});
    expect(pub.status).toBe(200);

    // Druhý druh stačí na filter; hlavný je prvý.
    const list = await request(app).get("/api/cases").query({ case_kind: "abuse_of_power", limit: 200 });
    const item = list.body.items.find((i) => i.id === res.body.case.id);
    expect(item).toBeTruthy();
    expect(item.kind_main).toBe("investigation_interference");
    expect(item.impact_unit).toBe("odvolaných vyšetrovateľov");
    expect(list.body.facets.kind_main).toBeTruthy();
  });

  it("dopad a vrátená suma musia mať správny tvar", async () => {
    const bad = await draftCase({ kind: sv(["other"]), impact: sv(6) });
    expect(bad.status).toBe(422);
    const cents = await draftCase({ kind: sv(["public_money"]), recovered_amount: sv(12.5) });
    expect(cents.status).toBe(422);
  });
});

describe("fázy konania", () => {
  it("`final` už nie je fáza — rozdelila sa na odsúdenie a oslobodenie", async () => {
    const res = await draftCase({ kind: sv(["public_money"]), phase: sv("final") });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/fáza konania/);
    const ok = await draftCase({ kind: sv(["public_money"]), phase: sv("lapsed") });
    expect(ok.status).toBe(201);
  });

  it("každá fáza má v číselníku segment metriky", async () => {
    const res = await moderator.auth(request(app).get("/api/admin/codelists")).query({ kind: "phase" });
    const items = res.body.groups[0].items;
    expect(items.map((i) => i.code).sort()).toEqual(
      ["acquitted", "appeal", "charges", "convicted", "halted", "indictment", "investigation", "lapsed", "trial"]);
    expect(items.every((i) => i.bucket)).toBe(true);
    expect(res.body.groups[0].missing).toEqual([]);
  });

  it("fáza bez segmentu sa do číselníka nezaloží", async () => {
    const doc = await couch.get("codelist:0192a1b0-7c0f-7000-8000-000000000101");
    const err = await couch.put({ ...doc, bucket: null }).catch((e) => e);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.message).toMatch(/bucket/);
  });

  it("segment patrí len k fáze", async () => {
    const res = await admin.auth(request(app).post("/api/admin/codelists"))
      .send({ kind: "case_tag", code: `tag-${suffix}`, name: "Tag", bucket: "trial", reason: "test" });
    expect(res.status).toBe(422);
  });
});

describe("udalosť a konanie", () => {
  const event = (proceeding_id) => ({
    occurred_on: "2027-03-01", kind: "expected", category: "hearing",
    title: `Pojednávanie ${suffix}`, sources: [ARTICLE], proceeding_id,
  });

  it("udalosť sa viaže na konanie tej istej kauzy", async () => {
    const res = await moderator.auth(request(app).post(`/api/admin/cases/${CASE_A}/events`)).send(event(PROCEEDING_A));
    expect(res.status).toBe(201);
    created.push(track(res.body.event.id));
    expect(res.body.event.proceeding_id).toBe(PROCEEDING_A);

    const pub = await request(app).get(`/api/cases/${CASE_A}`);
    expect(pub.body.events.find((e) => e.id === res.body.event.id).proceeding_id).toBe(PROCEEDING_A);
  });

  it("konanie inej kauzy sa odmietne", async () => {
    const res = await moderator.auth(request(app).post(`/api/admin/cases/${CASE_A}/events`)).send(event(PROCEEDING_B));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/inej kauze/);
  });

  it("databáza odmietne proceeding_id, ktoré nie je id konania", async () => {
    const doc = await couch.get("event:0192a1b0-7c07-7000-8000-000000000004");
    const err = await couch.put({ ...doc, proceeding_id: CASE_B }).catch((e) => e);
    expect(err.code).toBe("VALIDATION_FAILED");
  });
});

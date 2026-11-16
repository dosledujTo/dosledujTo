// Číselníky. Dva druhy s rôznymi pravidlami, a tie pravidlá sú celý zmysel
// obrazovky: `court` a `case_tag` si obsah určujú samy, `event_category`
// a `link_type` sú viazané na enum, ktorý stráži `validate_doc_update`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app, request, login, track, cleanup, cleanupRevisions } from "./helpers.js";

const suffix = Math.random().toString(36).slice(2, 8);

let admin;
let moderator;
const created = [];

beforeAll(async () => {
  admin = await login("admin");
  moderator = await login("moderator");
});

afterAll(async () => {
  for (const id of created) await cleanupRevisions(id);
  await cleanup();
});

async function createCourt(name, code) {
  const res = await admin
    .auth(request(app).post("/api/admin/codelists"))
    .send({ kind: "court", code, name, reason: "test číselníka" });
  if (res.body?.codelist?.id) {
    created.push(res.body.codelist.id);
    track(res.body.codelist.id);
  }
  return res;
}

describe("číselníky", () => {
  it("moderátor číselník číta — bez neho nevyplní formulár", async () => {
    const res = await moderator.auth(request(app).get("/api/admin/codelists"));
    expect(res.status).toBe(200);

    const kinds = res.body.groups.map((group) => group.kind);
    expect(kinds).toEqual(["court", "case_tag", "event_category", "link_type", "phase", "case_kind"]);

    // Viazaný číselník hlási, čím je viazaný; voľný nie.
    const categories = res.body.groups.find((g) => g.kind === "event_category");
    expect(categories.bound_to_enum).toContain("hearing");
    expect(res.body.groups.find((g) => g.kind === "court").bound_to_enum).toBeNull();
  });

  it("moderátor číselník nemení", async () => {
    const res = await moderator
      .auth(request(app).post("/api/admin/codelists"))
      .send({ kind: "case_tag", code: `test-${suffix}`, name: "Test", reason: "pokus" });
    expect(res.status).toBe(403);
  });

  it("položka sa založí, deaktivuje a znova aktivuje", async () => {
    const created = await createCourt(`Okresný súd Skúšobný ${suffix}`, `os-skusobny-${suffix}`);
    expect(created.status).toBe(201);
    expect(created.body.codelist.active).toBe(true);

    const id = created.body.codelist.id;
    const off = await admin
      .auth(request(app).patch(`/api/admin/codelists/${id}`))
      .send({ active: false, reason: "súd sa zlúčil" });
    expect(off.status).toBe(200);
    expect(off.body.codelist.active).toBe(false);

    const on = await admin
      .auth(request(app).patch(`/api/admin/codelists/${id}`))
      .send({ active: true, reason: "späť do ponuky" });
    expect(on.body.codelist.active).toBe(true);
  });

  it("rovnaký kód v tom istom číselníku druhýkrát neprejde", async () => {
    const first = await createCourt(`Krajský súd Skúšobný ${suffix}`, `ks-skusobny-${suffix}`);
    expect(first.status).toBe(201);

    const again = await createCourt(`Iný názov ${suffix}`, `ks-skusobny-${suffix}`);
    expect(again.status).toBe(409);
  });

  it("do viazaného číselníka sa nedá pridať hodnota, ktorú by databáza odmietla", async () => {
    const res = await admin
      .auth(request(app).post("/api/admin/codelists"))
      .send({
        kind: "event_category",
        code: `vymyslena-${suffix}`.replace(/[^a-z0-9-]/g, "-"),
        name: "Vymyslená kategória",
        reason: "test",
      });
    // `badRequest` je 422 VALIDATION_FAILED, nie 400 — je to odmietnutá hodnota.
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("hearing");
  });

  it("súd, ktorý je vedený v konaniach, sa nepremenuje — jeho názov je hodnota", async () => {
    const list = await admin.auth(request(app).get("/api/admin/codelists?kind=court"));
    const used = list.body.groups[0].items.find((item) => item.usage > 0);
    // Fixtures vedú konania na „Okresný súd Testovice"; bez nich nie je čo testovať.
    expect(used, "fixtures musia byť naliate (npm run couch:fixtures)").toBeTruthy();

    const res = await admin
      .auth(request(app).patch(`/api/admin/codelists/${used.id}`))
      .send({ name: `${used.name} (premenovaný)`, reason: "pokus o premenovanie" });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("konaniach");

    // Odmietnutie nesmie nič zapísať.
    const after = await admin.auth(request(app).get("/api/admin/codelists?kind=court"));
    expect(after.body.groups[0].items.find((item) => item.id === used.id).name).toBe(used.name);
  });

  it("nepoužitá položka sa premenuje bez námietok", async () => {
    const res = await createCourt(`Špecializovaný súd ${suffix}`, `sts-${suffix}`);
    expect(res.status).toBe(201);

    const renamed = await admin
      .auth(request(app).patch(`/api/admin/codelists/${res.body.codelist.id}`))
      .send({ name: `Špecializovaný trestný súd ${suffix}`, reason: "presnejší názov" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.codelist.name).toContain("trestný");
  });
});

describe("číselníky — dotaz na jeden druh", () => {
  it("súdy mimo číselníka sa hlásia len pri dotaze na súdy", async () => {
    const tags = await admin.auth(request(app).get("/api/admin/codelists?kind=case_tag"));
    expect(tags.status).toBe(200);
    expect(tags.body.groups).toHaveLength(1);
    // Inak by pri dotaze na tagy vyšiel ako „mimo číselníka" každý súd.
    expect(tags.body.unlisted_courts).toEqual([]);

    const courts = await admin.auth(request(app).get("/api/admin/codelists?kind=court"));
    expect(courts.body.groups[0].kind).toBe("court");
  });
});

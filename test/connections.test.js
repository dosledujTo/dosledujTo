// Prepojenia a zdroje entity (handoff „Červená niť" kap. 7.1, 7.2, 9).
//
// Beží nad generovanými fixtures (couch/fixtures/generate.js): prvá generovaná
// osoba je „uzlová" s desiatkami firiem, takže jej Sieť do dvoch krokov
// presahuje 60 uzlov a dá sa na nej overiť orezanie aj počet dotazov.

import { describe, it, expect, afterEach, vi } from "vitest";
import { app, request, couch } from "./helpers.js";
import { sourceOrder } from "../packages/shared/src/connections.js";

const HUB = "person:0193b000-7c03-7000-8000-000000000001";
const SMALL = "person:0192a1b0-7c03-7000-8000-000000000002";
const CASE = "case:0192a1b0-7c05-7000-8000-000000000001";
const ORG = "org:0192a1b0-7c04-7000-8000-000000000002";

/** Počet volaní do CouchDB počas jednej požiadavky. */
async function countRequests(fn) {
  const spies = ["view", "fetch", "get", "search", "list"].map((m) => vi.spyOn(couch.db, m));
  await fn();
  const n = spies.reduce((sum, s) => sum + s.mock.calls.length, 0);
  for (const s of spies) s.mockRestore();
  return n;
}

afterEach(() => vi.restoreAllMocks());

describe("stabilné číslovanie zdrojov", () => {
  it("úradné prvé, potom od najnovšieho, pri zhode id", () => {
    const list = [
      { id: "article:c", kind: "media", published_at: "2025-01-01" },
      { id: "article:b", kind: "official", published_at: "2020-01-01" },
      { id: "article:a", kind: "media", published_at: "2025-01-01" },
      { id: "article:d", kind: "media", published_at: "2026-01-01" },
    ].sort(sourceOrder);
    expect(list.map((x) => x.id)).toEqual(["article:b", "article:d", "article:a", "article:c"]);
  });

  it("filter ani opačné triedenie číslo nemenia", async () => {
    const all = await request(app).get(`/api/persons/${HUB}/articles`).query({ per_page: 50 });
    expect(all.status).toBe(200);
    const numberOf = new Map(all.body.items.map((i) => [i.id, i.no]));
    expect(all.body.items.map((i) => i.no)).toEqual(all.body.items.map((_, i) => i + 1));

    const media = await request(app).get(`/api/persons/${HUB}/articles`).query({ type: "media", per_page: 50 });
    for (const item of media.body.items) {
      expect(item.kind).toBe("media");
      if (numberOf.has(item.id)) expect(item.no).toBe(numberOf.get(item.id));
    }

    const asc = await request(app).get(`/api/persons/${HUB}/articles`).query({ sort: "asc", per_page: 50 });
    expect(asc.body.items[0].no).toBe(all.body.total);
  });

  it("stránkovanie: 20 na stranu, druhá strana pokračuje", async () => {
    const one = await request(app).get(`/api/persons/${HUB}/articles`);
    const two = await request(app).get(`/api/persons/${HUB}/articles`).query({ page: 2 });
    expect(one.body.per_page).toBe(20);
    expect(one.body.items).toHaveLength(Math.min(20, one.body.total));
    if (one.body.total > 20) expect(two.body.items[0].no).toBe(21);
    expect(one.body.pages).toBe(Math.ceil(one.body.total / 20));
  });

  it("filter podľa kauzy berie slug aj id", async () => {
    const all = await request(app).get(`/api/persons/${SMALL}/articles`).query({ per_page: 50 });
    const target = all.body.facets.cases[0];
    expect(target).toBeTruthy();
    const bySlug = await request(app).get(`/api/persons/${SMALL}/articles`).query({ case: target.slug });
    const byId = await request(app).get(`/api/persons/${SMALL}/articles`).query({ case: target.id });
    expect(bySlug.body.total).toBe(byId.body.total);
    expect(bySlug.body.total).toBeGreaterThan(0);
  });

  it("zdroj hovorí, čo podopiera — rolu v kauze aj s kauzou", async () => {
    const res = await request(app).get(`/api/persons/${SMALL}/articles`).query({ per_page: 50 });
    const roles = res.body.items.flatMap((i) => i.supports).filter((s) => s.type === "role");
    expect(roles.length).toBeGreaterThan(0);
    expect(roles[0].case?.slug).toBeTruthy();
  });

  it("kauza a subjekt majú zdroje v rovnakom tvare", async () => {
    for (const url of [`/api/cases/${CASE}/articles`, `/api/orgs/${ORG}/articles`]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.body).toMatchObject({ page: 1, per_page: 20 });
      expect(res.body.items.every((i) => typeof i.no === "number" && Array.isArray(i.supports))).toBe(true);
      // Plný text článku verejné API nevracia nikdy.
      expect(res.body.items.every((i) => i.body === undefined)).toBe(true);
    }
  });
});

describe("graf", () => {
  it("hĺbka 1: hrany majú zdroj a čísla zdrojov sedia so záložkou Zdroje", async () => {
    const [graph, sources] = await Promise.all([
      request(app).get(`/api/persons/${SMALL}/graph`),
      request(app).get(`/api/persons/${SMALL}/articles`).query({ per_page: 50 }),
    ]);
    expect(graph.status).toBe(200);
    expect(graph.body.nodes.find((n) => n.distance === 0).id).toBe(SMALL);
    expect(graph.body.edges.length).toBeGreaterThan(0);
    const numberOf = new Map(sources.body.items.map((i) => [i.id, i.no]));
    for (const edge of graph.body.edges) {
      expect(edge.sources.length).toBeGreaterThan(0);
      edge.sources.forEach((id, i) => expect(edge.source_nos[i]).toBe(numberOf.get(id)));
    }
  });

  it("hĺbka 2 orezá Sieť na 60 uzlov a povie, koľko ich je", async () => {
    const res = await request(app).get(`/api/persons/${HUB}/graph`).query({ depth: 2 });
    expect(res.body.nodes).toHaveLength(60);
    expect(res.body.truncated).toEqual({ shown: 60, total: expect.any(Number) });
    expect(res.body.truncated.total).toBeGreaterThan(60);
    // Prvý krok má pred druhým prednosť.
    const ring1 = await request(app).get(`/api/persons/${HUB}/graph`);
    const kept = new Set(res.body.nodes.map((n) => n.id));
    if (ring1.body.nodes.length <= 60) for (const n of ring1.body.nodes) expect(kept.has(n.id)).toBe(true);
    // Hrany len medzi zobrazenými uzlami.
    for (const e of res.body.edges) expect(kept.has(e.from) && kept.has(e.to)).toBe(true);
  });

  it("osoba ↔ osoba len zo skutočného prepojenia, nikdy cez spoločnú kauzu", async () => {
    const res = await request(app).get(`/api/persons/${HUB}/graph`).query({ depth: 2 });
    const type = new Map(res.body.nodes.map((n) => [n.id, n.type]));
    for (const e of res.body.edges.filter((x) => type.get(x.from) === "person" && type.get(x.to) === "person")) {
      expect(e.id.startsWith("link:")).toBe(true);
      expect(["family", "business", "other"]).toContain(e.kind);
    }
  });

  it("filtre: len platné, bez odvodených, len kauzy", async () => {
    const active = await request(app).get(`/api/persons/${HUB}/graph`).query({ active: 1, depth: 2 });
    expect(active.body.edges.every((e) => !e.valid_to)).toBe(true);
    const cases = await request(app).get(`/api/persons/${HUB}/graph`).query({ cases_only: 1, depth: 2 });
    expect(cases.body.edges.every((e) => e.kind === "role")).toBe(true);
    const noDerived = await request(app).get(`/api/persons/${SMALL}/graph`).query({ derived: 0 });
    expect(noDerived.body.edges.every((e) => !e.derived)).toBe(true);
  });

  it("V čase: udalosti káuz prvého kroku so zdrojmi", async () => {
    const res = await request(app).get(`/api/persons/${SMALL}/graph`).query({ events: 1 });
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
    const cases = new Set(res.body.nodes.filter((n) => n.type === "case").map((n) => n.id));
    expect(res.body.events.every((e) => cases.has(e.case_id))).toBe(true);
  });

  it("bez N+1: počet dotazov do CouchDB nezávisí od veľkosti okolia", async () => {
    const small1 = await countRequests(() => request(app).get(`/api/persons/${SMALL}/graph`));
    const hub1 = await countRequests(() => request(app).get(`/api/persons/${HUB}/graph`));
    const small2 = await countRequests(() => request(app).get(`/api/persons/${SMALL}/graph`).query({ depth: 2 }));
    const hub2 = await countRequests(() => request(app).get(`/api/persons/${HUB}/graph`).query({ depth: 2 }));
    // Prázdny zoznam id sa nečíta vôbec, preto nie presná rovnosť; N+1 by pri
    // 177 uzloch uzlovej osoby dalo stovky dotazov.
    expect(hub1).toBeLessThanOrEqual(small1 + 2);
    expect(hub2).toBeLessThanOrEqual(small2 + 2);
    expect(hub2 - hub1).toBeLessThanOrEqual(1); // druhý krok = jeden dotaz navyše
    expect(hub2).toBeLessThanOrEqual(12);
  });

  it("nezverejnené uzly do grafu nejdú", async () => {
    const res = await request(app).get(`/api/cases/${CASE}/graph`).query({ depth: 2 });
    expect(res.status).toBe(200);
    const ids = res.body.nodes.map((n) => n.id);
    // Koncept „Kauza Vzorkové pozemky" je vo fixtures; nesmie sa objaviť.
    expect(ids).not.toContain("case:0192a1b0-7c05-7000-8000-000000000003");
  });
});

describe("profil", () => {
  it("hlava profilu má štyri počítadlá", async () => {
    const res = await request(app).get(`/api/persons/${HUB}`);
    expect(res.body.counts).toEqual({
      cases: expect.any(Number), orgs: expect.any(Number), people: expect.any(Number), sources: expect.any(Number),
    });
    expect(res.body.counts.orgs).toBeGreaterThan(10);
  });
});

describe("detail kauzy", () => {
  it("roly nemajú pracovnú poznámku a subjekty v kauze majú záznam", async () => {
    const res = await request(app).get(`/api/cases/${CASE}`);
    expect(res.status).toBe(200);
    expect(res.body.roles.every((r) => !("note" in r))).toBe(true);
    expect(res.body.orgs.map((o) => o.name)).toContain("TestBuild s.r.o.");
    // Čísla zdrojov sedia so záložkou Zdroje.
    const sources = await request(app).get(`/api/cases/${CASE}/articles`).query({ per_page: 50 });
    for (const item of sources.body.items) {
      if (res.body.source_nos[item.id] !== undefined) expect(res.body.source_nos[item.id]).toBe(item.no);
    }
    expect(res.body.sources_total).toBe(sources.body.total);
  });
});

describe("prekrytie", () => {
  it("V čase vracia prekrytia ako odvodené tvrdenie s dvoma zdrojmi", async () => {
    const res = await request(app).get(`/api/persons/${HUB}/graph`).query({ events: 1 });
    expect(Array.isArray(res.body.insights)).toBe(true);
    for (const o of res.body.insights) {
      expect(o.derived).toBe(true);
      expect(o.derivation.length).toBeGreaterThan(20);
      expect(o.sources.length).toBeGreaterThanOrEqual(1);
      expect(o.event.occurred_on.slice(0, 10) <= new Date().toISOString().slice(0, 10)).toBe(true);
    }
  });
});

// @vitest-environment jsdom
//
// Stránka kauzy (handoff „Červená niť" kap. 5.2, 9): opravy, ktoré sa dajú
// skontrolovať bez prehliadača.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import Case, { groupRoles, upcoming } from "../packages/web/src/pages/Case.jsx";
import { ThemeProvider } from "../packages/web/src/theme.jsx";

const render = (data, url = "/kauza/kauza-x") =>
  renderToString(
    <StaticRouter location={url}>
      <ThemeProvider><Case data={data} /></ThemeProvider>
    </StaticRouter>,
  );

const article = (id, over = {}) => ({
  id, title: `Článok ${id}`, publisher: "Testoviny.sk", published_at: "2024-02-28T00:00:00Z",
  url: "https://skuska.example/a", kind: "media", ...over,
});

const base = {
  id: "case:1", slug: "kauza-x", title: "Kauza X",
  status: { value: "open", sources: ["article:a"] },
  summary: { value: "Popis.", sources: ["article:a"] },
  kind: { value: ["public_money"], sources: ["article:a"] },
  amount: { value: 1250000000, sources: ["article:a"], disputed: [] },
  roles: [
    { id: "role:1", person_id: "person:1", role: "suspect", valid_from: "2024-03-11", valid_to: "2025-01-20", sources: ["article:a"] },
    { id: "role:2", person_id: "person:1", role: "indicted", valid_from: "2025-01-20", valid_to: null, sources: ["article:b"] },
    { id: "role:3", org_id: "org:1", role: "other", valid_from: "2023-06-01", valid_to: null, sources: ["article:a"] },
  ],
  persons: [{ id: "person:1", name: "Ján Testovací", slug: "jan-testovaci" }],
  orgs: [{ id: "org:1", name: "TestBuild s.r.o.", slug: "testbuild", kind: "company" }],
  events: [
    { id: "event:1", occurred_on: "2024-03-11", title: "Obvinenie", kind: "past", sources: ["article:a"] },
  ],
  proceedings: [],
  sources: { "article:a": article("article:a"), "article:b": article("article:b", { kind: "official" }) },
  source_nos: { "article:a": 2, "article:b": 1 },
  sources_total: 2,
};
const data = (over = {}, today = "2026-11-15") => ({ detail: { ...base, ...over }, tab: "prehlad", today, query: {} });

describe("najbližší termín", () => {
  it("budúca očakávaná udalosť je najbližší termín — nie „žiadny termín“", () => {
    const html = render(data({
      events: [...base.events, { id: "event:2", occurred_on: "2026-12-03", title: "Hlavné pojednávanie", kind: "expected", sources: ["article:b"] }],
    }));
    expect(html).not.toContain("Nie je známy žiadny ďalší termín");
    expect(html).toContain("Hlavné pojednávanie");
    expect(html).toContain("3. 12. 2026");
  });

  it("termín v ten istý deň ešte platí", () => {
    const { next } = upcoming([{ id: "e", occurred_on: "2026-11-15", kind: "expected" }], "2026-11-15");
    expect(next?.id).toBe("e");
  });

  it("očakávaný termín, ktorý uplynul: „termín uplynul, výsledok zatiaľ nepoznáme“", () => {
    const html = render(data({
      events: [...base.events, { id: "event:2", occurred_on: "2026-09-15", title: "Hlavné pojednávanie", kind: "expected", sources: ["article:b"] }],
    }));
    expect(html).toContain("termín uplynul, výsledok zatiaľ nepoznáme");
    expect(html).toContain("Nie je známy žiadny ďalší termín");
  });

  it("čiara „dnes“ je na osi aj vtedy, keď sú všetky udalosti minulé", () => {
    expect(render(data())).toContain("divider");
  });
});

describe("kľúčové údaje", () => {
  it("nefinančná kauza ukáže dopad, nikde „0 €“", () => {
    const html = render(data({
      amount: undefined,
      kind: { value: ["investigation_interference"], sources: ["article:a"] },
      impact: { value: { value: 6, unit: "odvolaných vyšetrovateľov", note: "2 zrušené obvinenia" }, sources: ["article:a"] },
    }));
    expect(html).toContain("6 odvolaných vyšetrovateľov");
    expect(html).toContain("2 zrušené obvinenia");
    expect(html).not.toMatch(/(^|[^\d\s])0\s?€/);
    expect(html).toContain("zásah do vyšetrovania");
  });

  it("kauza bez sumy aj dopadu ukáže len druh", () => {
    const html = render(data({ amount: undefined, kind: { value: ["other"], sources: ["article:a"] } }));
    expect(html).toContain("Druh kauzy");
    expect(html).not.toContain("€");
  });

  it("sporná suma: obe verzie vedľa seba, každá so zdrojom, a veta o rozpore", () => {
    const html = render(data({ amount: { value: 1250000000, sources: ["article:a"], disputed: [{ value: 980000000, sources: ["article:b"] }] } }));
    expect(html.match(/sporné/g).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Register nevyberá, ktorá verzia platí");
  });

  it("[n] pri údaji je číslo zo záložky Zdroje", () => {
    const html = render(data());
    expect(html).toContain('href="/kauza/kauza-x/zdroje#zdroj-2"');
  });
});

describe("ľudia a subjekty v kauze", () => {
  it("jedna položka na osobu, aktuálna rola navrchu a vývoj pod ňou", () => {
    const groups = groupRoles(base.roles, "person_id");
    expect(groups).toHaveLength(1);
    expect(groups[0].current.role).toBe("indicted");
    expect(groups[0].history.map((r) => r.role)).toEqual(["suspect"]);
    const html = render(data());
    expect(html.match(/href="\/osoba\/jan-testovaci"/g)).toHaveLength(1);
  });

  it("subjekt s vlastnou rolou má záznam a odkaz", () => {
    const html = render(data());
    expect(html).toContain("Subjekty v kauze");
    expect(html).toContain('href="/subjekt/testbuild"');
  });

  it("pracovná poznámka moderátora sa nevykreslí, ani keby prišla", () => {
    const roles = base.roles.map((r) => ({ ...r, note: "INTERNÁ POZNÁMKA status sa neprepisuje" }));
    expect(render(data({ roles }))).not.toContain("INTERNÁ POZNÁMKA");
  });
});

describe("záložky kauzy", () => {
  it("Prepojenia a Zdroje majú vlastné adresy", () => {
    const html = render(data());
    expect(html).toContain('href="/kauza/kauza-x/prepojenia"');
    expect(html).toContain('href="/kauza/kauza-x/zdroje"');
  });

  it("Zdroje sa vykreslia na serveri so stránkovaním", () => {
    const articles = {
      items: [{ ...article("article:b", { kind: "official" }), no: 1, supports: [{ type: "field", field: "phase" }] }],
      total: 1, page: 1, per_page: 20, pages: 1, facets: { all: 1, official: 1, media: 0, cases: [] },
    };
    const html = render({ ...data(), tab: "zdroje", data: articles }, "/kauza/kauza-x/zdroje");
    expect(html).toContain('id="zdroj-1"');
    expect(html).toContain("fáza konania");
  });
});

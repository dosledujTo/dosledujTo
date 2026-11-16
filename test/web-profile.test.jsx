// @vitest-environment jsdom
//
// Profil osoby a subjektu so štyrmi záložkami (handoff „Červená niť" kap. 3, 9).
// Testuje sa to, čo nie je len vzhľad:
//
//   - každá záložka sa vykreslí na serveri, bez JS,
//   - `[n]` vedie na správnu stranu záložky Zdroje,
//   - viac rolí v jednej kauze je jeden uzol, nie dva riadky,
//   - subjekt oddeľuje vlastnú rolu v kauze od kauz cez svojich ľudí,
//   - stránkovanie a filtre sú odkazy, ktoré fungujú bez JS.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import Profile from "../packages/web/src/pages/Profile.jsx";
import { sourceHref } from "../packages/web/src/components/profile.jsx";
import { mapModel } from "../packages/web/src/components/ConnectionMap.jsx";
import { supportText } from "../packages/web/src/components/SourcesTab.jsx";
import { ThemeProvider } from "../packages/web/src/theme.jsx";

const render = (data, url) =>
  renderToString(
    <StaticRouter location={url}>
      <ThemeProvider><Profile data={data} /></ThemeProvider>
    </StaticRouter>,
  );

const P = "person:jan";
const person = {
  id: P, slug: "jan-testovaci", full_name: "Ján Testovací", birth_year: 1971,
  short_bio: { value: "Bývalý poslanec.", sources: ["article:3"] },
  links: [{ id: "link:1", valid_from: "2018-01-01" }],
  counts: { cases: 1, orgs: 2, people: 2, sources: 25 },
  source_nos: { "article:3": 3 },
};

const graph = {
  nodes: [
    { id: P, type: "person", slug: "jan-testovaci", label: "Ján Testovací", meta: {}, distance: 0 },
    { id: "org:party", type: "org", slug: "strana", label: "Strana Testovacia", meta: { kind: "party" }, distance: 1 },
    { id: "org:firm", type: "org", slug: "testbuild", label: "TestBuild s.r.o.", meta: { kind: "company" }, distance: 1 },
    { id: "case:most", type: "case", slug: "kauza-most", label: "Kauza Testovací most",
      meta: { amount: 1250000000, status: "open", phase: "indictment", kind: ["public_money"] }, distance: 1 },
    { id: "case:nonmoney", type: "case", slug: "kauza-spisy", label: "Kauza Spisy",
      meta: { amount: null, impact: { value: 14, unit: "zastavených spisov" }, status: "open", phase: null, kind: ["investigation_interference"] }, distance: 1 },
    { id: "person:eva", type: "person", slug: "eva", label: "Eva Skúšobná", meta: {}, distance: 2 },
  ],
  edges: [
    { id: "link:1", from: P, to: "org:party", kind: "member", role: null, valid_from: "2018-01-01", valid_to: null, derived: false, sources: ["article:3"], source_nos: [3] },
    { id: "link:2", from: P, to: "org:firm", kind: "statutory", role: null, valid_from: "2019-03-01", valid_to: "2024-01-31", derived: true, derivation: "z obchodného registra", sources: ["article:3"], source_nos: [3] },
    { id: "role:1", from: P, to: "case:most", kind: "role", role: "suspect", valid_from: "2024-03-11", valid_to: "2025-01-20", derived: false, sources: ["article:2"], source_nos: [2] },
    { id: "role:2", from: P, to: "case:most", kind: "role", role: "indicted", valid_from: "2025-01-20", valid_to: null, derived: false, sources: ["article:25"], source_nos: [25] },
    { id: "role:3", from: P, to: "case:nonmoney", kind: "role", role: "witness", valid_from: "2024-01-01", valid_to: null, derived: false, sources: ["article:4"], source_nos: [4] },
    { id: "role:4", from: "person:eva", to: "case:most", kind: "role", role: "witness", valid_from: "2024-05-01", valid_to: null, derived: false, sources: ["article:5"], source_nos: [5] },
  ],
  events: [
    { id: "event:1", case_id: "case:most", occurred_on: "2024-03-11", kind: "past", category: "charge", title: "Obvinenie", sources: ["article:2"], source_nos: [2] },
    { id: "event:2", case_id: "case:most", occurred_on: "2027-02-03", kind: "expected", category: "hearing", title: "Pojednávanie", sources: ["article:25"], source_nos: [25] },
  ],
  truncated: null,
  sources: {},
};

const base = (tab, extra = {}) => ({ kind: "person", tab, doc: person, data: graph, query: {}, today: "2026-11-15", ...extra });

describe("záložky profilu sa vykreslia na serveri", () => {
  it("Mapa: SVG aj zoznam pre úzku obrazovku, aktívna záložka má aria-current", () => {
    const html = render(base("mapa"), "/osoba/jan-testovaci");
    expect(html).toContain('class="map-svg"');
    expect(html).toContain('class="map-list"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/osoba\/jan-testovaci"|<a[^>]*href="\/osoba\/jan-testovaci"[^>]*aria-current="page"/);
    expect(html).toContain("Strana Testovacia");
    expect(html).toContain("/kauza/kauza-most");
  });

  it("V čase: riadok pre firmu, stranu aj kauzu, čiara DNES a budúca udalosť", () => {
    const html = render(base("v-case"), "/osoba/jan-testovaci/v-case");
    expect(html.match(/class="tl-track"/g)).toHaveLength(4);
    expect(html).toContain("DNES");
    expect(html).toContain("tl-ev future");
    expect(html).toContain("tl-bar org ended derived");
  });

  it("Sieť: bez JS zoznam uzlov podľa vzdialenosti a hláška o orezaní", () => {
    const html = render(base("siet", { data: { ...graph, truncated: { shown: 60, total: 143 } } }), "/osoba/jan-testovaci/siet");
    expect(html).toContain('class="net-list"');
    expect(html).toContain("1 krok");
    expect(html).toContain("2 kroky");
    expect(html).toContain("Zobrazených 60 z 143. Zúž filter.");
    // Filtre sú odkazy s parametrom v URL, nie klientský stav.
    expect(html).toContain('href="/osoba/jan-testovaci/siet?platne=1"');
  });

  it("Zdroje: číslo z API, stránkovanie a filtre ako odkazy", () => {
    const articles = {
      items: [{ id: "article:21", no: 21, title: "Uznesenie", publisher: "Okresný súd Testovice", published_at: "2024-01-01T00:00:00Z",
        url: "https://sud.example/a", kind: "official", archive_url: null,
        supports: [{ type: "role", role: "indicted", case: { id: "case:most", type: "case", slug: "kauza-most", name: "Kauza Testovací most" }, valid_from: "2025-01-20", valid_to: null }] }],
      total: 25, page: 2, per_page: 20, pages: 2,
      facets: { all: 25, official: 5, media: 20, cases: [{ id: "case:most", slug: "kauza-most", name: "Kauza Testovací most", count: 9 }] },
    };
    const html = render(base("zdroje", { data: articles, query: { strana: "2" } }), "/osoba/jan-testovaci/zdroje?strana=2");
    expect(html).toContain('id="zdroj-21"');
    expect(html).toContain("[<!-- -->21<!-- -->]");
    expect(html).toContain("úradný dokument");
    expect(html).toContain("obžalovaný · Kauza Testovací most · od 1/2025");
    expect(html).toMatch(/aria-current="page"[^>]*>2</);
    expect(html).toContain('href="/osoba/jan-testovaci/zdroje?typ=urad"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("čísla zdrojov", () => {
  it("[n] vedie na správnu stranu Zdrojov pri 20 na stranu", () => {
    expect(sourceHref("/osoba/x", 3)).toBe("/osoba/x/zdroje#zdroj-3");
    expect(sourceHref("/osoba/x", 20)).toBe("/osoba/x/zdroje#zdroj-20");
    expect(sourceHref("/osoba/x", 25)).toBe("/osoba/x/zdroje?strana=2#zdroj-25");
  });

  it("popis v hlave profilu má číslo zo záložky Zdroje", () => {
    const html = render(base("mapa"), "/osoba/jan-testovaci");
    expect(html).toContain('href="/osoba/jan-testovaci/zdroje#zdroj-3"');
  });
});

describe("Mapa", () => {
  it("viac rolí v jednej kauze je jeden uzol s aktuálnou rolou navrchu", () => {
    const model = mapModel(graph, P);
    const most = model.cases.filter((r) => r.node.id === "case:most");
    expect(most).toHaveLength(1);
    expect(most[0].edges[0].role).toBe("indicted");
    expect(most[0].edges[1].role).toBe("suspect");
  });

  it("platné väzby pred ukončenými", () => {
    const model = mapModel(graph, P);
    expect(model.left.map((r) => r.node.id)).toEqual(["org:party", "org:firm"]);
  });

  it("nefinančná kauza ukáže dopad, nikdy „0 €“", () => {
    const html = render(base("mapa"), "/osoba/jan-testovaci");
    expect(html).toContain("14 zastavených spisov");
    expect(html).not.toMatch(/>0\s?€/);
  });

  it("ľudia v okolí cez spoločnú kauzu", () => {
    const model = mapModel(graph, P);
    expect(model.around.map((a) => a.node.label)).toEqual(["Eva Skúšobná"]);
    expect(model.around[0].through.label).toContain("Kauza Testovací most");
  });
});

describe("subjekt", () => {
  const O = "org:firm";
  const orgGraph = {
    ...graph,
    nodes: [
      { id: O, type: "org", slug: "testbuild", label: "TestBuild s.r.o.", meta: { kind: "company" }, distance: 0 },
      { id: P, type: "person", slug: "jan-testovaci", label: "Ján Testovací", meta: {}, distance: 1 },
      { id: "case:own", type: "case", slug: "kauza-vlastna", label: "Kauza vlastná", meta: { amount: 100, status: "open", kind: ["public_money"] }, distance: 1 },
      { id: "case:most", type: "case", slug: "kauza-most", label: "Kauza Testovací most", meta: { amount: 100, status: "open", kind: ["public_money"] }, distance: 2 },
    ],
    edges: [
      { id: "link:2", from: P, to: O, kind: "statutory", role: null, valid_from: "2019-03-01", valid_to: null, derived: false, sources: ["article:3"], source_nos: [3] },
      { id: "role:9", from: O, to: "case:own", kind: "role", role: "accused", valid_from: "2024-01-01", valid_to: null, derived: false, sources: ["article:7"], source_nos: [7] },
      { id: "role:2", from: P, to: "case:most", kind: "role", role: "indicted", valid_from: "2025-01-20", valid_to: null, derived: false, sources: ["article:2"], source_nos: [2] },
    ],
  };
  const orgDoc = { id: O, slug: "testbuild", name: "TestBuild s.r.o.", kind: "company", counts: { cases: 1, orgs: 0, people: 1, sources: 7 } };

  it("vlastná rola a kauzy cez ľudí sú dve rôzne väzby", () => {
    const model = mapModel(orgGraph, O);
    const own = model.cases.find((r) => r.node.id === "case:own");
    const via = model.cases.find((r) => r.node.id === "case:most");
    expect(own.isVia).toBeFalsy();
    expect(via.isVia).toBe(true);
    expect(via.via).toEqual(["Ján Testovací"]);
  });

  it("stránka to hovorí slovom, nie len štýlom čiary", () => {
    const html = render({ kind: "org", tab: "mapa", doc: orgDoc, data: orgGraph, query: {}, today: "2026-11-15" }, "/subjekt/testbuild");
    expect(html).toContain("Vlastná rola v kauze");
    expect(html).toContain("To nie je tvrdenie o subjekte");
    expect(html).toContain("cez: Ján Testovací");
  });
});

describe("čo zdroj podopiera", () => {
  it("čip skladá rolu, kauzu a obdobie; odvodené prepojenie to povie", () => {
    expect(supportText({ type: "link", kind: "statutory", other: { name: "TestBuild" }, valid_from: "2019-03-01", valid_to: "2024-01-31", derived: true }))
      .toBe("štatutár · TestBuild · 3/2019–1/2024 (odvodené)");
    expect(supportText({ type: "field", field: "short_bio" })).toBe("popis osoby");
  });
});

describe("Prekrytie", () => {
  it("je označené ako odvodený údaj s oboma zdrojmi", () => {
    const insights = [{
      org: { slug: "testbuild", name: "TestBuild s.r.o." }, case: { slug: "kauza-most", name: "Kauza Testovací most" },
      link: { id: "link:2", kind: "statutory" }, event: { title: "Vznesenie obvinenia", occurred_on: "2024-03-11" },
      sources: ["article:3", "article:2"], source_nos: [3, 2], derived: true, derivation: "Obdobie väzby sa prekrýva s udalosťou.",
    }];
    const html = render(base("v-case", { data: { ...graph, insights } }), "/osoba/jan-testovaci/v-case");
    expect(html).toContain("Prekrytie");
    expect(html).toContain("odvodený údaj");
    expect(html).toContain('href="/osoba/jan-testovaci/zdroje#zdroj-2"');
    expect(html).toContain('href="/osoba/jan-testovaci/zdroje#zdroj-3"');
    expect(html).toContain('title="Obdobie väzby sa prekrýva s udalosťou."');
  });
});

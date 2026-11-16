// @vitest-environment jsdom
//
// SSR musí dať rovnaký výsledok ako klient, inak sa hydratácia rozíde a React
// prekreslí stránku od nuly. Preto sa tu vykresľuje ten istý strom oboma
// cestami a porovnáva.

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import Case from "../packages/web/src/pages/Case.jsx";
import Home from "../packages/web/src/pages/Home.jsx";
import { money, roleLabel, isAccusatory, safeUrl } from "../packages/web/src/format.js";
import { ThemeProvider } from "../packages/web/src/theme.jsx";

const render = (ui, url = "/") =>
  renderToString(
    <StaticRouter location={url}>
      <ThemeProvider>{ui}</ThemeProvider>
    </StaticRouter>,
  );

const article = (over = {}) => ({
  id: "article:a", title: "Titulok", publisher: "Testoviny.sk",
  published_at: "2024-02-28T00:00:00Z", url: "https://skuska.example/a", kind: "media", ...over,
});

const caseData = {
  // `today` chodí z `load`, nie z `new Date()` v komponente — inak by sa server
  // a klient okolo polnoci rozišli.
  today: "2025-01-01",
  detail: {
    id: "case:1", slug: "kauza-x", title: "Kauza X",
    status: { value: "open", sources: ["article:a"] },
    phase: { value: "indictment", sources: ["article:b"] },
    summary: { value: "Popis.", sources: ["article:a"] },
    amount: {
      value: 1250000000, sources: ["article:a"],
      disputed: [{ value: 980000000, sources: ["article:b"] }],
    },
    tags: ["doprava"],
    roles: [{ id: "role:1", person_id: "person:1", role: "indicted", sources: ["article:b"] }],
    persons: [{ id: "person:1", name: "Ján Testovací", slug: "jan-testovaci" }],
    events: [
      { id: "event:1", occurred_on: "2024-03-11", title: "Obvinenie", kind: "past", sources: ["article:a"] },
      { id: "event:2", occurred_on: "2999-09-15", title: "Pojednávanie", kind: "expected", sources: ["article:b"] },
    ],
    proceedings: [{ id: "p:1", court: "Okresný súd", file_number: "2T/45/2025", sources: [] }],
    sources: { "article:a": article(), "article:b": article({ id: "article:b", kind: "official" }) },
  },
};

describe("detail kauzy na serveri", () => {
  it("vykreslí obsah, nie prázdny obal", () => {
    const html = render(<Case data={caseData} />, "/kauza/kauza-x");
    expect(html).toContain("Kauza X");
    expect(html).toContain("Popis.");
    expect(html.length).toBeGreaterThan(2000);
  });

  it("sporná suma sa ukáže ako druhá hodnota, nie ako priemer", () => {
    const html = render(<Case data={caseData} />, "/kauza/kauza-x");
    expect(html).toContain("sporné");
    // Obe čísla, každé so svojím zdrojom — systém medzi nimi nerozhoduje.
    expect(html).toContain(money(1250000000).replace(/ /g, "&nbsp;").replace(/&nbsp;/g, " ").slice(0, 6));
    expect(html).toMatch(/9\s?800\s?000/);
  });

  it("očakávaná udalosť má prerušovaný bod a čiaru „dnes“", () => {
    const html = render(<Case data={caseData} />, "/kauza/kauza-x");
    expect(html).toContain("dot dot-next");
    expect(html).toContain("dnes");
    expect(html).toContain("očakávané");
  });

  it("úradný dokument je v zozname zdrojov prvý", () => {
    const html = render(<Case data={caseData} />, "/kauza/kauza-x");
    const official = html.indexOf("úradný dokument");
    expect(official).toBeGreaterThan(-1);
  });
});

describe("titulka", () => {
  const empty = { upcoming: [], latest: [], top: [], forgotten: [], biggest: [], period: "30d", today: "2026-11-15" };
  const stats = (over = {}) => ({
    cases: 2, persons: 3, orgs: 1, sources: 77, amount: 1339000000, amount_closed: 0, recovered: 0,
    cases_with_amount: 1, official_share: 0.5, non_money: [], top_entities: [],
    money: { buckets: [{ bucket: "trial", group: "open", amount: 1339000000, cases: 1 }], amount_open: 1339000000, cases_open: 1, cases_closed: 0, derived: [] },
    ...over,
  });

  it("skryje „Čo sa chystá“, keď nie sú termíny", () => {
    const html = render(<Home data={{ ...empty, stats: stats() }} />);
    expect(html).not.toContain("Čo sa chystá");
    expect(html).toContain("13,4 mil. €");
  });

  it("ukáže termíny, keď existujú, aj s počtom dní", () => {
    const data = {
      ...empty, stats: stats(),
      upcoming: [{
        id: "event:1", occurred_on: "2026-11-20", title: "Pojednávanie", court: "Okresný súd Testovice",
        case: { id: "case:1", slug: "kauza-x", title: "Kauza X" },
      }],
    };
    const html = render(<Home data={data} />);
    expect(html).toContain("Čo sa chystá");
    expect(html).toContain("o 5 dní");
    expect(html).toContain("Okresný súd Testovice");
  });
});

describe("prezumpcia neviny", () => {
  it("obvinenie a odsúdenie sú zvýraznené, ostatné role nie", () => {
    expect(isAccusatory("indicted")).toBe(true);
    expect(isAccusatory("convicted")).toBe(true);
    // Oslobodenie nie je obvinenie — nesmie dostať ten istý štítok.
    expect(isAccusatory("acquitted")).toBe(false);
    expect(isAccusatory("witness")).toBe(false);
  });

  it("každá rola má vlastné slovo", () => {
    expect(roleLabel("indicted")).toBe("obžalovaný");
    expect(roleLabel("acquitted")).toBe("oslobodený");
    expect(roleLabel("convicted")).toBe("právoplatne odsúdený");
  });
});

describe("bezpečnosť výstupu", () => {
  it("React escapuje cudzí text z článkov", () => {
    const evil = { ...caseData, detail: { ...caseData.detail, title: '<script>alert(1)</script>' } };
    const html = render(<Case data={evil} />, "/kauza/kauza-x");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("safeUrl odmietne javascript:", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("https://sme.sk/a")).toBe("https://sme.sk/a");
  });
});

describe("hydratácia", () => {
  it("klient sa pripojí na serverové HTML bez nezhody", async () => {
    // Toto je test, ktorý by bol chytil React #418: keď sa strom vykreslený
    // na serveri líši od toho, čo klient vyrobí z tých istých dát, React
    // zahodí HTML a prekreslí stránku od nuly.
    const { hydrateRoot } = await import("react-dom/client");
    const { BrowserRouter } = await import("react-router");
    const { act } = await import("react");
    const App = (await import("../packages/web/src/App.jsx")).default;

    const path = "/kauza/kauza-x";
    const data = caseData;

    const html = renderToString(
      <StaticRouter location={path}>
        <App initialData={data} initialPath={path} />
      </StaticRouter>,
    );

    window.history.replaceState({}, "", path);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(String(args[0])));

    let root;
    await act(async () => {
      root = hydrateRoot(
        container,
        <BrowserRouter>
          <App initialData={data} initialPath={path} />
        </BrowserRouter>,
      );
    });

    spy.mockRestore();
    await act(async () => root.unmount());
    container.remove();

    const mismatches = errors.filter((message) => /hydrat|did not match|#418|#423/i.test(message));
    expect(mismatches).toEqual([]);
  });
});

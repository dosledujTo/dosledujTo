// @vitest-environment jsdom
//
// Zoznamy, kalendár a podnet (handoff „Červená niť" kap. 4, 5.4–5.6).

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import Cases from "../packages/web/src/pages/Cases.jsx";
import Calendar from "../packages/web/src/pages/Calendar.jsx";
import Report from "../packages/web/src/pages/Report.jsx";
import { ThemeProvider } from "../packages/web/src/theme.jsx";

const render = (ui, url) =>
  renderToString(<StaticRouter location={url}><ThemeProvider>{ui}</ThemeProvider></StaticRouter>);

describe("/kauzy", () => {
  const items = [
    { id: "case:1", slug: "a", title: "Kauza A", status: "open", phase: "trial", amount: 500000, kind_main: "public_money" },
    { id: "case:2", slug: "b", title: "Kauza B", status: "open", phase: "investigation", kind_main: "investigation_interference", impact_value: 6, impact_unit: "odvolaných vyšetrovateľov" },
  ];

  it("pri triedení podľa sumy idú kauzy bez sumy pod oddeľovač, nie medzi nuly", () => {
    const html = render(<Cases data={{ result: { items, total: 2 }, query: {}, mode: "list" }} />, "/kauzy?sort=amount");
    expect(html).toContain("Kauzy bez sumy");
    expect(html.indexOf("Kauzy bez sumy")).toBeLessThan(html.indexOf("Kauza B"));
    expect(html).toContain("odvolaných vyšetrovateľov");
    expect(html).not.toMatch(/(^|[^\d\s])0\s?€/);
  });

  it("filter Druh, triedenie „najviac sa píše“ a „len zabudnuté“ sú vo formulári", () => {
    const html = render(<Cases data={{ result: { items, total: 2 }, query: {}, mode: "list" }} />, "/kauzy");
    expect(html).toContain('name="druh"');
    expect(html).toContain('value="najviac-pise"');
    expect(html).toContain('name="zabudnute"');
    expect(html).toContain("zásah do vyšetrovania");
  });

  it("zabudnuté: nadpis a vysvetlenie, že ostatné filtre neplatia", () => {
    const html = render(<Cases data={{ result: { items, total: 2 }, query: { zabudnute: "1" }, mode: "forgotten" }} />, "/kauzy?zabudnute=1");
    expect(html).toContain("Zabudnuté, ale nevyriešené");
    expect(html).toContain("Ostatné filtre sa tu neuplatňujú");
  });
});

describe("/kalendar", () => {
  const data = {
    items: [
      { id: "e1", occurred_on: "2026-11-20", title: "Hlavné pojednávanie", court: "Okresný súd Testovice", case: { slug: "a", title: "Kauza A" } },
      { id: "e2", occurred_on: "2026-12-04", title: "Odvolanie", court: null, case: { slug: "b", title: "Kauza B" } },
    ],
    total: 40, page: 1, per_page: 30, pages: 2,
    facets: { courts: [{ court: "Okresný súd Testovice", count: 1 }], cases: [{ slug: "a", title: "Kauza A", count: 1 }] },
  };

  it("zoskupené podľa mesiaca, so súdom a „o N dní“", () => {
    const html = render(<Calendar data={{ data, query: {}, today: "2026-11-15" }} />, "/kalendar");
    expect(html).toContain("november<!-- --> <!-- -->2026");
    expect(html).toContain("december<!-- --> <!-- -->2026");
    expect(html).toContain("Okresný súd Testovice");
    expect(html).toContain("o 5 dní");
  });

  it("filter podľa súdu a stránkovanie sú bez JS", () => {
    const html = render(<Calendar data={{ data, query: { sud: "Okresný súd Testovice" }, today: "2026-11-15" }} />, "/kalendar");
    expect(html).toContain('name="sud"');
    expect(html).toContain("strana=2");
  });
});

describe("/podnet", () => {
  it("podnet ku kauze povie, ku ktorej, a zdroj je povinný", () => {
    const html = render(<Report data={{ siteKey: null, target: { type: "case", id: "case:1", slug: "a", name: "Kauza A" } }} />, "/podnet?kauza=a");
    expect(html).toContain("Kauza A");
    expect(html).toMatch(/type="url"[^>]*required|required[^>]*type="url"/);
    expect(html).toContain("povinný");
  });

  it("bez JavaScriptu formulár neodošle nič a povie prečo", () => {
    const html = render(<Report data={{ siteKey: "x", target: null }} />, "/podnet");
    expect(html).toContain("<noscript>");
    expect(html).toMatch(/<fieldset[^>]*disabled/);
  });
});

describe("podnet z profilu subjektu", () => {
  it("povie, ku ktorému subjektu podnet je", () => {
    const html = render(<Report data={{ siteKey: null, target: { type: "org", id: "org:1", slug: "testbuild", name: "TestBuild s.r.o." } }} />, "/podnet?subjekt=testbuild");
    expect(html).toContain("Podnet k <!-- -->subjektu");
    expect(html).toContain("TestBuild s.r.o.");
  });
});

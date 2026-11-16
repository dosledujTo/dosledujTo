// @vitest-environment jsdom
//
// Titulka (handoff „Červená niť" kap. 5.1, 6, 9): nefinančná kauza nikde
// neukáže „0 €", segmenty a rebríčky sa vykreslia bez JS.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import Home from "../packages/web/src/pages/Home.jsx";
import { CaseCard, Thread } from "../packages/web/src/components/home.jsx";
import { ago } from "../packages/web/src/format.js";
import { ThemeProvider } from "../packages/web/src/theme.jsx";

const render = (ui, url = "/") =>
  renderToString(<StaticRouter location={url}><ThemeProvider>{ui}</ThemeProvider></StaticRouter>);

const BUCKETS = ["none", "investigation", "charge", "trial", "convicted", "acquitted", "discontinued", "lapsed"];
const stats = {
  cases: 3, persons: 4, orgs: 2, sources: 10, amount: 3000, amount_closed: 1000, recovered: 100, cases_with_amount: 2,
  official_share: 0.3,
  money: {
    buckets: BUCKETS.map((b) => ({ bucket: b, group: ["convicted", "acquitted", "discontinued", "lapsed"].includes(b) ? "closed" : "open",
      amount: b === "trial" ? 2000 : b === "convicted" ? 1000 : 0, cases: b === "trial" || b === "convicted" ? 1 : 0 })),
    amount_open: 2000, cases_open: 1, cases_closed: 1, derived: [{ id: "case:1", bucket: "convicted", derivation: "…" }],
  },
  non_money: [{ kind: "investigation_interference", cases: 1 }],
  top_entities: [{ id: "person:1", type: "person", slug: "jan", name: "Ján Testovací", cases: 2 }],
};
const nonfin = {
  id: "case:2", slug: "spisy", title: "Kauza Spisy", summary: "Popis.", amount: null, disputed: false,
  impact: { value: 6, unit: "odvolaných vyšetrovateľov" }, kinds: ["investigation_interference"], phase: "investigation",
  status: "open", persons: 3, orgs: 1, latest_change: { at: "2026-11-13T00:00:00Z", type: "article", title: "x", publisher: "Vzorové noviny" },
  correction: { at: "2026-11-14T10:00:00Z", fields: ["summary"] },
};
const data = {
  stats, upcoming: [], latest: [nonfin], period: "30d", today: "2026-11-15",
  top: [{ ...nonfin, articles: 12, publishers: 8, score: 9.8, trend: 50, spark: Array(24).fill(1) }],
  forgotten: [], biggest: [],
};

describe("titulka", () => {
  it("peniaze: osem segmentov, nefinančné kauzy zvlášť s odkazom na filter", () => {
    const html = render(<Home data={data} />);
    for (const b of ["trial", "convicted"]) expect(html).toContain(`mseg b-${b}`);
    expect(html).toContain("Bez trestného konania");
    expect(html).toContain("Premlčané alebo odložené");
    expect(html).toContain('href="/kauzy?druh=investigation_interference"');
    expect(html).toContain('href="/ako-pocitame"');
  });

  it("hranica otvorené / uzavreté nevyjde z bloku ani neprekryje sumu", () => {
    // 2000 z 3000 je otvorených (67 %): popisok ide doľava od značky.
    const mostlyOpen = render(<Home data={data} />);
    expect(mostlyOpen).toMatch(/class="ms-bound ms-left" style="left:66\.67%">hranica otvorené \/ uzavreté ▲/);
    // 10 % otvorených: popisok doprava od značky.
    const s2 = { ...stats, amount_closed: 2700, money: { ...stats.money, amount_open: 300 } };
    expect(render(<Home data={{ ...data, stats: s2 }} />)).toMatch(/class="ms-bound" style="left:10\.00%">▲ hranica/);
    // Všetko otvorené: niet hranice, niet popisku.
    const s3 = { ...stats, amount_closed: 0, money: { ...stats.money, amount_open: 3000 } };
    expect(render(<Home data={{ ...data, stats: s3 }} />)).not.toContain("ms-bound");
  });

  it("nefinančná kauza nikde neukáže „0 €“", () => {
    const html = render(<CaseCard c={nonfin} today="2026-11-15" />);
    expect(html).toContain("odvolaných vyšetrovateľov");
    expect(html).not.toMatch(/(^|[^\d,])0\s?€/);
    expect(html).toContain("ccard nonfin");
  });

  it("karta hovorí, čo sa pohlo, a opravu označí", () => {
    const html = render(<CaseCard c={nonfin} today="2026-11-15" />);
    expect(html).toContain("pred 2 dňami");
    expect(html).toContain("nový článok (Vzorové noviny)");
    expect(html).toContain("oprava");
  });

  it("niť: najviac 8 tvarov, potom +n", () => {
    const html = render(<Thread persons={10} orgs={2} />);
    expect(html.match(/class="t[po]"/g)).toHaveLength(8);
    expect(html).toContain("+<!-- -->4");
  });

  it("prepínač obdobia sú odkazy a „Výskyt v kauze nie je vina“", () => {
    const html = render(<Home data={data} />);
    expect(html).toContain('href="/?obdobie=12-mesiacov#najviac-sa-pise"');
    expect(html).toMatch(/▲ \+(<!-- -->)?50/);
    expect(html).toContain("Výskyt v kauze nie je vina");
  });

  it("sledovanie sa nezobrazuje, kým web nemá prihlásenie", () => {
    expect(render(<Home data={data} />)).not.toMatch(/Sledovať|Začať sledovať/);
  });

  it("relatívny čas", () => {
    expect(ago("2026-11-15", "2026-11-15")).toBe("dnes");
    expect(ago("2026-11-14", "2026-11-15")).toBe("včera");
    expect(ago("2025-11-15", "2026-11-15")).toBe("pred 12 mesiacmi");
  });
});

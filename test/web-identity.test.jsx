// @vitest-environment jsdom
//
// Vizuálna identita „Červená niť" (míľnik 1). Testuje sa to, čo nie je len
// vzhľad, ale obsah:
//
//   - stavy prezumpcie neviny sa líšia tvarom, nie len farbou,
//   - logo stojí na tokenoch, takže funguje v oboch režimoch,
//   - tmavý režim sa nastaví pred prvým vykreslením (žiadne bliknutie),
//   - pätička nesľubuje odkaz, ktorý nikam nevedie.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import { Footer, Header, RoleTag, SourceRef } from "../packages/web/src/components/chrome.jsx";
import { Logo } from "../packages/web/src/components/Logo.jsx";
import { NO_FLASH_SCRIPT, ThemeProvider } from "../packages/web/src/theme.jsx";

const CSS = readFileSync(path.resolve("packages/web/src/styles.css"), "utf8");

const render = (ui, url = "/") =>
  renderToString(
    <StaticRouter location={url}>
      <ThemeProvider>{ui}</ThemeProvider>
    </StaticRouter>,
  );

/** Telo prvého pravidla pre daný selektor. */
function rule(selector) {
  const escaped = selector.replace(/[.[\]#()*+?^$|\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[2] : null;
}

describe("RoleTag — prezumpcia neviny má tvar", () => {
  const STATES = ["suspect", "accused", "indicted", "convicted", "acquitted"];

  it("každý stav konania má vlastnú triedu", () => {
    const classes = STATES.map((role) => render(<RoleTag role={role} />).match(/class="role ([^"]+)"/)[1]);
    expect(new Set(classes).size).toBe(STATES.length);
  });

  it("triedy sa líšia tvarom, nie len farbou", () => {
    // Podozrivý je jediný s prerušovaným rámikom, odsúdený jediný s plnou
    // červenou plochou, obžalovaný a oslobodený majú podklad.
    expect(rule(".r-suspect")).toMatch(/dashed/);
    expect(rule(".r-accused")).not.toMatch(/background/);
    expect(rule(".r-indicted")).toMatch(/background:\s*var\(--accent-soft\)/);
    expect(rule(".r-convicted")).toMatch(/background:\s*var\(--accent\)/);
    expect(rule(".r-acquitted")).toMatch(/background:\s*var\(--ok-soft\)/);
  });

  it("svedok a ostatné roly sú neutrálne", () => {
    for (const role of ["witness", "victim", "investigator", "judge"]) {
      expect(render(<RoleTag role={role} />)).toContain("role r-neutral");
    }
  });

  it("ukončená rola zostáva na stránke, stlmená a s obdobím", () => {
    const html = render(<RoleTag role="indicted" ended period="2023–2025" />);
    expect(html).toContain("obžalovaný");
    expect(html).toContain("2023–2025");
    expect(html).toContain("role-wrap ended");
    expect(rule(".role-wrap.ended .role")).toMatch(/opacity:\s*\.55/);
  });
});

describe("SourceRef", () => {
  it("číslo zdroja s odkazom", () => {
    const html = render(<SourceRef no={4} href="#zdroj-4" title="Uznesenie" />);
    expect(html).toContain("[<!-- -->4<!-- -->]");
    expect(html).toContain('href="#zdroj-4"');
    expect(html).not.toContain("odvodené");
  });

  it("odvodený údaj je viditeľne odlíšený a nesie popis postupu", () => {
    const html = render(<SourceRef no={2} href="#z" derived derivation="prekrytie obdobia s udalosťou" />);
    expect(html).toContain("odvodené");
    expect(html).toContain('title="prekrytie obdobia s udalosťou"');
  });
});

describe("logo", () => {
  it("text a niť idú cez tokeny, nie natvrdo", () => {
    const html = render(<Logo />);
    expect(html).toContain("fill:var(--ink)");
    expect(html).toContain("stroke:var(--accent)");
    expect(html).not.toMatch(/fill="#|stroke="#/);
  });

  it("v hlavičke je odkazom na titulku s čitateľným menom", () => {
    const html = render(<Header />);
    expect(html).toMatch(/<a[^>]*aria-label="Dosleduj\.to — titulka"[^>]*href="\/"|<a[^>]*href="\/"[^>]*aria-label="Dosleduj\.to — titulka"/);
  });
});

describe("hlavička", () => {
  it("aktívna položka navigácie má aria-current", () => {
    const html = render(<Header />, "/subjekty");
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/subjekty"|<a[^>]*href="\/subjekty"[^>]*aria-current="page"/);
    expect(html).toContain("Firmy a strany");
  });

  it("má „Čo sa chystá“ — kalendár už existuje", () => {
    expect(render(<Header />)).toContain('href="/kalendar"');
  });
});

describe("pätička", () => {
  it("je tmavá v oboch režimoch", () => {
    expect(rule(".ftr")).toMatch(/background:\s*#151312/);
  });

  it("odkaz na podnet vedie na formulár, nie na zoznam káuz ani nikam", () => {
    const html = render(<Footer />);
    expect(html).toContain('href="/podnet"');
    expect(html).not.toContain('href="/kauzy"');
    expect(html).not.toContain('href="#"');
  });
});

describe("tmavý režim bez bliknutia", () => {
  // Node 22+ má vlastný globálny `localStorage`, ktorý v jsdom prekryje ten
  // prehliadačový a bez `--localstorage-file` nefunguje. Skript ho číta ako
  // holý identifikátor, preto sa nahrádza globálne.
  let store;
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = () => new Function(NO_FLASH_SCRIPT)();

  it("uložená voľba sa nastaví na <html> ešte pred Reactom", () => {
    localStorage.setItem("dosleduj-theme", "dark");
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("bez uloženej voľby sa riadi systémom", () => {
    window.matchMedia = (query) => ({ matches: query === "(prefers-color-scheme: dark)" });
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    window.matchMedia = () => ({ matches: false });
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("CSS má tmavé tokeny pre atribút aj pre návštevníka bez JavaScriptu", () => {
    expect(CSS).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--bg:\s*#121110/);
    expect(CSS).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{[^}]*--bg:\s*#121110/);
  });
});

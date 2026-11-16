// Prístupnosť (handoff „Červená niť" kap. 8) — to, čo sa dá overiť nad CSS
// bez prehliadača: kontrast textových tokenov v oboch režimoch, viditeľný
// fokus a vypnuté pohyby pri `prefers-reduced-motion`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CSS = readFileSync("packages/web/src/styles.css", "utf8");

/** Tokeny z prvého bloku, ktorý sa začína daným selektorom. */
function tokens(selectorStart) {
  const at = CSS.indexOf(selectorStart);
  const block = CSS.slice(CSS.indexOf("{", at) + 1, CSS.indexOf("}", at));
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("kontrast textu ≥ 4,5 : 1", () => {
  const modes = { svetlý: tokens(":root {"), tmavý: tokens(':root[data-theme="dark"]') };
  for (const [mode, t] of Object.entries(modes)) {
    for (const fg of ["ink", "muted", "accent", "ok"]) {
      for (const bg of ["bg", "surface"]) {
        it(`${mode} režim: --${fg} na --${bg}`, () => {
          expect(t[fg], `token --${fg}`).toBeTruthy();
          expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe("fokus a pohyb", () => {
  it(":focus-visible má všade 2px akcent s odsadením", () => {
    expect(CSS).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\);\s*outline-offset:\s*2px;/);
  });

  it("obrys fokusu sa nikde nevypína bez náhrady", () => {
    // Výnimky majú náhradu: uzly Siete hrubý rámik tvaru, vyhľadávacie polia
    // obrys na celom kontajneri (:focus-within).
    const offs = [...CSS.matchAll(/([^{}]+)\{[^}]*outline:\s*none/g)].map((m) => m[1].trim());
    for (const selector of offs) {
      expect(selector, selector).toMatch(/n-node:focus-visible|big-search input:focus|hdr-search input|search-row input/);
    }
  });

  it("prefers-reduced-motion vypne prechody a animácie", () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none !important;[^}]*animation:\s*none !important/);
  });
});

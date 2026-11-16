// Rozloženie stránky sa v jsdom nedá odmerať — nepočíta layout. Dá sa ale
// overiť to, na čom stojí: že reťaz flexu vedie od prvku, ktorý naozaj obaľuje
// hlavičku a pätičku, až po obsah.
//
// Túto chybu som dvakrát „opravil" na nesprávnom prvku: pravidlá boli na
// `<body>`, ale React sa montuje do `#root` a všetko je vnútri neho. Test preto
// kontroluje presne to spojenie.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CSS = readFileSync(path.resolve("packages/web/src/styles.css"), "utf8");

/** Telo pravidla pre daný selektor. */
function rule(selector) {
  const match = CSS.match(
    new RegExp(`(^|\\n)\\s*${selector.replace(/[.[\]#]/g, "\\$&")}\\s*\\{([^}]*)\\}`),
  );
  return match ? match[2] : null;
}

describe("pätička drží dno stránky", () => {
  it("reťaz začína na #root, nie na body", () => {
    const root = rule("#root");
    expect(root, "chýba pravidlo pre #root").not.toBeNull();
    expect(root).toMatch(/display:\s*flex/);
    expect(root).toMatch(/flex-direction:\s*column/);
    expect(root).toMatch(/min-height:\s*100dvh/);
  });

  it("obal stránky aj main rastú", () => {
    expect(rule(".page")).toMatch(/flex:\s*1 0 auto/);
    expect(rule("main")).toMatch(/flex:\s*1 0 auto/);
  });

  it("hlavička a pätička nerastú", () => {
    expect(rule(".hdr")).toMatch(/flex:\s*none/);
    expect(rule(".ftr")).toMatch(/flex:\s*none/);
  });
});

describe("štruktúra, ktorú reťaz predpokladá", async () => {
  // Keby niekto vložil ďalší obal medzi #root a pätičku, reťaz by sa prerušila
  // rovnako ako predtým — a stránka by opäť vyzerala v poriadku všade okrem
  // krátkeho obsahu.
  const { renderToString } = await import("react-dom/server");
  const { StaticRouter } = await import("react-router");
  const { default: App } = await import("../packages/web/src/App.jsx");

  const html = renderToString(
    <StaticRouter location="/hladat">
      <App initialData={{ q: "", entities: [], articles: [] }} initialPath="/hladat" />
    </StaticRouter>,
  );

  it("hlavička, obsah a pätička sú súrodenci na najvyššej úrovni", () => {
    // Vykreslený reťazec je obsah #root — na jeho začiatku a konci teda musia
    // stáť práve tieto tri prvky, bez obalu navyše.
    expect(html).toMatch(/^<a class="skip"[^>]*>.*?<\/a><header class="hdr"/);
    expect(html).toMatch(/<div class="page"[^>]*>/);
    expect(html).toMatch(/<footer class="ftr">.*<\/footer>$/s);
  });
});

// @vitest-environment jsdom
//
// Zoznam subjektov. Profil subjektu (vlastná rola v kauze vs. kauzy cez jeho
// ľudí) testuje `web-profile.test.jsx`.

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";

import Orgs from "../packages/web/src/pages/Orgs.jsx";
import { ThemeProvider } from "../packages/web/src/theme.jsx";

const render = (ui, url = "/") =>
  renderToString(
    <StaticRouter location={url}>
      <ThemeProvider>{ui}</ThemeProvider>
    </StaticRouter>,
  );

const listData = {
  result: {
    total: 2,
    items: [
      { id: "org:1", slug: "strana-testovacia", title: "Strana Testovacia", kind: "party" },
      { id: "org:2", slug: "testbuild-sro", title: "TestBuild s.r.o.", kind: "company", ico: "12345678" },
    ],
  },
};

describe("zoznam subjektov", () => {
  it("vykreslí druh subjektu, nie len názov", () => {
    const html = render(<Orgs data={listData} />, "/subjekty");
    expect(html).toContain("Strana Testovacia");
    expect(html).toContain("politická strana");
    expect(html).toContain("firma");
    expect(html).toContain("/subjekt/testbuild-sro");
  });
});

// @vitest-environment jsdom
//
// Navigácia kliknutím, nie obnovením stránky.
//
// Toto je test na chybu, ktorá sa v SSR aplikácii ľahko prehliadne: pri
// obnovení stránky príde všetko zo servera a funguje to, ale pri kliknutí sa
// router prepne skôr, než dorazia dáta. Nová stránka potom na okamih dostane
// dáta predchádzajúcej a spadne na tvare, ktorý nečaká.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const CASES = {
  total: 2,
  items: [
    { id: "case:1", slug: "kauza-a", title: "Kauza A", status: "open", phase: "trial", amount: 100, sources_count: 1 },
  ],
};
const STATS = { cases: 2, persons: 3, orgs: 1, sources: 7, amount: 1000, amount_closed: 0, recovered: 0, cases_with_amount: 1, non_money: [], top_entities: [] };

// Každý endpoint vracia iný tvar — presne preto stará stránka nesmie dostať
// nové dáta ani naopak.
//
// `vi.hoisted` je tu nutné: `vi.mock` sa vyhodnocuje pred zvyškom modulu,
// takže mock nemôže siahnuť na obyčajnú premennú deklarovanú nižšie.
const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("../packages/web/src/api.js", () => ({
  api,
  ApiError: class ApiError extends Error {
    get isNotFound() {
      return false;
    }
  },
}));

api.mockImplementation(async (path) => {
  if (path === "/stats") return STATS;
  if (path === "/events/upcoming") return { items: [] };
  if (String(path).startsWith("/cases/")) return { items: [] };
  if (path === "/cases") return CASES;
  if (path === "/persons") return { total: 0, items: [] };
  // Neznáma cesta nie je chyba testu — mock je zámerne tolerantný, aby test
  // padal na správaní stránky, nie na tom, že pribudol endpoint.
  return {};
});

const { default: App } = await import("../packages/web/src/App.jsx");

const homeData = { stats: STATS, upcoming: [], latest: [], top: [], forgotten: [], biggest: CASES.items, period: "30d", today: "2026-11-15" };

afterEach(cleanup);
beforeEach(() => api.mockClear());

describe("prechod medzi stránkami kliknutím", () => {
  it("z titulky na zoznam káuz nespadne", async () => {
    const user = userEvent.setup();
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(String(args[0])));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App initialData={homeData} initialPath="/" />
      </MemoryRouter>,
    );

    expect(screen.getByText("O čom sa najviac píše")).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Kauzy" }));

    // Kým dobehne `load`, na obrazovke zostáva stará stránka — nie prázdne
    // okno a nie nová stránka s cudzími dátami.
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Kauzy" })).toBeTruthy());

    spy.mockRestore();
    expect(errors.filter((e) => /Cannot read propert|undefined/i.test(e))).toEqual([]);
  });

  it("späť na titulku tiež nespadne", async () => {
    const user = userEvent.setup();
    const errors = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(String(args[0])));

    render(
      <MemoryRouter initialEntries={["/kauzy"]}>
        <App initialData={{ result: CASES }} initialPath="/kauzy" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: /Dosleduj\.to/ }));
    await waitFor(() => expect(screen.getByText("O čom sa najviac píše")).toBeTruthy());

    spy.mockRestore();
    expect(errors.filter((e) => /Cannot read propert|undefined/i.test(e))).toEqual([]);
  });

  it("stránka sa zobrazí, aj keď je vykreslenie chybné", () => {
    // Poistka pre prípad, ktorý nikto nepredvídal: chyba nesmie skončiť bielym
    // oknom, ale vetou, ktorá povie, čo sa stalo.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/kauzy"]}>
        {/* dáta nesprávneho tvaru — presne to, čo predtým padalo */}
        <App initialData={{ nic: true }} initialPath="/kauzy" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Stránku sa nepodarilo zobraziť")).toBeTruthy();
    spy.mockRestore();
  });
});

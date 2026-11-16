// @vitest-environment jsdom
//
// Prepnutie záložky, obdobia či filtra nesmie znova sťahovať to, čo stránka už
// má (spätná väzba vlastníka zo 16. 11. 2026: „v každom volaní sa vždy natiahne
// API call nadradenej stránky"). Každá adresa má vlastný `load`, ktorý beží
// celý — šetrí medzipamäť v api.js, preto sa tu počítajú skutočné `fetch`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import { api, clearApiCache, seedApiCache } from "../packages/web/src/api.js";
import { load as loadHome } from "../packages/web/src/pages/Home.jsx";
import { loadCaseTab } from "../packages/web/src/pages/Case.jsx";
import { GetForm } from "../packages/web/src/components/GetForm.jsx";

/** @type {string[]} */
let fetched;
let fail = false;

beforeEach(() => {
  clearApiCache();
  fetched = [];
  fail = false;
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    fetched.push(String(url));
    await new Promise((r) => setTimeout(r, 5));
    if (fail) return new Response(JSON.stringify({ error: { message: "x" } }), { status: 500 });
    return new Response(JSON.stringify({ items: [], url: String(url) }), { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("medzipamäť api.js", () => {
  it("rovnaké volanie ide na sieť raz, iné parametre znova", async () => {
    await api("/cases/x");
    await api("/cases/x");
    await api("/cases/x/graph", { depth: 2 });
    expect(fetched).toEqual(["/api/cases/x", "/api/cases/x/graph?depth=2"]);
  });

  it("súbežné rovnaké volania sa zlúčia", async () => {
    await Promise.all([api("/stats"), api("/stats"), api("/stats")]);
    expect(fetched).toEqual(["/api/stats"]);
  });

  it("chyba sa nepamätá", async () => {
    fail = true;
    await expect(api("/stats")).rejects.toThrow();
    fail = false;
    await api("/stats");
    expect(fetched).toEqual(["/api/stats", "/api/stats"]);
  });

  it("odpovede zo servera (__API__) sa nesťahujú znova", async () => {
    seedApiCache({ "/api/cases/x": { id: "case:x" } });
    expect(await api("/cases/x")).toEqual({ id: "case:x" });
    expect(fetched).toEqual([]);
  });

  it("úprava odpovede volajúcim nezmení pamäť", async () => {
    const a = await api("/stats");
    a.items.push("zmena");
    expect((await api("/stats")).items).toEqual([]);
  });

  it("zrušená navigácia nezruší odpoveď pre ostatných", async () => {
    const controller = new AbortController();
    const first = api("/stats", {}, { signal: controller.signal });
    const second = api("/stats");
    controller.abort();
    await expect(first).rejects.toBeTruthy();
    expect(await second).toMatchObject({ items: [] });
    expect(fetched).toEqual(["/api/stats"]);
  });
});

describe("záložky a obdobia sťahujú len to, čo pribudlo", () => {
  it("kauza: Prehľad → Prepojenia → Zdroje stiahne detail raz", async () => {
    const params = { slug: "kauza-x" };
    await loadCaseTab("prehlad")({ params });
    await loadCaseTab("prepojenia")({ params });
    await loadCaseTab("zdroje")({ params });
    await loadCaseTab("prehlad")({ params });
    expect(fetched.filter((u) => u === "/api/cases/kauza-x")).toHaveLength(1);
    expect(fetched).toHaveLength(3);
  });

  it("titulka: zmena obdobia stiahne len rebríček", async () => {
    await loadHome({ query: {} }).catch(() => {});
    const before = fetched.length;
    await loadHome({ query: { obdobie: "12-mesiacov" } }).catch(() => {});
    expect(fetched.slice(before)).toEqual(["/api/cases/top?period=12m&limit=5"]);
  });
});

describe("GetForm", () => {
  function Where() {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{pathname + search}</output>;
  }

  it("odoslanie je navigácia v routeri, prázdne polia sa do adresy nepíšu", async () => {
    render(
      <MemoryRouter initialEntries={["/kauzy"]}>
        <Routes>
          <Route path="*" element={(
            <>
              <GetForm action="/kauzy" aria-label="filtre">
                <input name="q" defaultValue="" />
                <select name="status" defaultValue="open"><option value="open">o</option></select>
                <button type="submit">Filtrovať</button>
              </GetForm>
              <Where />
            </>
          )} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filtrovať" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/kauzy?status=open"));
  });

  it("bez JS je to obyčajný GET formulár", () => {
    render(
      <MemoryRouter>
        <GetForm action="/kauzy" aria-label="filtre"><input name="q" /></GetForm>
      </MemoryRouter>,
    );
    const form = screen.getByRole("form", { name: "filtre" });
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/kauzy");
  });
});

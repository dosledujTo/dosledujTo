// @vitest-environment jsdom
//
// Prepínač témy. Čo tu drží testy, nie je farba, ale tri pravidlá:
// voľba prežije reload, kým si moderátor nevybral, riadi sa systémom, a
// prepnutie funguje aj v okne bez `localStorage` (súkromné okno).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { STORAGE_KEY, ThemeProvider, ThemeToggle } from "../packages/admin/src/theme.jsx";

/**
 * jsdom v tomto behu nedáva ani úložisko, ani `matchMedia` — komponent oboje
 * potrebuje, tak sa doplnia. Mock je zámerne hlúpy: testuje sa prepínač, nie
 * prehliadač.
 */
function mockStorage() {
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  return storage;
}

/** jsdom `matchMedia` nemá — téma sa bez neho nedá zistiť ani sledovať. */
function mockSystem(dark) {
  const listeners = new Set();
  window.matchMedia = vi.fn(() => ({
    matches: dark,
    addEventListener: (_event, handler) => listeners.add(handler),
    removeEventListener: (_event, handler) => listeners.delete(handler),
  }));
  return { emit: (matches) => listeners.forEach((handler) => handler({ matches })) };
}

const theme = () => document.documentElement.getAttribute("data-bs-theme");

let storage;

beforeEach(() => {
  storage = mockStorage();
  document.documentElement.setAttribute("data-bs-theme", "light");
  mockSystem(false);
});
afterEach(cleanup);

describe("prepínač témy", () => {
  it("prepne tému a voľbu si zapamätá", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

    await user.click(screen.getByRole("button", { name: "Prepnúť na tmavý režim" }));

    expect(theme()).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");

    // Druhý klik vracia späť — a zápis sa prepíše, nie pribudne.
    await user.click(screen.getByRole("button", { name: "Prepnúť na svetlý režim" }));
    expect(theme()).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("kým si moderátor nevybral, riadi sa systémom aj za behu", () => {
    const system = mockSystem(false);
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

    system.emit(true);
    expect(theme()).toBe("dark");
  });

  it("vlastná voľba prebíja systém", async () => {
    const user = userEvent.setup();
    const system = mockSystem(false);
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

    await user.click(screen.getByRole("button", { name: "Prepnúť na tmavý režim" }));
    system.emit(false); // systém prešiel na svetlý, voľba platí ďalej
    expect(theme()).toBe("dark");

    // Návrat k systému voľbu zabudne, neprepne natvrdo na svetlý.
    await user.click(screen.getByRole("button", { name: "Riadiť sa nastavením systému" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(theme()).toBe("light");
  });

  it("v okne bez úložiska prepnutie stále funguje", async () => {
    const user = userEvent.setup();
    storage.setItem = () => {
      throw new Error("prístup k úložisku zamietnutý");
    };

    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Prepnúť na tmavý režim" }));

    expect(theme()).toBe("dark");
  });
});

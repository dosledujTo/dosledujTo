// Server pri vykreslení zaznamená svoje API volania (ssr.js → `__API__`), aby
// prehliadač prvú navigáciu nezačínal od nuly. Sám si ich ale nepamätá: každá
// požiadavka na server číta čerstvé dáta.

import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../packages/web/src/api.js";

let fetched;
beforeEach(() => {
  fetched = [];
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    fetched.push(String(url));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("api.js na serveri", () => {
  it("zaznamená volania počas vykreslenia, mimo neho nič", async () => {
    const store = (globalThis.__dosledujApiCalls ??= new AsyncLocalStorage());
    const calls = new Map();
    await store.run(calls, () => api("/cases/x", { depth: 2 }));
    await api("/stats");
    expect([...calls.keys()]).toEqual(["/api/cases/x?depth=2"]);
    expect(calls.get("/api/cases/x?depth=2")).toEqual({ ok: true });
  });

  it("nekešuje — rovnaké volanie ide na API zakaždým", async () => {
    await api("/stats");
    await api("/stats");
    expect(fetched).toHaveLength(2);
  });
});

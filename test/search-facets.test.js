// Faseta, ktorú ešte nemá žiadny dokument, nesmie zhodiť stránku. Na produkcii
// sa to stalo 16. 11. 2026: žiadna kauza ešte nemala druh, `kind_main` v indexe
// neexistoval a Clouseau na `counts: ["kind_main"]` odpovedal chybou — titulka
// aj /kauzy padli na 500. Testovacie dáta majú všetky fasety, preto mock.

import { describe, expect, it, vi } from "vitest";

const calls = [];
vi.mock("../packages/shared/src/couch.js", () => ({
  search: vi.fn(async (_ddoc, _index, params) => {
    calls.push(params.counts ? [...params.counts] : null);
    const absent = ["kind_main", "tag"].find((d) => params.counts?.includes(d));
    if (absent) throw new Error(`search search_v2/entities: dim "${absent}" does not exist`);
    return { rows: [{ id: "case:1", fields: { title: "T" } }], total_rows: 1, counts: params.counts ? { status: { open: 1 } } : undefined };
  }),
}));

const { query } = await import("../packages/shared/src/search.js");

describe("chýbajúca faseta", () => {
  it("dotaz sa zopakuje bez nej a vráti ju prázdnu", async () => {
    calls.length = 0;
    const res = await query({ index: "entities", q: "type:case", counts: ["status", "tag", "kind_main"] });
    expect(res.items).toEqual([{ id: "case:1", title: "T" }]);
    expect(res.counts).toEqual({ status: { open: 1 }, tag: {}, kind_main: {} });
    expect(calls.at(-1)).toEqual(["status"]);
  });

  it("keď nezostane žiadna faseta, dotaz ide bez counts", async () => {
    calls.length = 0;
    const res = await query({ index: "entities", q: "type:case", counts: ["kind_main"] });
    expect(calls.at(-1)).toBeNull();
    expect(res.counts).toEqual({ kind_main: {} });
  });

  it("iná chyba vyhľadávania sa neprehltne", async () => {
    const couch = await import("../packages/shared/src/couch.js");
    couch.search.mockRejectedValueOnce(new Error("search search_v2/entities: timeout"));
    await expect(query({ index: "entities", q: "x", counts: ["status"] })).rejects.toThrow("timeout");
  });
});

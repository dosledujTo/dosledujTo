// The audit trail is only as good as the diff in it, and `revert` replays that
// diff from the beginning of a document's life.

import { describe, it, expect } from "vitest";
import { diff, apply } from "../packages/shared/src/jsonpatch.js";

describe("diff", () => {
  it("zachytí pridanie, zmenu aj odobratie poľa", () => {
    const ops = diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    expect(ops).toEqual([
      { op: "replace", path: "/b", value: 3 },
      { op: "add", path: "/c", value: 4 },
    ]);
  });

  it("ide do hĺbky sourced hodnoty", () => {
    const before = { amount: { value: 100, sources: ["article:a"] } };
    const after = { amount: { value: 200, sources: ["article:a"] } };
    expect(diff(before, after)).toEqual([{ op: "replace", path: "/amount/value", value: 200 }]);
  });

  it("polia porovnáva ako celok — preusporiadanie zdrojov nie je informácia", () => {
    const ops = diff({ sources: ["a", "b"] }, { sources: ["b", "a", "c"] });
    expect(ops).toEqual([{ op: "replace", path: "/sources", value: ["b", "a", "c"] }]);
  });

  it("na zhodných dokumentoch nevyrobí žiadnu operáciu", () => {
    const doc = { a: { b: [1, 2], c: null } };
    expect(diff(doc, structuredClone(doc))).toEqual([]);
  });
});

describe("apply", () => {
  it("prehratím diffov vznikne pôvodný dokument", () => {
    const before = { title: "A", amount: { value: 1, sources: [] }, tags: ["x"] };
    const after = { title: "B", amount: { value: 2, sources: ["article:a"] } };

    expect(apply(before, diff(before, after))).toEqual(after);
  });

  it("reťaz revízií od vzniku dokumentu vie zrekonštruovať ľubovoľný stav", () => {
    const v1 = { title: "Kauza", publish_state: "draft" };
    const v2 = { ...v1, publish_state: "published" };
    const v3 = { ...v2, title: "Kauza II" };

    const chain = [diff({}, v1), diff(v1, v2), diff(v2, v3)];

    let state = {};
    for (const ops of chain.slice(0, 2)) state = apply(state, ops);
    expect(state).toEqual(v2); // the state before the last change

    state = apply(state, chain[2]);
    expect(state).toEqual(v3);
  });

  it("nemení vstupný dokument", () => {
    const original = { a: 1 };
    apply(original, [{ op: "replace", path: "/a", value: 2 }]);
    expect(original).toEqual({ a: 1 });
  });
});

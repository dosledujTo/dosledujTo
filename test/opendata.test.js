// Katalóg otvorených dát. Rovnaký problém ako pri Lucene: reťazec od
// používateľa sa skladá do dotazu, tentoraz SPARQL.

import { describe, it, expect } from "vitest";
import { escapeLiteral, assertIri } from "../packages/worker/src/lib/opendata.js";

describe("escapeLiteral", () => {
  it("nepustí úvodzovku, ktorou by sa dalo vyskočiť z literálu", () => {
    const attack = '") } INSERT DATA { <x> <y> "z';
    const escaped = escapeLiteral(attack);

    expect(escaped).not.toMatch(/(?<!\\)"/);
    expect(escaped).toContain('\\"');
  });

  it("escapuje spätnú lomku skôr než úvodzovku", () => {
    // Poradie je podstatné: keby sa escapovala najprv úvodzovka, spätná lomka
    // by jej escape vzápätí zneplatnila.
    expect(escapeLiteral('a\\"b')).toBe('a\\\\\\"b');
  });

  it("escapuje riadkové zlomy", () => {
    expect(escapeLiteral("a\nb\r\tc")).toBe("a\\nb\\r\\tc");
  });

  it("bežný slovenský dopyt nechá čitateľný", () => {
    expect(escapeLiteral("súdne pojednávania")).toBe("súdne pojednávania");
  });
});

describe("assertIri", () => {
  it("prijme URI datasetu z katalógu", () => {
    const uri = "https://data.gov.sk/set/ecf4e9fe-db11-451d-b615-c6da24257502";
    expect(assertIri(uri)).toBe(uri);
  });

  it("odmietne všetko, čím by sa dala zavrieť zátvorka IRI", () => {
    expect(() => assertIri("https://x.sk/a> <b> <c")).toThrow(/neplatné IRI/);
    expect(() => assertIri("https://x.sk/a b")).toThrow(/neplatné IRI/);
    expect(() => assertIri("javascript:alert(1)")).toThrow(/neplatné IRI/);
    expect(() => assertIri("")).toThrow(/neplatné IRI/);
  });
});

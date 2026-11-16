// Escaping user input into a Lucene query is on the mandatory coverage list
// (backend-zadanie.md §9). The client never sends a query — but it does send
// text that ends up inside one.

import { describe, it, expect } from "vitest";
import { escape, term, range, freeText, and, or, sortBy } from "../packages/shared/src/lucene.js";

describe("escape", () => {
  it("escapuje všetky znaky, ktoré Lucene považuje za syntax", () => {
    for (const char of "+-&|!(){}[]^\"~*?:\\/") {
      expect(escape(char)).toBe(`\\${char}`);
    }
  });

  it("nepustí von úvodzovku, ktorou by sa dalo vyskočiť z termu", () => {
    const attack = 'x" OR publish_state:"draft';
    const query = term("title", attack);

    // The colon is syntax too, so it is escaped alongside the quotes.
    expect(query).toBe('title:"x\\" OR publish_state\\:\\"draft"');
    // Exactly two unescaped quotes: the ones we put there.
    expect(query.replace(/\\./g, "")).toBe('title:"x OR publish_statedraft"');
  });

  it("neprepustí zástupné znaky ani operátory z voľného textu", () => {
    const query = freeText('* OR type:user AND "x', ["text"]);
    expect(query).not.toMatch(/ OR type:user/);
    expect(query).toContain("\\*");
  });
});

describe("skladanie query", () => {
  it("voľný text spája tokeny cez AND a polia cez OR", () => {
    expect(freeText("jan testovaci", ["text", "title_fold"])).toBe(
      "(text:jan* OR title_fold:jan*) AND (text:testovaci* OR title_fold:testovaci*)",
    );
  });

  it("odstraňuje diakritiku rovnako ako indexovacia funkcia", () => {
    expect(freeText("Ján Testovací", ["text"])).toBe(freeText("jan testovaci", ["text"]));
  });

  it("vráti null, keď v dopyte nezostane použiteľný token", () => {
    expect(freeText("   ", ["text"])).toBeNull();
    expect(freeText("***", ["text"])).not.toBeNull(); // escaped, but still a token
  });

  it("čísla nedáva do úvodzoviek, reťazce áno", () => {
    expect(term("amount", 1000)).toBe("amount:1000");
    expect(term("type", "case")).toBe('type:"case"');
  });

  it("otvorený rozsah používa hviezdičku", () => {
    expect(range("amount", 100, null)).toBe("amount:[100 TO *]");
    expect(range("amount", null, 200)).toBe("amount:[* TO 200]");
  });

  it("prázdne klauzuly nespôsobia zlomenú query", () => {
    expect(and(null, undefined, false)).toBe("*:*");
    expect(and('type:"case"', null)).toBe('type:"case"');
    expect(or([])).toBeNull();
  });

  it("triedenie vracia pole s typom, nie reťazec", () => {
    // nano POSTs the search parameters as JSON; a pre-stringified sort would
    // arrive as a string and CouchDB would reject it.
    expect(sortBy("amount", "desc")).toEqual(["-amount<number>"]);
    expect(sortBy("started_on", "asc")).toEqual(["started_on<number>"]);
  });
});

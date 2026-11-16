// Konfigurácia sa validuje pri štarte a pri chybe sa padá. Testy sú tu preto,
// že Docker Compose predáva nenastavené premenné ako prázdny reťazec — a to je
// presne ten prípad, v ktorom by sa tichý default stal bezpečnostnou dierou.

import { describe, expect, it } from "vitest";
import { loadConfig } from "../packages/shared/src/config.js";

const base = {
  COUCH_URL: "http://127.0.0.1:5984",
  COUCH_DB: "dosledujto_register",
  TURNSTILE_SECRET: "secret",
  IP_HASH_SALT: "dostatocne-dlha-sol",
};

describe("prázdna premenná je nenastavená premenná", () => {
  it("COOKIE_SECURE= v produkcii neznamená false", () => {
    const config = loadConfig({ ...base, NODE_ENV: "production", COOKIE_SECURE: "" });
    // Prázdna hodnota nesmie prebiť odvodenie z NODE_ENV: session cookie
    // v produkcii musí mať Secure.
    expect(config.COOKIE_SECURE).toBe(true);
  });

  it("COOKIE_SECURE=false sa naďalej rešpektuje, keď je zadané naozaj", () => {
    expect(loadConfig({ ...base, NODE_ENV: "production", COOKIE_SECURE: "false" }).COOKIE_SECURE)
      .toBe(false);
    expect(loadConfig({ ...base, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ ...base, COOKIE_SECURE: "1" }).COOKIE_SECURE).toBe(true);
  });

  it("prázdny IP_HASH_SALT v produkcii zhodí štart", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", IP_HASH_SALT: "" }))
      .toThrow(/IP_HASH_SALT/);
  });

  it("prázdny TURNSTILE_SECRET v produkcii zhodí štart", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", TURNSTILE_SECRET: "" }))
      .toThrow(/TURNSTILE_SECRET/);
  });

  it("prázdny COUCH_URL spadne na default, nie na neplatnú adresu", () => {
    expect(loadConfig({ ...base, COUCH_URL: "" }).COUCH_URL).toBe("http://127.0.0.1:5984");
  });
});

describe("fail fast", () => {
  it("neplatná hodnota vymenuje, čo je zle", () => {
    expect(() => loadConfig({ ...base, PORT: "nie je číslo" })).toThrow(/PORT/);
  });

  it("vo vývoji stačí prázdne prostredie", () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.COUCH_DB).toBe("dosledujto_register");
  });

  it("krátka soľ na hashovanie IP je chyba, nie varovanie", () => {
    expect(() => loadConfig({ ...base, IP_HASH_SALT: "krátka" })).toThrow(/IP_HASH_SALT/);
  });
});

describe("preklep v mene premennej", () => {
  it("upozorní, keď sa kľúč líši len veľkosťou písmen", () => {
    const warnings = [];
    const config = loadConfig({ ...base, COUCH_URl: "http://cdb_couchdb:5984" }, warnings);

    // Hodnota sa nepoužije — a práve preto o tom musí byť veta v logu.
    expect(config.COUCH_URL).toBe("http://127.0.0.1:5984");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/COUCH_URl.*COUCH_URL/);
  });

  it("na cudzie premenné v prostredí nereaguje", () => {
    const warnings = [];
    loadConfig({ ...base, PATH: "/usr/bin", HOSTNAME: "x", COMPOSE_PROFILES: "app" }, warnings);
    expect(warnings).toEqual([]);
  });
});

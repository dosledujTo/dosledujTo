// Example couchman configuration.
//
// Copy this to `couchman.config.js` at your project root (next to the `couch/`
// directory) and edit. The file is plain ESM — no build step.
//
// Credentials never live in this file: they come from COUCHMAN_USER /
// COUCHMAN_PASSWORD, or from the URL. Keep secrets in .env (git-ignored).

import { defineConfig } from "couchman";

// Prihlasovacie údaje sa berú z `.env` projektu — tej istej, ktorú používa API
// (COUCH_URL, COUCH_USER, COUCH_PASSWORD). V tomto súbore heslo nie je a byť
// nesmie: súbor je v gite. COUCHMAN_USER / COUCHMAN_PASSWORD, ak sú nastavené,
// majú stále prednosť.
try {
  process.loadEnvFile();
} catch {
  // Bez `.env` (napr. v CI) platia premenné prostredia, ako sú.
}
process.env.COUCHMAN_USER ??= process.env.COUCH_USER;
process.env.COUCHMAN_PASSWORD ??= process.env.COUCH_PASSWORD;

export default defineConfig({
  // Named environments. Pick one with `--env=<name>`; if there is exactly one,
  // it is used by default. `url` may come from an env var (undefined is fine
  // for environments you are not currently targeting).
  environments: {
    local: {
      url: process.env.COUCH_URL ?? "http://127.0.0.1:5984",
    }
  },

  // Databases couchman is allowed to manage. Design documents in databases not
  // listed here are left untouched.
  //
  // Databases are prefixed with the project (`dosledujto_`), because this
  // CouchDB instance is shared with other projects. The name from
  // backend-zadanie.md §2 is `register`, hence `dosledujto_register`; a dot is
  // not a legal character in a CouchDB database name, so `dosleduj.to` could
  // never have been one.
  databases: ["dosledujto_register"],

  // Transpile target for query-server functions. Default "es5" is safest for
  // older SpiderMonkey builds; raise it only if you know your build supports
  // more, and own the consequences.
  target: "es5",

  // Wrapper form for bundled functions: "iife" (default, a self-contained
  // expression) or "inline" (a plain function literal) for query-server builds
  // that reject the IIFE-returns-function shape.
  wrap: "iife",
});

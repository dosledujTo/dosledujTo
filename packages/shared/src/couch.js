// The only place that talks to CouchDB. Everything above it goes through
// `store.js` (writes) or `queries.js` / `search.js` (reads).

import nano from "nano";
import { config, sanitizeUrl } from "./config.js";
import { AppError, conflict, notFound } from "./errors.js";

function url() {
  const u = new URL(config.COUCH_URL);
  if (config.COUCH_USER) {
    u.username = encodeURIComponent(config.COUCH_USER);
    u.password = encodeURIComponent(config.COUCH_PASSWORD ?? "");
  }
  return u.toString();
}

const server = nano(url());
export const db = server.use(config.COUCH_DB);

/**
 * Translate a CouchDB failure into the API's error vocabulary. A `forbidden`
 * from validate_doc_update is a validation failure, not a 500 — it is the
 * database telling us the document breaks a product rule.
 *
 * @param {any} err
 * @param {string} context
 */
export function translate(err, context) {
  const status = err?.statusCode;
  const reason = err?.reason || err?.description || err?.message || String(err);

  if (status === 404) return notFound(context);
  if (status === 409) {
    return conflict("dokument bol medzičasom zmenený", { context, reason });
  }
  if (status === 403 || err?.error === "forbidden") {
    return new AppError("VALIDATION_FAILED", reason, { context });
  }
  return new AppError("INTERNAL", `${context}: ${reason}`);
}

/**
 * @param {string} id
 * @returns {Promise<any|null>} null when the document does not exist.
 */
export async function get(id) {
  try {
    return await db.get(id);
  } catch (err) {
    if (err?.statusCode === 404) return null;
    throw translate(err, `čítanie ${id}`);
  }
}

/**
 * @param {string[]} ids
 * @returns {Promise<any[]>} Existing documents, in the requested order.
 */
export async function getMany(ids) {
  if (ids.length === 0) return [];
  try {
    const res = await db.fetch({ keys: [...new Set(ids)] });
    const byId = new Map();
    for (const row of res.rows) if (row.doc) byId.set(row.id, row.doc);
    return ids.map((id) => byId.get(id)).filter(Boolean);
  } catch (err) {
    throw translate(err, "hromadné čítanie dokumentov");
  }
}

/**
 * @param {any} doc
 */
export async function put(doc) {
  try {
    return await db.insert(doc);
  } catch (err) {
    throw translate(err, `zápis ${doc._id}`);
  }
}

/**
 * Zmazanie dokumentu. Volá sa len zo `store.deleteDoc`, ktorý pred ním zapíše
 * revíziu — inak by po dokumente ostal náhrobok bez stopy, čo tam bolo.
 *
 * @param {string} id
 * @param {string} rev
 */
export async function destroy(id, rev) {
  try {
    return await db.destroy(id, rev);
  } catch (err) {
    throw translate(err, `mazanie ${id}`);
  }
}

/**
 * @param {string} ddoc
 * @param {string} view
 * @param {Record<string, any>} [params]
 */
export async function view(ddoc, view, params = {}) {
  try {
    return await db.view(ddoc, view, params);
  } catch (err) {
    throw translate(err, `view ${ddoc}/${view}`);
  }
}

// ── Aliasy design dokumentov ──────────────────────────────────────────────────
//
// Zmena indexovacej funkcie znamená prestavbu celého Lucene indexu. Preto sa
// `search` nasadzuje pod verziovaným menom (`search_v2`, …) a prepína sa
// aliasom `couchman:aliases` až keď je nový index postavený (couchman.md
// „Versioned deployment"). Aplikácia preto nikdy nepíše verziu do kódu: pýta
// sa logickým menom a skutočné meno si prečíta z databázy.
//
// Alias sa číta raz za `ALIAS_TTL_MS`, nie pri každom dotaze. Bez aliasového
// dokumentu platí logické meno (inštalácia, ktorá verziovanie nepoužíva).

const ALIAS_ID = "couchman:aliases";
const ALIAS_TTL_MS = 30_000;
/** @type {{ at: number, map: Record<string, string> } | null} */
let aliasCache = null;

async function aliases() {
  if (aliasCache && Date.now() - aliasCache.at < ALIAS_TTL_MS) return aliasCache.map;
  const doc = await get(ALIAS_ID);
  /** @type {Record<string, string>} */
  const map = {};
  for (const [key, value] of Object.entries(doc ?? {})) {
    if (!key.startsWith("_") && typeof value === "string") map[key] = value;
  }
  aliasCache = { at: Date.now(), map };
  return map;
}

/**
 * Skutočné meno design dokumentu pre logické meno (`search` → `search_v2`).
 *
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function resolveDdoc(name) {
  return (await aliases())[name] ?? name;
}

/** Zabudni načítaný alias — po `couchman promote` v testoch. */
export function forgetAliases() {
  aliasCache = null;
}

/**
 * A Clouseau `_search` query. `nano.search` speaks the same parameters.
 * `ddoc` je logické meno; verzia sa dopĺňa z aliasu.
 *
 * @param {string} ddoc
 * @param {string} index
 * @param {Record<string, any>} params
 */
export async function search(ddoc, index, params) {
  const name = await resolveDdoc(ddoc);
  try {
    return await db.search(name, index, params);
  } catch (err) {
    throw translate(err, `search ${name}/${index}`);
  }
}

/**
 * All documents of a type, by `_all_docs` range. This is what the `<type>:<uuid7>`
 * id convention buys: a type is a key range, with no index to maintain.
 *
 * Only for types that stay small — `feed`, `user`. Cases and articles are read
 * through the search index.
 *
 * @param {string} type
 * @param {{ limit?: number }} [opts]
 */
export async function listByType(type, opts = {}) {
  try {
    const res = await db.list({
      startkey: `${type}:`,
      endkey: `${type}:￰`,
      include_docs: true,
      limit: opts.limit ?? 500,
    });
    return res.rows.map((row) => row.doc).filter(Boolean);
  } catch (err) {
    throw translate(err, `zoznam dokumentov typu ${type}`);
  }
}

/**
 * Startup check. Clouseau is a separate JVM process; without it `_search`
 * fails, and an API that quietly returned empty result sets would be worse than
 * one that refuses to start (backend-zadanie.md §1).
 */
export async function checkConnection() {
  const info = await server.info().catch((err) => {
    throw new Error(`CouchDB nedostupná na ${sanitizeUrl(config.COUCH_URL)}: ${err.message}`);
  });

  const exists = await server.db.get(config.COUCH_DB).catch(() => null);
  if (!exists) throw new Error(`databáza "${config.COUCH_DB}" neexistuje`);

  await server.request({
    db: "_search_analyze",
    method: "post",
    body: { analyzer: "standard", text: "test" },
  }).catch((err) => {
    throw new Error(
      `Clouseau nie je dostupný (_search by zlyhal): ${err.message}. ` +
        "API sa nespustí — prázdne výsledky vyhľadávania sú horšie ako pád.",
    );
  });

  const ddocs = await db.list({ startkey: "_design/", endkey: "_design0" });
  const names = ddocs.rows.map((r) => r.id.replace("_design/", ""));
  for (const required of ["by_case", "by_person", "by_target", "slugs", "rules"]) {
    if (!names.includes(required)) {
      throw new Error(
        `chýba _design/${required} — spusti \`npm run couch:push\` pred štartom API`,
      );
    }
  }
  // Vyhľadávanie je verziované: musí existovať to, na čo ukazuje alias.
  forgetAliases();
  const search = await resolveDdoc("search");
  if (!names.includes(search)) {
    const versions = names.filter((n) => /^search_v\d+$/.test(n));
    throw new Error(
      `chýba _design/${search}` +
        (versions.length
          ? ` — nasadené sú ${versions.join(", ")}; prepni alias: \`npx couchman promote ${versions.at(-1)} search --env=…\``
          : " — spusti `npm run couch:push` pred štartom API"),
    );
  }

  return { couchdb: info.version, db: config.COUCH_DB, designDocs: names.length };
}

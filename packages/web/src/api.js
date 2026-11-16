// Prístup k dátam — cez REST API, na serveri aj v prehliadači.
//
// Server by si mohol dáta zobrať priamo z databázy a ušetriť jeden skok po
// localhoste. Nerobí to zámerne: **API je jediná zmluva**. Keby server čítal
// inak než klient, po prvej client-side navigácii by sa stránka mohla zmeniť
// bez toho, aby sa zmenili dáta — a taká chyba sa hľadá veľmi ťažko.

/**
 * Základ adresy. V prehliadači relatívna cesta, na serveri vlastný port.
 * @type {string}
 */
const BASE =
  typeof window === "undefined"
    ? `http://127.0.0.1:${process.env.PORT ?? 3000}`
    : "";

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = body?.code ?? "UNKNOWN";
  }
  get isNotFound() {
    return this.status === 404;
  }
}

// ── Medzipamäť v prehliadači ─────────────────────────────────────────────────
//
// Každá záložka a filter má vlastnú adresu a vlastný `load`, ktorý pri
// navigácii beží celý znova. Bez medzipamäte by prepnutie záložky kauzy znova
// stiahlo detail kauzy a prepnutie obdobia na titulke všetkých šesť blokov,
// hoci sa zmenil jeden. Odpoveď sa preto v prehliadači drží krátko (TTL) a
// rovnaké súbežné volania sa zlúčia do jedného.
//
// Server pri vykreslení zaznamená, ktoré volania urobil (`recordApiCalls`
// v ssr.js), a pošle ich so stránkou — hneď prvá navigácia po načítaní tak
// stiahne len to, čo pribudlo.
//
// Na serveri sa nekešuje nič: každá požiadavka číta čerstvo.

const TTL_MS = 2 * 60_000;
const MAX_ENTRIES = 150;
/** @type {Map<string, { at: number, promise: Promise<any> }>} */
const cache = new Map();

/** Odpovede zo serverového vykreslenia. @param {Record<string, any>|undefined} entries */
export function seedApiCache(entries) {
  const at = Date.now();
  for (const [key, data] of Object.entries(entries ?? {})) cache.set(key, { at, promise: Promise.resolve(data) });
}

/** Pre testy a po zápise (napr. odoslaný podnet). */
export function clearApiCache() {
  cache.clear();
}

/** @param {Promise<any>} promise @param {AbortSignal|undefined} signal */
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

/** @param {string} target */
async function fetchJson(target, signal) {
  const res = await fetch(target, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? {});
  return data;
}

/**
 * @param {string} path      napr. "/cases"
 * @param {Record<string, any>} [params]
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function api(path, params = {}, opts = {}) {
  const url = new URL(`/api${path}`, BASE || "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const key = `${url.pathname}${url.search}`;

  if (BASE) {
    const data = await fetchJson(url.toString(), opts.signal);
    // Záznam pre prehliadač (ssr.js) — len počas vykresľovania stránky.
    globalThis.__dosledujApiCalls?.getStore()?.set(key, data);
    return data;
  }

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    // Kópia: `load` smie s odpoveďou narábať bez toho, aby zmenil pamäť.
    return structuredClone(await abortable(hit.promise, opts.signal));
  }

  // Sieťové volanie nezávisí od signálu jedného volajúceho — rovnakú odpoveď
  // môže čakať aj iný `load`. Zrušenie navigácie zruší len čakanie.
  const promise = fetchJson(key);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);

  return structuredClone(await abortable(promise, opts.signal));
}

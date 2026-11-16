// Slušné sťahovanie. Nie je to obal na `fetch` pre pohodlie — sú to pravidlá,
// ktoré musí crawler dodržať, aby ho médiá nezablokovali a aby sme sa vedeli
// prihlásiť k tomu, čo robíme (backend-zadanie.md §8.1):
//
//   - vlastný User-Agent s kontaktom,
//   - najviac jedna požiadavka za sekundu na doménu,
//   - `Retry-After` sa rešpektuje,
//   - podmienený GET cez `If-None-Match` / `If-Modified-Since`.
//
// SME vracia na predvolený User-Agent stránku „Request Blocked" so stavom 200.
// Preto sa kontroluje aj `content-type`: odpoveď, ktorá nie je XML, je chyba
// feedu, nie prázdny feed.
//
// A ešte jedna vec, ktorú sme sa naučili až v prevádzke: **429 a 403 nie sú
// chyba feedu, ale odpoveď média.** SME má na `/rss` tvrdý limit — druhá
// požiadavka na ten istý zdroj aj po niekoľkých sekundách dostane 429, hoci
// `robots.txt` z tej istej domény odpovie 200. Opakovať to o pár sekúnd neskôr
// je presne to správanie, kvôli ktorému sa z limitu stane blokovanie. Preto:
// hostiteľ, ktorý povedal „nie", dostane pokoj (`blockedUntil`) a chyba nesie
// príznak `blocked`, aby ju volajúci vedel odlíšiť od rozbitého feedu.

import { config } from "../../../shared/src/config.js";
import { logger } from "../../../shared/src/logger.js";
import { hostOf } from "./url.js";

/** Kedy naposledy odišla požiadavka na danú doménu. */
const lastRequestAt = new Map();

/** Dokedy má daná doména pokoj, keď nás odmietla. */
const blockedUntil = new Map();

/** Predvolený odstup, keď server nepovie `Retry-After`. */
export const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
export const MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Odmietnutie zo strany média: 429 (spomaľ) alebo 403 (nie).
 *
 * Nie je to chyba feedu — feed je v poriadku, len ho teraz nedostaneme. Preto
 * vlastný typ: volajúci sa podľa neho rozhodne inak než pri rozbitom XML.
 */
export class BlockedError extends Error {
  /**
   * @param {string} url
   * @param {number} status
   * @param {number} retryAfterMs
   */
  constructor(url, status, retryAfterMs) {
    super(`${url} vrátila ${status} — médium nás teraz nepustí`);
    this.name = "BlockedError";
    this.blocked = true;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** `Retry-After` v sekundách alebo ako dátum; vráti milisekundy alebo null. */
function retryAfterMs(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
  const at = Date.parse(header);
  if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_COOLDOWN_MS);
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Počká, kým uplynie minimálny odstup od poslednej požiadavky na tú istú doménu.
 * @param {string} host
 * @param {number} minIntervalMs
 */
async function throttle(host, minIntervalMs) {
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

/**
 * @typedef {object} FetchResult
 * @property {number} status
 * @property {boolean} notModified   304 — obsah sa nezmenil, netreba parsovať.
 * @property {string} [body]
 * @property {string} [etag]
 * @property {string} [lastModified]
 * @property {string} [contentType]
 */

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {string|null} [opts.etag]
 * @param {string|null} [opts.lastModified]
 * @param {string[]} [opts.expectTypes]  Podreťazce prijateľného content-type.
 * @param {string} [opts.accept]         Vlastná hlavička Accept (SPARQL, JSON…).
 * @param {number} [opts.retries]
 * @returns {Promise<FetchResult>}
 */
export async function politeFetch(url, opts = {}) {
  const host = hostOf(url);
  if (!host) throw new Error(`neplatná URL: ${url}`);

  // Doména, ktorá nás pred chvíľou odmietla, sa neskúša znova len preto, že
  // prišiel ďalší feed z toho istého behu.
  const cooldown = blockedUntil.get(host) ?? 0;
  if (cooldown > Date.now()) {
    throw new BlockedError(url, 429, cooldown - Date.now());
  }

  const headers = {
    "user-agent": config.CRAWLER_USER_AGENT,
    accept:
      opts.accept ??
      "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
    "accept-language": "sk,cs;q=0.8",
  };
  if (opts.etag) headers["if-none-match"] = opts.etag;
  if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;

  const retries = opts.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    await throttle(host, config.CRAWL_MIN_INTERVAL_MS);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.CRAWL_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`sieťová chyba pri ${url}: ${err.message}`);
    }
    clearTimeout(timer);

    if (res.status === 304) {
      return { status: 304, notModified: true };
    }

    // 429 a 503 sú „skús neskôr", nie „neexistuje". Ak server povedal kedy,
    // počkáme presne toľko; inak sa čaká dlhšie, než trvá jeden dych — pri
    // limite na počet požiadaviek je opakovanie po dvoch sekundách to isté ako
    // žiadne čakanie.
    const said = retryAfterMs(res.headers.get("retry-after"));
    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      const wait = said ?? 5000 * 4 ** attempt;
      if (wait <= 60_000) {
        logger.warn({ url, status: res.status, wait }, "server žiada počkať");
        await sleep(wait);
        continue;
      }
    }

    // Ďalej sa to už neskúša: doména dostane pokoj a volajúci sa dozvie, že to
    // nie je chyba feedu, ale rozhodnutie média.
    if (res.status === 429 || res.status === 403 || res.status === 503) {
      const wait = said ?? DEFAULT_COOLDOWN_MS;
      blockedUntil.set(host, Date.now() + wait);
      logger.warn({ url, status: res.status, cooldown: wait }, "médium nás odmietlo, dávam pokoj");
      throw new BlockedError(url, res.status, wait);
    }

    if (!res.ok) throw new Error(`${url} vrátila ${res.status}`);

    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();

    if (opts.expectTypes && !opts.expectTypes.some((t) => contentType.includes(t))) {
      throw new Error(
        `${url} vrátila content-type "${contentType}", očakávalo sa ` +
          `${opts.expectTypes.join(" alebo ")} — pravdepodobne blokovanie robota`,
      );
    }

    return {
      status: res.status,
      notModified: false,
      body,
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
      contentType,
    };
  }
}

/** Test helper — odstup medzi požiadavkami aj pokoj domény sú stav procesu. */
export function resetThrottle() {
  lastRequestAt.clear();
  blockedUntil.clear();
}

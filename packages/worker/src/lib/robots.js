// robots.txt. Kontroluje sa pred každým feedom a výsledok sa drží 24 hodín
// (backend-zadanie.md §8.1). Pamäť je dvojaká: v procese (jeden beh číta jeden
// robots.txt raz) a **na dokumente feedu**, lebo každé spustenie crawlera je
// nový proces. Bez tej druhej by každý beh poslal na doménu dve požiadavky tesne
// za sebou — a práve to je vzor, na ktorý médiá s limitom reagujú blokovaním. Feed, ktorý robots zakazuje, sa preskočí a zaloguje
// — nie potichu, lebo to je prevádzkové rozhodnutie média, ktoré má vidieť
// človek.
//
// Vlastný parser namiesto knižnice: potrebujeme presne toľko z RFC 9309, koľko
// médiá naozaj používajú (User-agent, Disallow, Allow, Crawl-delay), a chceme
// vedieť, čo sa deje, keď si skupiny protirečia.

import { config } from "../../../shared/src/config.js";
import { logger } from "../../../shared/src/logger.js";
import { politeFetch } from "./http.js";
import { robotsUrlFor } from "./url.js";

const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

/**
 * @typedef {object} RobotsRules
 * @property {Array<{allow: boolean, path: string}>} rules
 * @property {number|null} crawlDelay
 */

/**
 * @param {string} text
 * @param {string} agent  Náš token, malými písmenami.
 * @returns {RobotsRules}
 */
export function parseRobots(text, agent) {
  /** @type {Map<string, {rules: Array<{allow:boolean,path:string}>, crawlDelay: number|null}>} */
  const groups = new Map();
  let current = [];
  let expectingAgents = true;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;

    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === "user-agent") {
      // Za sebou idúce User-agent riadky patria k tej istej skupine pravidiel.
      if (!expectingAgents) current = [];
      expectingAgents = true;
      const name = value.toLowerCase();
      current.push(name);
      if (!groups.has(name)) groups.set(name, { rules: [], crawlDelay: null });
      continue;
    }

    expectingAgents = false;
    for (const name of current) {
      const group = groups.get(name);
      if (!group) continue;
      if (field === "disallow" && value !== "") group.rules.push({ allow: false, path: value });
      else if (field === "allow" && value !== "") group.rules.push({ allow: true, path: value });
      else if (field === "crawl-delay") {
        const delay = Number(value);
        if (Number.isFinite(delay)) group.crawlDelay = delay;
      }
    }
  }

  // Najšpecifickejšia zhoda mena vyhráva; `*` je až posledná možnosť.
  const named = [...groups.keys()]
    .filter((name) => name !== "*" && agent.includes(name))
    .sort((a, b) => b.length - a.length)[0];

  return groups.get(named) ?? groups.get("*") ?? { rules: [], crawlDelay: null };
}

/**
 * Zodpovedá cesta vzoru z robots.txt? Podporuje `*` a `$` podľa RFC 9309.
 * @param {string} path
 * @param {string} pattern
 */
function matches(path, pattern) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const regex = new RegExp(
    "^" + body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") +
      (anchored ? "$" : ""),
  );
  return regex.test(path);
}

/**
 * @param {RobotsRules} robots
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowed(robots, url) {
  const path = new URL(url).pathname + new URL(url).search;

  // Pri konflikte vyhráva dlhší (špecifickejší) vzor; pri rovnakej dĺžke Allow.
  let best = null;
  for (const rule of robots.rules) {
    if (!matches(path, rule.path)) continue;
    if (!best || rule.path.length > best.path.length ||
        (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/** Platí uložený výsledok kontroly ešte? */
export function robotsFresh(checkedAt) {
  const at = Date.parse(checkedAt ?? "");
  return Number.isFinite(at) && at + CACHE_MS > Date.now();
}

/**
 * Načíta a zapamätá si robots.txt pre doménu danej URL.
 *
 * Nedostupný robots.txt sa berie ako povolenie — tak to robia vyhľadávače a je
 * to jediná interpretácia, pri ktorej výpadok jedného súboru nezastaví crawler.
 * Odpoveď 4xx znamená „žiadne pravidlá", nie „zakázané".
 *
 * @param {string} url
 * @param {{ cached?: RobotsRules|null, checkedAt?: string|null }} [opts]
 *   Uložený výsledok z predchádzajúceho behu (z dokumentu feedu). Ak je
 *   čerstvý, nesiahne sa na sieť vôbec.
 * @returns {Promise<RobotsRules>}
 */
export async function robotsFor(url, opts = {}) {
  const robotsUrl = robotsUrlFor(url);
  const cached = cache.get(robotsUrl);
  if (cached && cached.at + CACHE_MS > Date.now()) return cached.rules;

  if (opts.cached && robotsFresh(opts.checkedAt)) {
    const rules = { rules: opts.cached.rules ?? [], crawlDelay: opts.cached.crawlDelay ?? null };
    cache.set(robotsUrl, { at: Date.parse(opts.checkedAt), rules });
    return rules;
  }

  let rules = { rules: [], crawlDelay: null };
  try {
    const res = await politeFetch(robotsUrl, { retries: 1 });
    rules = parseRobots(res.body ?? "", config.CRAWLER_USER_AGENT.toLowerCase());
  } catch (err) {
    logger.debug({ robotsUrl, err: err.message }, "robots.txt sa nepodarilo načítať, beriem ako povolené");
  }

  cache.set(robotsUrl, { at: Date.now(), rules });
  return rules;
}

export function resetRobotsCache() {
  cache.clear();
}

// Krok 1 crawlera: prečítať feed a uložiť nové články ako `candidate`.
//
// Čo tento krok **nerobí**: nesťahuje telá článkov, neextrahuje text, nič
// nepriraďuje ku kauzám. Z feedu berie len to, čo médium samo syndikuje —
// titulok, odkaz, dátum, autora, perex. Plný text a matching sú ďalší krok.
//
// Nič sa nezverejní: článok vzniká so `status: candidate` a čaká na moderátora
// alebo na matcher (produktové zadanie §4.5 — automatika navrhuje, človek
// potvrdzuje).

import * as couch from "../../shared/src/couch.js";
import * as store from "../../shared/src/store.js";
import { articleByUrl } from "../../shared/src/queries.js";
import { config } from "../../shared/src/config.js";
import { logger } from "../../shared/src/logger.js";
import { politeFetch, DEFAULT_COOLDOWN_MS, MAX_COOLDOWN_MS } from "./lib/http.js";
import { robotsFor, isAllowed, robotsFresh } from "./lib/robots.js";
import { parseFeed } from "./lib/feed.js";
import { canonicalize } from "./lib/url.js";

/** Crawler je bot. V audite aj v `created_by` je to vidieť. */
const ACTOR = { id: "worker:crawler", role: "bot" };

const FEED_TYPES = ["xml", "rss", "atom"];

/**
 * @typedef {object} CrawlResult
 * @property {string} feed
 * @property {"ok"|"not_modified"|"skipped"|"blocked"|"error"} status
 * @property {number} found     Položiek vo feede.
 * @property {number} created   Nových článkov.
 * @property {number} duplicate Už uložených.
 * @property {number} rejected  Neplatná URL alebo zakázaná v robots.txt.
 * @property {string} [error]
 */

/**
 * @param {Record<string, any>} feed
 * @param {{ limit?: number, dryRun?: boolean }} [opts]
 * @returns {Promise<CrawlResult>}
 */
export async function crawlFeed(feed, opts = {}) {
  const limit = opts.limit ?? config.CRAWL_MAX_ITEMS;
  const result = {
    feed: feed.name ?? feed._id,
    status: "ok",
    found: 0,
    created: 0,
    duplicate: 0,
    rejected: 0,
  };

  // Médium, ktoré nás odmietlo, dostane pokoj do času, ktorý samo povedalo.
  // Skúšať to každých tridsať minút znova je presne to, čo z limitu urobí trvalé
  // blokovanie — a feed pritom nie je pokazený.
  if (feed.blocked_until && Date.parse(feed.blocked_until) > Date.now()) {
    logger.info(
      { feed: feed.name, until: feed.blocked_until },
      "feed je dočasne blokovaný médiom, preskakujem",
    );
    return { ...result, status: "skipped", error: `blokované do ${feed.blocked_until}` };
  }

  // Uložený výsledok kontroly robots.txt sa použije, kým je čerstvý: každý beh
  // je nový proces a dve požiadavky na doménu tesne za sebou sú zbytočné.
  const robots = await robotsFor(feed.url, {
    cached: feed.robots_rules ? { rules: feed.robots_rules, crawlDelay: feed.robots_crawl_delay } : null,
    checkedAt: feed.robots_checked_at,
  });
  const robotsPatch = robotsFresh(feed.robots_checked_at) && feed.robots_rules
    ? {}
    : {
        robots_checked_at: new Date().toISOString(),
        robots_rules: robots.rules,
        robots_crawl_delay: robots.crawlDelay,
      };

  if (!isAllowed(robots, feed.url)) {
    logger.warn({ feed: feed.name, url: feed.url }, "robots.txt zakazuje feed, preskakujem");
    await recordRun(feed, { ...robotsPatch, robots_ok: false, last_error: "robots.txt zakazuje feed" }, opts);
    return { ...result, status: "skipped", error: "robots.txt" };
  }

  let res;
  try {
    res = await politeFetch(feed.url, {
      etag: feed.last_etag,
      lastModified: feed.last_modified,
      expectTypes: FEED_TYPES,
    });
  } catch (err) {
    // Odmietnutie (429/403) nie je chyba feedu, ale rozhodnutie média: zapíše sa
    // dokedy má pokoj a **nezvyšuje počítadlo zlyhaní** — inak by feed po pár
    // hodinách vyzeral ako rozbitý, hoci je v poriadku.
    if (err.blocked) {
      // Opakované odmietnutie znamená dlhší pokoj. SME neposiela `Retry-After`
      // a jeho limit na `/rss` je hodinový — pol hodiny by stačilo akurát na to,
      // aby sme doň narazili znova.
      const blocks = (feed.blocked_count ?? 0) + 1;
      const wait = Math.min(
        Math.max(err.retryAfterMs, DEFAULT_COOLDOWN_MS * 2 ** (blocks - 1)),
        MAX_COOLDOWN_MS,
      );
      const until = new Date(Date.now() + wait).toISOString();
      logger.warn({ feed: feed.name, status: err.status, until, blocks }, "médium crawler odmietlo");
      await recordRun(
        feed,
        {
          ...robotsPatch,
          last_error: err.message,
          blocked_until: until,
          blocked_count: blocks,
          robots_ok: true,
        },
        opts,
      );
      return { ...result, status: "blocked", error: err.message };
    }

    logger.error({ feed: feed.name, err: err.message }, "feed sa nepodarilo načítať");
    await recordRun(feed, { ...robotsPatch, last_error: err.message, robots_ok: true }, opts, true);
    return { ...result, status: "error", error: err.message };
  }

  // Podmienený GET: médium povedalo, že sa nič nezmenilo. Žiadne parsovanie,
  // žiadne zápisy — o to ide.
  if (res.notModified) {
    await recordRun(
      feed,
      { ...robotsPatch, last_error: null, blocked_until: null, blocked_count: 0, robots_ok: true },
      opts,
    );
    return { ...result, status: "not_modified" };
  }

  let items;
  try {
    items = parseFeed(res.body).items;
  } catch (err) {
    await recordRun(feed, { ...robotsPatch, last_error: err.message, robots_ok: true }, opts, true);
    return { ...result, status: "error", error: err.message };
  }

  result.found = items.length;

  for (const item of items.slice(0, limit)) {
    const url = canonicalize(item.url);
    if (!url) {
      result.rejected++;
      continue;
    }
    // Feed smie odkázať kamkoľvek — aj do sekcie, ktorú robots.txt zakazuje.
    if (!isAllowed(robots, url)) {
      result.rejected++;
      continue;
    }

    const existing =
      (await articleByUrl(url)) ?? (item.guid ? await articleByUrl(item.guid) : null);
    if (existing) {
      result.duplicate++;
      continue;
    }

    if (opts.dryRun) {
      result.created++;
      logger.info({ url, title: item.title }, "[dry-run] nový článok");
      continue;
    }

    await store.createDoc({
      type: "article",
      data: {
        kind: "media",
        url: item.url,
        canonical_url: url,
        feed_guid: item.guid,
        archive_url: null,
        title: item.title,
        publisher: feed.publisher ?? feed.name,
        published_at: item.published_at,
        fetched_at: new Date().toISOString(),
        author: item.author,
        // Perex z feedu, nie stiahnutý text. `body` doplní krok 2.
        excerpt: item.excerpt,
        body: null,
        content_hash: null,
        // „Nové" v jazyku dátového modelu: čaká na spracovanie.
        status: "candidate",
        case_ids: [],
        person_ids: [],
        feed_id: feed._id,
        paywall: !!feed.paywall,
        categories: item.categories,
      },
      actor: ACTOR,
      reason: `nový článok z feedu ${feed.name}`,
    });

    result.created++;
  }

  await recordRun(
    feed,
    {
      ...robotsPatch,
      last_error: null,
      blocked_until: null,
      blocked_count: 0,
      robots_ok: true,
      last_etag: res.etag ?? null,
      last_modified: res.lastModified ?? null,
      last_item_count: result.found,
    },
    opts,
  );

  return result;
}

/**
 * Stav behu sa píše na dokument feedu. Neaudituje sa: `last_etag` a `last_run_at`
 * nie sú redakčná zmena a revízia po každom behu by pochovala tie, ktoré ňou sú.
 */
async function recordRun(feed, patch, opts, failed = false) {
  if (opts.dryRun) return;

  await store.updateDoc({
    id: feed._id,
    patch: {
      ...patch,
      last_run_at: new Date().toISOString(),
      consecutive_failures: failed ? (feed.consecutive_failures ?? 0) + 1 : 0,
    },
    actor: ACTOR,
    reason: "stav crawlu",
    audit: false,
  });
}

/**
 * @param {{ feedId?: string, limit?: number, dryRun?: boolean, includeDisabled?: boolean }} [opts]
 * @returns {Promise<CrawlResult[]>}
 */
export async function crawlAll(opts = {}) {
  const feeds = opts.feedId
    ? [await couch.get(opts.feedId)].filter(Boolean)
    : await couch.listByType("feed");

  const enabled = feeds.filter((f) => f && (opts.includeDisabled || f.enabled !== false));
  if (enabled.length === 0) {
    logger.warn("žiadny zapnutý feed na spracovanie");
    return [];
  }

  const results = [];
  // Sekvenčne: limit je jedna požiadavka za sekundu na doménu a paralelný beh
  // by ho len obchádzal cez viac spojení naraz.
  for (const feed of enabled) {
    const result = await crawlFeed(feed, opts);
    logger.info(result, "feed spracovaný");
    results.push(result);
  }
  return results;
}

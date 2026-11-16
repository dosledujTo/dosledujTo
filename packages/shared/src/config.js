// Configuration comes from the environment and is validated at startup.
// Fail fast: a process that starts with half a configuration fails later, in
// production, at the worst possible moment (backend-zadanie.md §9).

import { z } from "zod";

const bool = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  COUCH_URL: z.string().url().default("http://127.0.0.1:5984"),
  COUCH_USER: z.string().optional(),
  COUCH_PASSWORD: z.string().optional(),
  COUCH_DB: z.string().min(1).default("dosledujto_register"),

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Rolling refresh at most once an hour — CouchDB is not Redis, and a write on
  // every request is a write on every request (backend-zadanie.md §7).
  SESSION_REFRESH_MIN: z.coerce.number().int().positive().default(60),
  COOKIE_SECURE: bool(undefined),

  // Cloudflare Turnstile. Required in production: without it every suggestion
  // endpoint is an open write path.
  TURNSTILE_SECRET: z.string().optional(),
  // Verejný kľúč Turnstile pre formulár podnetu na webe. Je verejný z povahy
  // veci (ide do HTML); bez neho web formulár ukáže bez captchy, čo funguje len
  // tam, kde je captcha vypnutá (vývoj).
  TURNSTILE_SITE_KEY: z.string().optional(),

  // Crawler. The User-Agent names the project and carries a contact address:
  // a publisher that wants us to stop must have somebody to write to. It is
  // also load-bearing — SME answers the default curl agent with a "Request
  // Blocked" page, with status 200.
  CRAWLER_USER_AGENT: z
    .string()
    .default("dosledujto-bot/0.1 (+https://dosleduj.to; kontakt@dosleduj.to)"),
  CRAWL_MIN_INTERVAL_MS: z.coerce.number().int().min(200).default(1000),
  CRAWL_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  /** Upper bound on articles taken from one feed in one run. */
  CRAWL_MAX_ITEMS: z.coerce.number().int().min(1).max(500).default(50),

  TRUST_PROXY: bool(false),
  // Verejná adresa webu bez lomky na konci, napr. https://dosleduj.to. Z nej sa
  // skladajú absolútne odkazy v <head> (og:image). Hlavička Host sa na to
  // nepoužije: stránky sa cachujú a podvrhnutý Host by skončil v cache.
  PUBLIC_URL: z.string().url().transform((v) => v.replace(/\/+$/, "")).optional(),
  // „Zabudnuté, ale nevyriešené" (handoff „Červená niť" kap. 6.3): otvorená
  // kauza s aspoň toľkými článkami, o ktorej toľko dní nič nevyšlo.
  FORGOTTEN_MIN_ARTICLES: z.coerce.number().int().min(1).default(20),
  FORGOTTEN_SILENCE_DAYS: z.coerce.number().int().min(1).default(365),
  // Salt for hashing IP addresses. Logs and session records never hold a raw IP.
  IP_HASH_SALT: z.string().min(8).default("dev-salt-change-me"),
});

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function loadConfig(env = process.env, warnings = []) {
  // Docker Compose predáva premennú, ktorá nie je nastavená, ako **prázdny
  // reťazec** — nie ako chýbajúcu. Bez tohto by `COOKIE_SECURE=` znamenalo
  // `false` aj v produkcii (session cookie bez `Secure`) a prázdny
  // `IP_HASH_SALT` by prešiel kontrolou, lebo sa nerovná predvolenej hodnote.
  // Prázdna hodnota je „nenastavené", nech ju posiela ktokoľvek.
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== ""),
  );

  // Preklep v mene premennej je inak neviditeľný: zod neznáme kľúče ignoruje,
  // aplikácia si vezme predvolenú hodnotu a chyba sa prejaví až o tri vrstvy
  // nižšie ako niečo úplne iné (`COUCH_URl` → „ECONNREFUSED 127.0.0.1“).
  const known = Object.keys(schema.shape);
  for (const key of Object.keys(present)) {
    if (known.includes(key)) continue;
    const match = known.find((k) => k.toLowerCase() === key.toLowerCase());
    if (match) {
      warnings.push(
        `premenná "${key}" sa od "${match}" líši len veľkosťou písmen — ` +
          "ignoruje sa a použije sa predvolená hodnota. Preklep?",
      );
    }
  }

  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`invalid configuration:\n  ${details}`);
  }
  const cfg = parsed.data;

  if (cfg.COOKIE_SECURE === undefined) {
    cfg.COOKIE_SECURE = cfg.NODE_ENV === "production";
  }
  if (cfg.NODE_ENV === "production") {
    if (!cfg.TURNSTILE_SECRET) {
      throw new Error("TURNSTILE_SECRET is required in production");
    }
    if (cfg.IP_HASH_SALT === "dev-salt-change-me") {
      throw new Error("IP_HASH_SALT must be set in production");
    }
  }
  return cfg;
}

/**
 * Upozornenia zo štartu, ktoré nie sú dôvodom na pád. Loguje ich `server.js` —
 * `logger` závisí od konfigurácie, takže tá sama logovať nemôže.
 * @type {string[]}
 */
export const configWarnings = [];

export const config = loadConfig(process.env, configWarnings);

/**
 * Adresa bez prihlasovacích údajov. Heslo môže byť súčasťou `COUCH_URL`, a
 * chybová hláška o nedostupnej databáze končí v logoch — tam nemá čo robiť.
 *
 * @param {string} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return String(url);
  }
}

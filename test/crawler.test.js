// Crawler bez siete: kanonizácia URL, parsovanie feedov, robots.txt. Tri miesta,
// kde chyba znamená buď duplicity v registri, alebo požiadavku, ktorú médium
// nechcelo dostať.

import { afterEach, describe, it, expect, vi } from "vitest";
import { canonicalize, hostOf, robotsUrlFor } from "../packages/worker/src/lib/url.js";
import { parseFeed, toIso } from "../packages/worker/src/lib/feed.js";
import { parseRobots, isAllowed } from "../packages/worker/src/lib/robots.js";
import { politeFetch, resetThrottle } from "../packages/worker/src/lib/http.js";
import { crawlFeed } from "../packages/worker/src/crawl.js";

describe("kanonizácia URL", () => {
  it("odstráni tracking parametre, ktoré nie sú súčasťou identity článku", () => {
    expect(canonicalize("https://sme.sk/c/123?utm_source=newsletter&fbclid=xyz")).toBe(
      "https://sme.sk/c/123",
    );
  });

  it("nechá parametre, ktoré článok naozaj identifikujú", () => {
    expect(canonicalize("https://dennikn.sk/?p=5495833")).toBe("https://dennikn.sk/?p=5495833");
  });

  it("zjednotí koncovú lomku, fragment a poradie parametrov", () => {
    const a = canonicalize("https://aktuality.sk/clanok/abc/#komentare");
    const b = canonicalize("https://aktuality.sk/clanok/abc");
    expect(a).toBe(b);

    expect(canonicalize("https://x.sk/a?b=2&a=1")).toBe(canonicalize("https://x.sk/a?a=1&b=2"));
  });

  it("odmietne, čo nie je stiahnuteľný článok", () => {
    expect(canonicalize("javascript:alert(1)")).toBeNull();
    expect(canonicalize("mailto:redakcia@sme.sk")).toBeNull();
    expect(canonicalize("")).toBeNull();
    expect(canonicalize("toto nie je url")).toBeNull();
  });

  it("pozná doménu pre limit požiadaviek a adresu robots.txt", () => {
    expect(hostOf("https://www.sme.sk/c/1")).toBe("www.sme.sk");
    expect(robotsUrlFor("https://www.sme.sk/rss")).toBe("https://www.sme.sk/robots.txt");
  });
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Testoviny.sk</title>
    <item>
      <title>Most v Testoviciach &amp; kontrola</title>
      <link>https://skuska.example/clanok/most?utm_source=rss</link>
      <guid>https://skuska.example/?p=42</guid>
      <pubDate>Tue, 11 Mar 2025 08:30:00 +0100</pubDate>
      <dc:creator><![CDATA[Ján Novák]]></dc:creator>
      <category><![CDATA[Slovensko]]></category>
      <description><![CDATA[<p>Kontrola zistila rozdiel <b>12,5 milióna</b> eur.</p>]]></description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Vzorové noviny</title>
  <entry>
    <title>Súd oslobodil Skúšobnú</title>
    <link rel="edit" href="https://vzorovenoviny.example/edit/1"/>
    <link rel="alternate" href="https://vzorovenoviny.example/clanok/1"/>
    <id>tag:vzorovenoviny.example,2025:1</id>
    <published>2025-11-04T14:10:00Z</published>
    <author><name>J. Príkladová</name></author>
    <summary>Krajský súd potvrdil oslobodzujúci rozsudok.</summary>
  </entry>
</feed>`;

describe("parsovanie feedu", () => {
  it("prečíta RSS 2.0 vrátane CDATA a entít", () => {
    const { title, items } = parseFeed(RSS);

    expect(title).toBe("Testoviny.sk");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Most v Testoviciach & kontrola");
    expect(items[0].author).toBe("Ján Novák");
    expect(items[0].guid).toBe("https://skuska.example/?p=42");
    expect(items[0].categories).toEqual(["Slovensko"]);
    // HTML z perexu sa neukladá, ukladá sa text.
    expect(items[0].excerpt).toBe("Kontrola zistila rozdiel 12,5 milióna eur.");
  });

  it("prečíta Atom a vyberie správny odkaz spomedzi viacerých", () => {
    const { items } = parseFeed(ATOM);

    expect(items[0].url).toBe("https://vzorovenoviny.example/clanok/1");
    expect(items[0].published_at).toBe("2025-11-04T14:10:00.000Z");
    expect(items[0].author).toBe("J. Príkladová");
  });

  it("jednopoložkový feed nie je iný tvar ako viacpoložkový", () => {
    expect(Array.isArray(parseFeed(RSS).items)).toBe(true);
  });

  it("neznámy formát je chyba, nie prázdny feed", () => {
    expect(() => parseFeed("<html><body>Request Blocked</body></html>")).toThrow(/formát/);
  });

  it("RFC 822 dátum prevedie na ISO", () => {
    expect(toIso("Tue, 11 Mar 2025 08:30:00 +0100")).toBe("2025-03-11T07:30:00.000Z");
  });

  it("dátum v budúcnosti zahodí — kauza nemôže mať udalosť, ktorá sa nestala", () => {
    const future = new Date(Date.now() + 30 * 86400_000).toUTCString();
    expect(toIso(future)).toBeNull();
    expect(toIso("nezmysel")).toBeNull();
  });
});

describe("robots.txt", () => {
  const TEXT = `
    User-agent: *
    Disallow: /admin/
    Disallow: *preview=true*

    User-agent: dosledujto-bot
    Crawl-delay: 2
    Disallow: /platene/
    Allow: /platene/ukazka

    User-agent: GPTBot
    Disallow: /
  `;

  it("vyberie skupinu pre nášho robota, nie hviezdičku", () => {
    const rules = parseRobots(TEXT, "dosledujto-bot/0.1 (+https://dosleduj.to)");

    expect(rules.crawlDelay).toBe(2);
    expect(isAllowed(rules, "https://x.sk/admin/")).toBe(true); // pravidlo z `*` sa neuplatní
    expect(isAllowed(rules, "https://x.sk/platene/clanok")).toBe(false);
  });

  it("špecifickejšie Allow prebije všeobecnejší Disallow", () => {
    const rules = parseRobots(TEXT, "dosledujto-bot/0.1");
    expect(isAllowed(rules, "https://x.sk/platene/ukazka")).toBe(true);
  });

  it("neznámy robot dostane pravidlá z hviezdičky", () => {
    const rules = parseRobots(TEXT, "nejaky-iny-bot/1.0");
    expect(isAllowed(rules, "https://x.sk/admin/tajne")).toBe(false);
    expect(isAllowed(rules, "https://x.sk/clanok/1")).toBe(true);
    expect(isAllowed(rules, "https://x.sk/clanok/1?preview=true")).toBe(false);
  });

  it("prázdny alebo chýbajúci robots.txt znamená povolené", () => {
    expect(isAllowed(parseRobots("", "x"), "https://x.sk/hocico")).toBe(true);
  });

  it("skutočný robots.txt Denníka N zakazuje len náhľady", () => {
    const real = "User-agent: *\nDisallow: *preview=true*\n\nUser-agent: PetalBot\nDisallow: /";
    const rules = parseRobots(real, "dosledujto-bot/0.1");

    expect(isAllowed(rules, "https://dennikn.sk/5495833/clanok/")).toBe(true);
    expect(isAllowed(rules, "https://dennikn.sk/5495833/?preview=true")).toBe(false);
  });
});


// ── Odmietnutie médiom ───────────────────────────────────────────────────────
//
// Toto nie je hypotetický prípad: SME má na `/rss` limit, ktorý po pár
// požiadavkách vráti 429 (a pri opakovaní 403), zatiaľ čo `robots.txt` z tej
// istej domény odpovedá normálne. Crawler, ktorý to skúša každých tridsať minút
// znova, si limit len predlžuje — a feed pritom nie je pokazený.

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  resetThrottle();
  vi.restoreAllMocks();
});

/** Odpoveď so stavom a hlavičkami, bez siete. */
function respondWith(status, headers = {}) {
  const calls = { count: 0 };
  global.fetch = vi.fn(async () => {
    calls.count++;
    return new Response("blokované", { status, headers });
  });
  return calls;
}

describe("médium, ktoré crawler odmietne", () => {
  it("429 nie je chyba feedu, ale odmietnutie s časom, dokedy má byť pokoj", async () => {
    respondWith(429);

    const err = await politeFetch("https://limit-a.example/rss", { retries: 0 }).catch((e) => e);

    expect(err.blocked).toBe(true);
    expect(err.status).toBe(429);
    // Bez `Retry-After` sa čaká pol hodiny — nie dve sekundy, čo je pri limite
    // na počet požiadaviek to isté ako neskúšať nič.
    expect(err.retryAfterMs).toBe(30 * 60 * 1000);
  });

  it("403 sa berie rovnako — médium nás nepustí, feed je v poriadku", async () => {
    respondWith(403);
    const err = await politeFetch("https://limit-b.example/rss", { retries: 0 }).catch((e) => e);
    expect(err.blocked).toBe(true);
    expect(err.status).toBe(403);
  });

  it("odmietnutá doména sa v tom istom behu už neoslovuje", async () => {
    const calls = respondWith(429);

    await politeFetch("https://limit-c.example/rss", { retries: 0 }).catch(() => {});
    const second = await politeFetch("https://limit-c.example/iny-feed", { retries: 0 }).catch((e) => e);

    expect(second.blocked).toBe(true);
    // Druhá požiadavka na sieť vôbec nešla.
    expect(calls.count).toBe(1);
  });

  it("dlhé `Retry-After` sa rešpektuje, namiesto opakovania po pár sekundách", async () => {
    respondWith(429, { "retry-after": "3600" });

    const err = await politeFetch("https://limit-d.example/rss", { retries: 2 }).catch((e) => e);

    expect(err.blocked).toBe(true);
    expect(err.retryAfterMs).toBe(3600 * 1000);
  });

  it("feed, ktorý má pokoj, sa nesťahuje znova", async () => {
    const calls = respondWith(200);
    const until = new Date(Date.now() + 60_000).toISOString();

    const result = await crawlFeed(
      { _id: "feed:x", name: "Blokovaný", url: "https://limit-e.example/rss", blocked_until: until },
      { dryRun: true },
    );

    expect(result.status).toBe("skipped");
    expect(calls.count).toBe(0);
  });

  it("odmietnutie sa vykáže ako `blocked`, nie ako chyba", async () => {
    respondWith(429);

    const result = await crawlFeed(
      { _id: "feed:y", name: "Limitovaný", url: "https://limit-f.example/rss" },
      { dryRun: true },
    );

    expect(result.status).toBe("blocked");
  });
});

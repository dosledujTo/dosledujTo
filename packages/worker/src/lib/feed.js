// Parsovanie RSS 2.0 a Atomu do jedného tvaru.
//
// Feedy štyroch MVP médií sa líšia vo všetkom okrem zámeru: Aktuality dávajú
// `<description>` s perexom, Denník N `<dc:creator>` a kategórie, Postoj má
// články na viacerých subdoménach. Zvyšok systému nesmie vedieť, ktoré médium
// to bolo — dostane vždy rovnakú položku.

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  // Bez tohto sa jednoprvkový feed parsuje ako objekt a viacprvkový ako pole.
  isArray: (name) => name === "item" || name === "entry",
});

/**
 * @typedef {object} FeedItem
 * @property {string} url
 * @property {string|null} guid
 * @property {string} title
 * @property {string|null} published_at  ISO 8601
 * @property {string|null} author
 * @property {string|null} excerpt
 * @property {string[]} categories
 */

/**
 * @param {string} xml
 * @returns {{ title: string|null, items: FeedItem[] }}
 */
export function parseFeed(xml) {
  const doc = parser.parse(xml);

  if (doc?.rss?.channel) return parseRss(doc.rss.channel);
  if (doc?.feed) return parseAtom(doc.feed);
  if (doc?.["rdf:RDF"]) return parseRss(doc["rdf:RDF"]); // RSS 1.0

  throw new Error("neznámy formát feedu (ani RSS, ani Atom)");
}

function parseRss(channel) {
  const items = (channel.item ?? []).map((item) => ({
    url: text(item.link),
    guid: text(item.guid) || null,
    title: clean(text(item.title)),
    published_at: toIso(text(item.pubDate) || text(item["dc:date"])),
    author: clean(text(item["dc:creator"]) || text(item.author)) || null,
    excerpt: excerptOf(text(item.description) || text(item["content:encoded"])),
    categories: list(item.category),
  }));

  return { title: clean(text(channel.title)) || null, items: items.filter((i) => i.url) };
}

function parseAtom(feed) {
  const items = (feed.entry ?? []).map((entry) => ({
    url: linkOf(entry.link),
    guid: text(entry.id) || null,
    title: clean(text(entry.title)),
    published_at: toIso(text(entry.published) || text(entry.updated)),
    author: clean(text(entry.author?.name)) || null,
    excerpt: excerptOf(text(entry.summary) || text(entry.content)),
    categories: list(entry.category).map((c) => (typeof c === "string" ? c : "")).filter(Boolean),
  }));

  return { title: clean(text(feed.title)) || null, items: items.filter((i) => i.url) };
}

/** Atom `<link>` môže byť pole s rôznymi `rel`; chceme ten, čo vedie na článok. */
function linkOf(link) {
  if (!link) return "";
  const links = Array.isArray(link) ? link : [link];
  const alternate = links.find((l) => !l["@rel"] || l["@rel"] === "alternate") ?? links[0];
  return text(alternate?.["@href"] ?? alternate);
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return String(value["#text"] ?? "").trim();
  return String(value).trim();
}

function list(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
}

/** Feedy nesú HTML a entity; ukladáme čitateľný text. */
function clean(value) {
  return decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

/**
 * Perex z feedu. Nie je to plný text článku — ten sa v tomto kroku nesťahuje —
 * a von cez API ide aj tak najviac 300 znakov (produktové zadanie §10).
 */
function excerptOf(value) {
  const stripped = clean(value);
  if (!stripped) return null;
  return stripped.length > 1000 ? stripped.slice(0, 1000).trimEnd() + "…" : stripped;
}

/**
 * RSS dátumy sú RFC 822, Atom ISO 8601. Index ich ukladá ako epoch number, takže
 * do dokumentu patrí jeden tvar — ISO.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function toIso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  // Dátum v budúcnosti je chyba feedu; radšej ho nezapíšeme, než aby kauza mala
  // udalosť, ktorá sa ešte nestala.
  if (ms > Date.now() + 24 * 60 * 60 * 1000) return null;
  return new Date(ms).toISOString();
}

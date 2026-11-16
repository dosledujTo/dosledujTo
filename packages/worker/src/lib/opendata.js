// Klient Národného katalógu otvorených dát (data.slovensko.sk).
//
// Toto je legálne čistá cesta k úradným dátam: `robots.txt` katalógu je
// `Allow: /` a SPARQL endpoint je verejný. Interaktívne registre (InfoSúd,
// ORSR) robotom zakázané sú — katalóg nie.
//
// Modul zámerne nevie nič o pojednávaniach ani o kauzách. Odpovedá na dve
// otázky: „ktoré datasety existujú" a „kde sa dá stiahnuť súbor". Čo sa s tým
// súborom spraví, patrí do ingestu konkrétneho datasetu.

import { politeFetch } from "./http.js";

export const SPARQL_ENDPOINT = "https://data.slovensko.sk/api/sparql";

const PREFIXES = `
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
`;

/**
 * Escapovanie do SPARQL literálu. Rovnaký problém ako pri Lucene: reťazec od
 * používateľa sa skladá do dotazu, takže úvodzovka, spätná lomka ani nový
 * riadok sa cez ňu nesmú dostať.
 *
 * @param {string} value
 */
export function escapeLiteral(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * IRI sa do dotazu vkladá v `<…>`, takže sa musí odmietnuť všetko, čo by
 * zátvorku zavrelo skôr.
 *
 * @param {string} iri
 */
export function assertIri(iri) {
  if (!/^https?:\/\/[^\s<>"{}|\\^`]+$/.test(String(iri))) {
    throw new Error(`neplatné IRI datasetu: ${iri}`);
  }
  return iri;
}

/**
 * @param {string} query  SPARQL SELECT
 * @returns {Promise<Array<Record<string, string>>>}
 */
export async function sparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  // Bez explicitného Accept vráti endpoint SPARQL výsledky v XML.
  const res = await politeFetch(url, {
    accept: "application/sparql-results+json",
    expectTypes: ["sparql-results+json", "json"],
  });

  const data = JSON.parse(res.body);
  return data.results.bindings.map((row) => {
    const out = {};
    for (const [key, cell] of Object.entries(row)) out[key] = cell.value;
    return out;
  });
}

/**
 * Datasety, ktorých názov obsahuje hľadaný výraz.
 *
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{ uri: string, title: string, publisher: string|null }>>}
 */
export async function searchDatasets(query, opts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);
  const rows = await sparql(`${PREFIXES}
SELECT DISTINCT ?uri ?title ?publisher WHERE {
  ?uri a dcat:Dataset ; dct:title ?title .
  OPTIONAL { ?uri dct:publisher ?publisher }
  FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${escapeLiteral(query)}")))
} LIMIT ${limit}`);

  // Katalóg vracia ten istý dataset viackrát (viacero jazykových variantov
  // názvu); zaujíma nás jeden riadok na URI.
  const byUri = new Map();
  for (const row of rows) {
    if (!byUri.has(row.uri)) {
      byUri.set(row.uri, { uri: row.uri, title: row.title, publisher: row.publisher ?? null });
    }
  }
  return [...byUri.values()];
}

/**
 * @typedef {object} Distribution
 * @property {string|null} title
 * @property {string|null} downloadUrl
 * @property {string|null} accessUrl
 * @property {string|null} format
 * @property {string|null} mediaType
 */

/**
 * @param {string} datasetUri
 * @returns {Promise<Distribution[]>}
 */
export async function distributionsOf(datasetUri) {
  const rows = await sparql(`${PREFIXES}
SELECT ?title ?download ?access ?format ?media WHERE {
  <${assertIri(datasetUri)}> dcat:distribution ?dist .
  OPTIONAL { ?dist dct:title ?title }
  OPTIONAL { ?dist dcat:downloadURL ?download }
  OPTIONAL { ?dist dcat:accessURL ?access }
  OPTIONAL { ?dist dct:format ?format }
  OPTIONAL { ?dist dcat:mediaType ?media }
} LIMIT 50`);

  return rows.map((row) => ({
    title: row.title ?? null,
    downloadUrl: row.download ?? null,
    accessUrl: row.access ?? null,
    format: row.format ? row.format.split("/").pop() : null,
    mediaType: row.media ? row.media.split("/").pop() : null,
  }));
}

/**
 * Je distribúcia naozaj stiahnuteľná?
 *
 * Katalóg je zoznam sľubov, nie záruka. Odkazy v ňom zastarávajú a publikujúci
 * úrad sa to spravidla nedozvie — preto sa každý zdroj pred nasadením overuje a
 * výsledok tejto kontroly je to, čo sa hlási ďalej.
 *
 * @param {string} url
 * @returns {Promise<{ url: string, alive: boolean, status: number|null, contentType: string|null, bytes: number|null, error?: string }>}
 */
export async function checkDistribution(url) {
  try {
    const res = await politeFetch(url, { retries: 0 });
    const looksLikeError =
      (res.contentType ?? "").includes("text/html") &&
      /404|not found|server error/i.test((res.body ?? "").slice(0, 800));

    return {
      url,
      alive: !looksLikeError,
      status: res.status,
      contentType: res.contentType ?? null,
      bytes: res.body?.length ?? null,
      ...(looksLikeError ? { error: "server vrátil chybovú stránku so stavom 200" } : {}),
    };
  } catch (err) {
    return { url, alive: false, status: null, contentType: null, bytes: null, error: err.message };
  }
}

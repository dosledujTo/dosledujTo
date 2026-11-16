// URL kanonizácia. Bez nej crawler založí ten istý článok toľkokrát, koľkými
// cestami ho médium odkáže — utm parametre z newslettra, `?fbclid` zo zdieľania,
// koncová lomka navyše.

/** Parametre, ktoré nikdy nie sú súčasťou identity článku. */
const TRACKING = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^gbraid$/i, /^wbraid$/i, /^mc_[ce]id$/i,
  /^ref$/i, /^source$/i, /^_ga$/i, /^igshid$/i, /^cid$/i,
];

/**
 * @param {string} raw
 * @returns {string|null} Kanonická URL, alebo null ak sa nedá použiť.
 */
export function canonicalize(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  // Crawler chodí len po HTTP(S). `mailto:` a `javascript:` vo feede nie sú
  // článok, ale chyba na strane média — alebo pokus.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "www.");

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  // Koncová lomka je pre server ten istý dokument, pre reťazcové porovnanie nie.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

/**
 * Doména, na ktorej sa uplatňuje limit požiadaviek za sekundu.
 * @param {string} raw
 */
export function hostOf(raw) {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * Adresa `robots.txt` pre danú URL.
 * @param {string} raw
 */
export function robotsUrlFor(raw) {
  const url = new URL(raw);
  return `${url.protocol}//${url.host}/robots.txt`;
}

// Spoločné časti profilu osoby a subjektu (handoff „Červená niť" kap. 3):
// hlava s počítadlami, lišta záložiek, stránkovanie a segmentový prepínač.
//
// Záložky aj filtre sú **odkazy**, nie klientský stav: každá má vlastnú adresu,
// renderuje sa na serveri a dá sa na ňu poslať odkaz (kap. 11).

import { Link } from "react-router";
import { plural } from "../format.js";
import { SourceRef } from "./chrome.jsx";

/** Zdroje sú po 20 na stranu (kap. 3.4). */
export const SOURCES_PER_PAGE = 20;

/**
 * Odkaz na zdroj `[n]` v záložke Zdroje — na správnu stranu pri predvolenom
 * triedení, s kotvou na riadok.
 *
 * @param {string} base  napr. "/osoba/jan-testovaci"
 * @param {number|null} no
 */
export function sourceHref(base, no) {
  if (!no) return `${base}/zdroje`;
  const page = Math.ceil(no / SOURCES_PER_PAGE);
  return `${base}/zdroje${page > 1 ? `?strana=${page}` : ""}#zdroj-${no}`;
}

/**
 * Čísla zdrojov ako `[4] [7]`, každé odkazom do záložky Zdroje.
 * @param {{ base: string, nos: Array<number|null>, derived?: boolean, derivation?: string|null }} props
 */
export function SourceNos({ base, nos, derived = false, derivation = null }) {
  const unique = [...new Set(nos.filter(Boolean))].sort((a, b) => a - b);
  if (unique.length === 0) return null;
  return (
    <span className="src-nos">
      {unique.map((no, i) => (
        <SourceRef
          key={no}
          no={no}
          href={sourceHref(base, no)}
          derived={derived && i === 0}
          derivation={derivation}
        />
      ))}
    </span>
  );
}

const TABS = [
  ["", "Mapa"],
  ["v-case", "V čase"],
  ["siet", "Sieť"],
  ["zdroje", "Zdroje"],
];

/**
 * @param {{ base: string, tab: string, hints: Record<string, string> }} props
 *   `hints` — malý údaj pri záložke („1 krok", „2016–2027", „28").
 */
export function ProfileTabs({ base, tab, hints = {} }) {
  return (
    <nav className="tabs" aria-label="Pohľady na prepojenia">
      {TABS.map(([slug, label]) => {
        const current = tab === (slug || "mapa");
        return (
          <Link
            key={label}
            to={slug ? `${base}/${slug}` : base}
            aria-current={current ? "page" : undefined}
            className={current ? "on" : undefined}
          >
            {label}
            {hints[slug || "mapa"] && <small>{hints[slug || "mapa"]}</small>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Hlava profilu: názov, krátky popis so zdrojom a štyri počítadlá.
 *
 * @param {{ kicker: string, title: string, lead?: string|null, leadNos?: number[], base: string,
 *   counts?: { cases: number, orgs: number, people: number, sources: number } }} props
 */
export function ProfileHead({ kicker, title, lead, leadNos = [], base, counts }) {
  const c = counts ?? { cases: 0, orgs: 0, people: 0, sources: 0 };
  return (
    <section className="prof-head">
      <div>
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        {lead && (
          <p className="lead">
            {lead} <SourceNos base={base} nos={leadNos} />
          </p>
        )}
      </div>
      <dl className="stats tnum">
        <div><dt>{plural(c.cases, "kauza", "kauzy", "káuz")}</dt><dd>{c.cases}</dd></div>
        <div><dt>firmy a strany</dt><dd>{c.orgs}</dd></div>
        <div><dt>{plural(c.people, "človek v okolí", "ľudia v okolí", "ľudí v okolí")}</dt><dd>{c.people}</dd></div>
        <div><dt>{plural(c.sources, "zdroj", "zdroje", "zdrojov")}</dt><dd>{c.sources}</dd></div>
      </dl>
    </section>
  );
}

/**
 * Stránkovanie ← 1 2 3 … n →. Odkazy `?strana=n`, takže funguje aj bez JS.
 *
 * @param {{ page: number, pages: number, href: (page: number) => string, label?: string }} props
 */
export function Pager({ page, pages, href, label = "Stránkovanie" }) {
  if (pages <= 1) return null;
  const shown = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const list = [...shown].sort((a, b) => a - b);
  const items = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) items.push(<span key={`gap-${n}`} className="gap" aria-hidden="true">…</span>);
    items.push(
      <Link key={n} to={href(n)} aria-current={n === page ? "page" : undefined} aria-label={`Strana ${n}`}>
        {n}
      </Link>,
    );
  });
  return (
    <nav className="pages" aria-label={label}>
      {page > 1 ? <Link to={href(page - 1)} rel="prev" aria-label="Predchádzajúca strana">←</Link> : <span className="off" aria-hidden="true">←</span>}
      {items}
      {page < pages ? <Link to={href(page + 1)} rel="next" aria-label="Ďalšia strana">→</Link> : <span className="off" aria-hidden="true">→</span>}
    </nav>
  );
}

/**
 * Segmentový prepínač — zoznam odkazov s query parametrom, nie klientský stav.
 *
 * @param {{ label: string, options: Array<{ label: string, href: string, current: boolean }> }} props
 */
export function Seg({ label, options }) {
  return (
    <nav className="seg" aria-label={label}>
      {options.map((o) => (
        <Link key={o.label} to={o.href} aria-current={o.current ? "true" : undefined}>{o.label}</Link>
      ))}
    </nav>
  );
}

/**
 * Query reťazec z objektu — prázdne hodnoty vynechá.
 * @param {Record<string, string|number|undefined|null|false>} params
 */
export function qs(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
}

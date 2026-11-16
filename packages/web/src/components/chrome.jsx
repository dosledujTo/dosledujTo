// Hlavička, pätička a drobné prvky, ktoré sa opakujú (dizajn „Červená niť").

import { Link, NavLink, useNavigate, useLocation } from "react-router";
import { useTheme } from "../theme.jsx";
import { phaseLabel, roleLabel, safeUrl, statusLabel } from "../format.js";
import { Logo } from "./Logo.jsx";

export function Header() {
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <Link className="hdr-brand" to="/" aria-label="Dosleduj.to — titulka">
          <Logo width={150} />
        </Link>

        <nav className="hdr-nav" aria-label="Hlavná navigácia">
          <NavLink to="/kauzy">Kauzy</NavLink>
          <NavLink to="/osoby">Ľudia</NavLink>
          <NavLink to="/subjekty">Firmy a strany</NavLink>
          <NavLink to="/kalendar">Čo sa chystá</NavLink>
        </nav>

        <form
          className="hdr-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const q = new FormData(event.currentTarget).get("q");
            navigate(`/hladat?q=${encodeURIComponent(String(q ?? ""))}`);
          }}
          action="/hladat"
          method="get"
        >
          <label className="vh" htmlFor="q-top">Hľadať</label>
          <SearchIcon />
          <input
            id="q-top" type="search" name="q" placeholder="Hľadať osobu, firmu, kauzu…"
            defaultValue="" key={location.key}
          />
        </form>

        {/* Jediný kúsok klientského stavu na celom webe. */}
        <button type="button" className="theme-btn" onClick={toggle} aria-pressed={dark}>
          <span aria-hidden="true" className="theme-ico" />
          {dark ? "Svetlý režim" : "Tmavý režim"}
        </button>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg className="hdr-search-ico" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 9.5 13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Pätička je tmavá v oboch režimoch — tokeny sa v nej prepíšu lokálne (`.ftr`). */
export function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap ftr-grid">
        <div>
          <Logo width={150} title="Dosleduj.to" />
          <p>
            Verejná pamäť slovenských káuz. Usporadúvame to, čo zverejnili médiá a úrady. Nové
            tvrdenia o ľuďoch nevytvárame.
          </p>
        </div>
        <div>
          <h2 className="ftr-h">Pravidlá</h2>
          <p>
            Údaj bez zdroja nezverejníme. Platí prezumpcia neviny: podozrivý, obvinený a
            obžalovaný nie je odsúdený. Oslobodenie je rovnako viditeľné ako obvinenie.
          </p>
        </div>
        <div>
          <h2 className="ftr-h">Oprava</h2>
          <p>
            Našli ste chybu alebo ste dotknutá osoba? Podnet na opravu musí obsahovať odkaz na
            zdroj.
          </p>
          <p style={{ marginTop: 10 }}><Link to="/podnet">Poslať podnet →</Link></p>
        </div>
      </div>
    </footer>
  );
}

/** Štítok stavu kauzy: otvorená je tichá, uzavretá dostane rámik. */
export function StatusPill({ status }) {
  if (!status) return null;
  return <span className={`tag ${status === "closed" ? "tag-closed" : "tag-open"}`}>{statusLabel(status)}</span>;
}

export function PhasePill({ phase }) {
  if (!phase) return null;
  return <span className="tag tag-phase">{phaseLabel(phase)}</span>;
}

/** Trieda tvaru pre stav prezumpcie neviny — nikdy len farba (handoff §2.4). */
const ROLE_SHAPE = {
  suspect: "r-suspect",
  accused: "r-accused",
  indicted: "r-indicted",
  convicted: "r-convicted",
  acquitted: "r-acquitted",
};

/**
 * Rola nikdy nedostane spoločný „trestný" štítok. Každý stav konania má iný
 * tvar: podozrivý prerušovaný rámik, obvinený červený rámik, obžalovaný rámik
 * s podkladom, odsúdený plnú červenú, oslobodený zelený rámik s podkladom.
 * Ostatné roly (svedok, poškodený, …) sú neutrálne.
 *
 * Ukončená rola zostáva viditeľná — len stlmená a s obdobím za sebou.
 *
 * @param {{ role: string, ended?: boolean, period?: string }} props
 */
export function RoleTag({ role, ended = false, period }) {
  const shape = ROLE_SHAPE[role] ?? "r-neutral";
  return (
    <span className={`role-wrap${ended ? " ended" : ""}`}>
      <span className={`role ${shape}`}>{roleLabel(role)}</span>
      {ended && <span className="role-period">{period ? period : "ukončená"}</span>}
    </span>
  );
}

/** Odkaz na zdroj — vydavateľ a rok, otvára originál. */
export function SourceLink({ article, children }) {
  if (!article) return null;
  const year = article.published_at ? new Date(article.published_at).getUTCFullYear() : "";
  return (
    <a className="src" href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer nofollow"
      title={article.title ?? ""}>
      {children ?? `${article.kind === "official" ? "§ " : ""}${article.publisher ?? "zdroj"}${year ? ` · ${year}` : ""}`}
    </a>
  );
}

/**
 * `[n]` — číslovaný odkaz na položku v záložke Zdroje. Číslo prideľuje API
 * (stabilné poradie nad celým zoznamom), klient ho len zobrazí.
 *
 * Odvodený údaj (naše tvrdenie, nie citát) dostane štítok „odvodené" a popis
 * postupu v tooltipe — odvodené nesmie vyzerať rovnako ako prevzaté.
 *
 * @param {{ no: number, href: string, title?: string, derived?: boolean, derivation?: string }} props
 */
export function SourceRef({ no, href, title, derived = false, derivation }) {
  return (
    <>
      <a className="src-ref" href={href} title={title} aria-label={`zdroj ${no}${title ? `: ${title}` : ""}`}>
        [{no}]
      </a>
      {derived && (
        <span className="derived" title={derivation ?? "odvodený údaj"}>odvodené</span>
      )}
    </>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

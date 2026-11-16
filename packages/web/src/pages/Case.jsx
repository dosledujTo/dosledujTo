// Kauza (handoff „Červená niť" kap. 5.2) — tri záložky s vlastnou adresou:
//
//   /kauza/:slug              Prehľad
//   /kauza/:slug/prepojenia   Mapa okolo kauzy
//   /kauza/:slug/zdroje       Zdroje
//
// Opravy oproti pôvodnej stránke:
//   - „Najbližší termín" sa číta z tých istých udalostí ako časová os
//     (očakávané s dátumom ≥ dnes). Očakávaná udalosť, ktorej dátum už
//     prešiel, sa ukáže ako „termín uplynul, výsledok zatiaľ nepoznáme"
//     (rozhodnutie vlastníka 15. 11. 2026) a za najbližší termín sa nepovažuje;
//   - ľudia v kauze: jedna položka na osobu, vývoj rolí pod ňou;
//   - nový blok subjektov s vlastnou rolou v kauze;
//   - pracovné poznámky moderátora sa nevykresľujú (API ich ani nevracia);
//   - kauza bez sumy ukáže dopad alebo druh, nikdy „0 €".

import { Link } from "react-router";
import { api } from "../api.js";
import { Empty, PhasePill, RoleTag, StatusPill } from "../components/chrome.jsx";
import { ConnectionMap } from "../components/ConnectionMap.jsx";
import { SourceNos, SOURCES_PER_PAGE } from "../components/profile.jsx";
import { SourcesTab } from "../components/SourcesTab.jsx";
import {
  caseKindLabel, formatDate, formatLong, impactText, isoDay, money, orgKindLabel, period, phaseLabel, plural, safeUrl,
} from "../format.js";

const TABS = [["", "Prehľad"], ["prepojenia", "Prepojenia"], ["zdroje", "Zdroje"]];

/**
 * @param {"prehlad"|"prepojenia"|"zdroje"} tab
 */
export function loadCaseTab(tab) {
  return async ({ params, query = {}, signal }) => {
    const slug = encodeURIComponent(params.slug);
    const detail = api(`/cases/${slug}`, {}, { signal });
    let view = null;
    if (tab === "prepojenia") view = api(`/cases/${slug}/graph`, { depth: 2 }, { signal });
    if (tab === "zdroje") {
      view = api(`/cases/${slug}/articles`, {
        page: Number(query.strana) > 0 ? Number(query.strana) : 1,
        per_page: SOURCES_PER_PAGE,
        type: query.typ === "urad" ? "official" : query.typ === "media" ? "media" : undefined,
        sort: query.zoradit === "najstarsie" ? "asc" : "desc",
      }, { signal });
    }
    const [doc, data] = await Promise.all([detail, view]);
    // „Dnes" sa počíta raz, pri načítaní dát. Keby si ho server a klient rátali
    // každý sám, okolo polnoci by sa rozišli a hydratácia by zlyhala.
    return { detail: doc, tab, data, query, today: new Date().toISOString().slice(0, 10) };
  };
}

/** Prehľad — aj ako predvolený `load` pre staré importy. */
export const load = loadCaseTab("prehlad");

const TAB_TITLES = { prehlad: "", prepojenia: " · Prepojenia", zdroje: " · Zdroje" };

export const metaCaseTab = (tab) => ({ data }) => ({
  title: `${data.detail.title}${TAB_TITLES[tab] ?? ""} — Dosleduj.to`,
  description: data.detail.summary?.value
    ? String(data.detail.summary.value).slice(0, 180)
    : `Kauza ${data.detail.title} v registri káuz.`,
  canonical: `/kauza/${data.detail.slug}${tab === "prehlad" ? "" : `/${tab}`}`,
});
export const meta = metaCaseTab("prehlad");

/**
 * Najbližší termín a termíny, ktoré uplynuli bez známeho výsledku.
 * @param {any[]} events
 * @param {string} today
 */
export function upcoming(events, today) {
  const expected = events.filter((e) => e.kind === "expected");
  const next = expected
    .filter((e) => isoDay(e.occurred_on) >= today)
    .sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)))[0] ?? null;
  const lapsed = new Set(expected.filter((e) => isoDay(e.occurred_on) < today).map((e) => e.id));
  return { next, lapsed };
}

/**
 * Roly zoskupené podľa osoby alebo subjektu: aktuálna navrchu, ukončené pod ňou.
 * @param {any[]} roles
 * @param {"person_id"|"org_id"} key
 */
export function groupRoles(roles, key) {
  const map = new Map();
  for (const r of roles) if (r[key]) (map.get(r[key]) ?? map.set(r[key], []).get(r[key])).push(r);
  return [...map.entries()].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => (!!a.valid_to - !!b.valid_to) || String(b.valid_from).localeCompare(String(a.valid_from)));
    return { id, current: sorted[0], history: sorted.slice(1) };
  });
}

export default function Case({ data }) {
  const doc = data.detail;
  const tab = data.tab ?? "prehlad";
  const base = `/kauza/${doc.slug}`;
  const nos = (ids) => (ids ?? []).map((id) => doc.source_nos?.[id] ?? null);
  const { next } = upcoming(doc.events ?? [], data.today);
  const kinds = doc.kind?.value ?? [];

  return (
    <main id="obsah" className="wrap">
      <nav className="crumbs"><Link to="/kauzy">Kauzy</Link> / {doc.title}</nav>

      <section className="case-head">
        <div>
          <div className="entry-pills">
            <StatusPill status={doc.status?.value} />
            <PhasePill phase={doc.phase?.value} />
            {kinds.map((k) => <span key={k} className="tag tag-kind">{caseKindLabel(k)}</span>)}
            {(doc.tags ?? []).length > 0 && <span className="tags">{doc.tags.join(" · ")}</span>}
          </div>
          <h1 className="h1-case">{doc.title}</h1>
          {doc.summary?.value && (
            <p className="lead prose">
              {doc.summary.value} <SourceNos base={base} nos={nos(doc.summary.sources)} />
            </p>
          )}
        </div>

        <aside className="rail">
          <span className="label" style={{ display: "block", marginBottom: 14 }}>Najbližší termín</span>
          {next ? (
            <>
              <div className="next-date tnum">{formatDate(next.occurred_on)}</div>
              <div className="next-court">{next.title}</div>
            </>
          ) : (
            <div className="next-court">Nie je známy žiadny ďalší termín.</div>
          )}

          <div className="counters">
            <div>
              <b className="tnum">{doc.sources_total ?? Object.keys(doc.sources ?? {}).length}</b>
              <span>{plural(doc.sources_total ?? 0, "zdroj", "zdroje", "zdrojov")}</span>
            </div>
            <div>
              <b className="tnum">{(doc.persons ?? []).length}</b>
              <span>{plural((doc.persons ?? []).length, "človek", "ľudia", "ľudí")}</span>
            </div>
            <div>
              <b className="tnum">{(doc.orgs ?? []).length}</b>
              <span>{plural((doc.orgs ?? []).length, "subjekt", "subjekty", "subjektov")}</span>
            </div>
          </div>
        </aside>
      </section>

      <nav className="tabs" aria-label="Časti kauzy">
        {TABS.map(([slug, label]) => {
          const current = tab === (slug || "prehlad");
          return (
            <Link key={label} to={slug ? `${base}/${slug}` : base} aria-current={current ? "page" : undefined} className={current ? "on" : undefined}>
              {label}
              {slug === "zdroje" && doc.sources_total ? <small>{doc.sources_total}</small> : null}
            </Link>
          );
        })}
      </nav>

      {tab === "prehlad" && <Overview data={data} base={base} nos={nos} />}
      {tab === "prepojenia" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Prepojenia</h2>
              <p className="hint">
                Vľavo ľudia a subjekty podľa rolí v kauze, vpravo iné kauzy, v ktorých figurujú tí istí ľudia.
                Spoločný človek neznamená, že kauzy spolu súvisia — len že sa v nich stretáva rovnaké meno.
              </p>
            </div>
            <div className="legend">
              <span><i className="sw c" />rola v kauze</span>
              <span><i className="sw e" />ukončená rola</span>
              <span><i className="sw c d" />cez spoločných ľudí</span>
            </div>
          </div>
          <ConnectionMap graph={data.data} centerId={doc.id} base={base} label={`Prepojenia kauzy ${doc.title}`} subtitle="kauza" />
        </section>
      )}
      {tab === "zdroje" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Všetky zdroje</h2>
              <p className="hint">Všetko na stránke kauzy pochádza odtiaľto. Pri rozpore má prednosť úradný dokument.</p>
            </div>
          </div>
          <SourcesTab data={data.data} base={base} query={data.query ?? {}} subject={doc.title} />
        </section>
      )}
    </main>
  );
}

/** Jeden údaj v pruhu „Kľúčové údaje" — hodnota a hneď pri nej jej zdroj. */
function Fact({ label, disputed, value, note, ids, base, nos, tone }) {
  return (
    <div className={`fact${tone ? ` fact-${tone}` : ""}`}>
      <div className="fact-label">
        <span className="label-sm">{label}</span>
        {disputed && <span className="pill pill-gold pill-xs">sporné</span>}
      </div>
      <div className="val tnum">{value}</div>
      {note && <div className="fact-note">{note}</div>}
      <div><SourceNos base={base} nos={nos(ids)} /></div>
    </div>
  );
}

function Overview({ data, base, nos }) {
  const doc = data.detail;
  const today = data.today;
  const events = doc.events ?? [];
  const proceedings = doc.proceedings ?? [];
  const { lapsed } = upcoming(events, today);

  const amount = doc.amount;
  const alternatives = amount?.disputed ?? [];
  const impact = doc.impact?.value;
  const recovered = doc.recovered_amount;
  const kinds = doc.kind?.value ?? [];

  // „Dnes" je vždy na osi: pred prvou budúcou udalosťou, inak na konci.
  const firstFuture = events.findIndex((e) => isoDay(e.occurred_on) > today);
  const dividerAt = firstFuture === -1 ? events.length : firstFuture;
  const lastPastIndex = dividerAt - 1;

  const people = groupRoles(doc.roles ?? [], "person_id");
  const orgs = groupRoles(doc.roles ?? [], "org_id");
  const personOf = new Map((doc.persons ?? []).map((p) => [p.id, p]));
  const orgOf = new Map((doc.orgs ?? []).map((o) => [o.id, o]));

  // Náhľad zdrojov: prvých šesť podľa čísla, úradné dokumenty idú prvé.
  const preview = Object.values(doc.sources ?? {})
    .map((a) => ({ ...a, no: doc.source_nos?.[a.id] ?? null }))
    .sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || (b.kind === "official") - (a.kind === "official"))
    .slice(0, 6);

  return (
    <>
      <section className="section">
        <h2 className="h2-sm" style={{ marginBottom: 24 }}>Kľúčové údaje</h2>
        <div className="facts">
          {amount && typeof amount.value === "number" ? (
            <Fact label="Suma, o ktorú ide" value={money(amount.value)} ids={amount.sources} base={base} nos={nos} disputed={alternatives.length > 0} />
          ) : impact && typeof impact.value === "number" ? (
            <Fact label="Dopad" value={impactText(impact)} note={impact.note} ids={doc.impact.sources} base={base} nos={nos} />
          ) : (
            kinds.length > 0 && <Fact label="Druh kauzy" value={kinds.map(caseKindLabel).join(", ")} ids={doc.kind.sources} base={base} nos={nos} />
          )}
          {/* Rozpor sa nerieši priemerom ani výberom — ukážu sa všetky verzie. */}
          {alternatives.map((alt, i) => (
            <Fact key={i} label="Iný zdroj uvádza" disputed value={money(alt.value)} ids={alt.sources} base={base} nos={nos} />
          ))}
          {recovered && typeof recovered.value === "number" && (
            <Fact label="Vrátené alebo zaistené" value={money(recovered.value)} ids={recovered.sources} base={base} nos={nos} tone="ok" />
          )}
          {doc.phase && <Fact label="Fáza konania" value={phaseLabel(doc.phase.value)} ids={doc.phase.sources} base={base} nos={nos} />}
        </div>
        {alternatives.length > 0 && (
          <p className="note" style={{ marginTop: 14 }}>
            Zdroje sa v sume rozchádzajú. Register nevyberá, ktorá verzia platí — ukazuje všetky, každú so zdrojom.
          </p>
        )}
      </section>

      <section className="section split">
        <div>
          <h2 className="h2-sm">Čo sa dialo a čo sa chystá</h2>
          <p className="note">Minulé aj očakávané udalosti v jednom prúde. Pod čiarou „dnes" je to, čo ešte len príde.</p>
        </div>

        {events.length === 0 ? (
          <Empty>Zatiaľ tu nie je zaznamenaná žiadna udalosť.</Empty>
        ) : (
          <ol className="tl">
            {events.map((event, index) => {
              const future = isoDay(event.occurred_on) > today;
              const overdue = lapsed.has(event.id);
              const dot = future ? "dot dot-next" : index === lastPastIndex ? "dot dot-now" : "dot";
              return (
                <li key={event.id}>
                  {index === dividerAt && <Divider />}
                  <span className={dot} aria-hidden="true" />
                  <div className="when">
                    <span className="tnum">{formatLong(event.occurred_on)}</span>
                    {future && <span className="pill pill-gold pill-xs">očakávané</span>}
                    {overdue && <span className="pill pill-xs">termín uplynul, výsledok zatiaľ nepoznáme</span>}
                  </div>
                  <div className="title">{event.title}</div>
                  {event.description && <p>{event.description}</p>}
                  <SourceNos base={base} nos={nos(event.sources)} />
                </li>
              );
            })}
            {dividerAt === events.length && <li><Divider /></li>}
          </ol>
        )}
      </section>

      <div className="bottom">
        <div>
          <h2 className="h2-sm">Ľudia v kauze</h2>
          <p className="note" style={{ margin: "6px 0 16px" }}>
            Jedna položka na človeka; ukončené roly zostávajú pod aktuálnou. Oslobodenie je rovnako viditeľné ako obvinenie.
          </p>
          {people.length === 0 ? (
            <Empty>Zatiaľ tu nie je nikto so zdrojovanou rolou.</Empty>
          ) : (
            <ul className="who-list">
              {people.map(({ id, current, history }) => {
                const person = personOf.get(id);
                return (
                  <li key={id}>
                    <div className="who-main">
                      {person ? <Link to={`/osoba/${person.slug}`}>{person.name}</Link> : <span>osoba</span>}
                      <span className="who-role">
                        <RoleTag role={current.role} ended={!!current.valid_to} period={period(current.valid_from, current.valid_to)} />
                        <SourceNos base={base} nos={nos(current.sources)} />
                      </span>
                    </div>
                    {history.length > 0 && (
                      <ul className="who-history">
                        {history.map((r) => (
                          <li key={r.id}>
                            <RoleTag role={r.role} ended period={period(r.valid_from, r.valid_to)} /> <SourceNos base={base} nos={nos(r.sources)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {orgs.length > 0 && (
            <>
              <h2 className="h2-sm" style={{ marginTop: 36 }}>Subjekty v kauze</h2>
              <p className="note" style={{ margin: "6px 0 16px" }}>Firmy a inštitúcie, ktoré majú v kauze vlastnú rolu.</p>
              <ul className="who-list">
                {orgs.map(({ id, current, history }) => {
                  const org = orgOf.get(id);
                  return (
                    <li key={id}>
                      <div className="who-main">
                        {org ? <Link to={`/subjekt/${org.slug}`}>{org.name}</Link> : <span>subjekt</span>}
                        <span className="who-role">
                          {org?.kind && <span className="who-kind">{orgKindLabel(org.kind)}</span>}
                          <RoleTag role={current.role} ended={!!current.valid_to} period={period(current.valid_from, current.valid_to)} />
                          <SourceNos base={base} nos={nos(current.sources)} />
                        </span>
                      </div>
                      {history.length > 0 && (
                        <ul className="who-history">
                          {history.map((r) => (
                            <li key={r.id}><RoleTag role={r.role} ended period={period(r.valid_from, r.valid_to)} /></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <aside>
          {proceedings.length > 0 && (
            <>
              <h3 className="h3">Súdne konania</h3>
              <div style={{ marginBottom: 32 }}>
                {proceedings.map((proceeding) => (
                  <div className="proceeding" key={proceeding.id}>
                    <div>{proceeding.court}</div>
                    <div className="file tnum">sp. zn. {proceeding.file_number}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="h3">Zdroje</h3>
          <ol className="srcs-list tnum">
            {preview.map((article) => (
              <li key={article.id}>
                <span className="n">{article.no ? `[${article.no}]` : "·"}</span>
                <span>
                  <a className="t" href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer nofollow">{article.title}</a>
                  <span className="meta">
                    {article.publisher} · {formatDate(article.published_at)}
                    {article.kind === "official" && <span className="pill pill-fill pill-xs">úradný dokument</span>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p style={{ margin: "12px 0 32px" }}>
            <Link to={`${base}/zdroje`}>Všetky zdroje{doc.sources_total ? ` (${doc.sources_total})` : ""} →</Link>
          </p>

          <h3 className="h3">Niečo tu nesedí?</h3>
          <p className="note" style={{ marginBottom: 14 }}>
            Podnet na opravu môže poslať ktokoľvek — musí ale obsahovať odkaz na zdroj.
          </p>
          <Link className="btn-line btn-gold" to={`/podnet?kauza=${doc.slug}`}>Poslať podnet</Link>
        </aside>
      </div>
    </>
  );
}

function Divider() {
  return (
    <div className="divider" style={{ marginBottom: 24 }}>
      <span>dnes</span>
      <hr />
    </div>
  );
}

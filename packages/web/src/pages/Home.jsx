// Titulka (handoff „Červená niť" kap. 5.1) — sekcie v poradí podľa návrhu:
//
//   1. úvod a stav registra, 2. peniaze v kauzách, 3. čo sa chystá,
//   4. naposledy sa pohlo, 5. o čom sa najviac píše, 6. zabudnuté, ale
//   nevyriešené, 7. najväčšie sumy a mená v najviac kauzách.
//
// „Sleduj kauzu" (8.) sa zatiaľ nezobrazuje — web nemá prihlásenie
// (rozhodnutie vlastníka D). Prepínač obdobia rebríčka je odkaz
// `?obdobie=…`, nie klientský stav, takže funguje bez JS.

import { Link } from "react-router";
import { GetForm } from "../components/GetForm.jsx";
import { api } from "../api.js";
import { CaseCard, MoneyBlock, Spark } from "../components/home.jsx";
import { Seg } from "../components/profile.jsx";
import {
  caseKindLabel, impactText, inDays, moneyShort, orgKindLabel, percent, phaseLabel, plural,
} from "../format.js";

const PERIODS = { "30-dni": "30d", "12-mesiacov": "12m", celkovo: "all" };
const MONTHS = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];

export async function load({ query = {}, signal }) {
  const period = PERIODS[query.obdobie] ?? "30d";
  const [stats, upcoming, latest, top, forgotten, biggest] = await Promise.all([
    api("/stats", {}, { signal }),
    api("/events/upcoming", { limit: 4 }, { signal }),
    api("/cases/latest", { limit: 3 }, { signal }),
    api("/cases/top", { period, limit: 5 }, { signal }),
    api("/cases/forgotten", { limit: 3 }, { signal }),
    api("/cases", { sort: "amount", limit: 5 }, { signal }),
  ]);
  return {
    stats, upcoming: upcoming.items, latest: latest.items, top: top.items, period,
    forgotten: forgotten.items, biggest: biggest.items, today: new Date().toISOString().slice(0, 10),
  };
}

export const meta = () => ({
  title: "Dosleduj.to — verejná pamäť káuz",
  description:
    "Register káuz na Slovensku. Čo sa s kauzou stalo ďalej — kto v nej figuruje, s akými firmami a " +
    "stranami je prepojený, koľko peňazí je v hre a čo sa chystá. Pri každom údaji je zdroj.",
  canonical: "/",
});

/** Riadok popisu kauzy v rebríčkoch: druh alebo suma a fáza. */
function caseLine(c) {
  const figure = typeof c.amount === "number" && c.amount > 0 ? moneyShort(c.amount) : impactText(c.impact);
  return [caseKindLabel(c.kinds?.[0]), figure, phaseLabel(c.phase)].filter(Boolean).join(" · ");
}

export default function Home({ data }) {
  const { stats, upcoming, latest, top, forgotten, biggest, today } = data;
  const tryLinks = [
    stats.top_entities?.find((e) => e.type === "person"),
    stats.top_entities?.find((e) => e.type === "org"),
    biggest[0] && { type: "case", slug: biggest[0].slug, name: biggest[0].title },
  ].filter(Boolean);
  const hrefOf = (e) => `/${e.type === "case" ? "kauza" : e.type === "org" ? "subjekt" : "osoba"}/${e.slug}`;
  const maxAmount = Math.max(1, ...biggest.map((c) => c.amount ?? 0));
  const periodKey = Object.entries(PERIODS).find(([, v]) => v === data.period)?.[0] ?? "30-dni";

  return (
    <main id="obsah" className="wrap">
      <section className="hero">
        <div>
          <span className="kicker">Verejná pamäť káuz · Slovensko</span>
          <h1 className="hero-h">Kauzy nezmiznú, keď o&nbsp;nich médiá prestanú písať.</h1>
          <p className="lead">
            Jedna stránka na kauzu, vždy aktuálna. Kto v nej figuruje, s akými firmami a stranami je prepojený,
            koľko peňazí je v hre a čo sa chystá. Pri každom údaji je konkrétny zdroj.
          </p>
          <GetForm className="big-search" role="search" action="/hladat">
            <label htmlFor="q-hero" className="sr-only">Hľadať</label>
            <input id="q-hero" type="search" name="q" placeholder="Meno, firma, kauza alebo spisová značka" />
            <button type="submit">Hľadať</button>
          </GetForm>
          {tryLinks.length > 0 && (
            <p className="try">
              Skús:{" "}
              {tryLinks.map((e, i) => (
                <span key={e.slug}>{i > 0 && " · "}<Link to={hrefOf(e)}>{e.name}</Link></span>
              ))}
            </p>
          )}
        </div>
        <aside className="reg" aria-label="Stav registra">
          <span className="kicker">Stav registra</span>
          <div className="reg-grid tnum">
            <div><b>{stats.cases}</b><span>{plural(stats.cases, "sledovaná kauza", "sledované kauzy", "sledovaných káuz")}</span></div>
            <div><b>{stats.persons}</b><span>ľudí</span></div>
            <div><b>{stats.orgs}</b><span>firiem a strán</span></div>
            <div><b>{new Intl.NumberFormat("sk-SK").format(stats.sources)}</b><span>zdrojov</span></div>
            <div className="wide">
              <b className="money">{moneyShort(stats.amount)}</b>
              <span>suma, o ktorú ide · <strong className="tnum">{moneyShort(stats.amount_closed)}</strong> v uzavretých kauzách</span>
            </div>
          </div>
          {typeof stats.official_share === "number" && (
            <div className="quality">
              <div className="q-bar" aria-hidden="true"><i style={{ width: `${(stats.official_share * 100).toFixed(1)}%` }} /></div>
              <span><b className="tnum">{percent(stats.official_share, 1)}</b> zdrojov sú úradné dokumenty, nielen články</span>
            </div>
          )}
        </aside>
      </section>

      {stats.money && <MoneyBlock stats={stats} />}

      {upcoming.length > 0 && (
        <section className="block" aria-labelledby="chysta">
          <div className="block-head"><h2 id="chysta">Čo sa chystá</h2><Link className="more" to="/kalendar">Celý kalendár →</Link></div>
          <ol className="upcoming">
            {upcoming.map((e) => {
              const d = new Date(e.occurred_on);
              return (
                <li key={e.id}>
                  <span className="date tnum"><b>{d.getUTCDate()}.</b> {MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}</span>
                  <span className="ev-dia" aria-hidden="true" />
                  <div>
                    <Link to={`/kauza/${e.case.slug}`}>{e.title}</Link>
                    <span>{e.case.title}{e.court ? ` · ${e.court}` : ""}</span>
                  </div>
                  <span className="in">{inDays(e.occurred_on, today)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {latest.length > 0 && (
        <section className="block" aria-labelledby="pohlo">
          <div className="block-head"><h2 id="pohlo">Naposledy sa pohlo</h2><Link className="more" to="/kauzy">Všetky kauzy →</Link></div>
          <div className="cards">{latest.map((c) => <CaseCard key={c.id} c={c} today={today} />)}</div>
        </section>
      )}

      <section className="block" id="najviac-sa-pise" aria-labelledby="pise">
        <div className="block-head">
          <h2 id="pise">O čom sa najviac píše</h2>
          <Seg
            label="Obdobie"
            options={[
              { label: "30 dní", href: "/?obdobie=30-dni#najviac-sa-pise", current: periodKey === "30-dni" },
              { label: "12 mesiacov", href: "/?obdobie=12-mesiacov#najviac-sa-pise", current: periodKey === "12-mesiacov" },
              { label: "Celkovo", href: "/?obdobie=celkovo#najviac-sa-pise", current: periodKey === "celkovo" },
            ]}
          />
        </div>
        <p className="hint-lg">
          Poradie podľa počtu článkov a úradných dokumentov za obdobie. Počíta sa aj počet rôznych médií, aby kauzu
          nevytiahlo jedno médium, ktoré o nej píše každý deň. Krivka ukazuje 24 mesiacov.
        </p>
        {top.length === 0 ? (
          <p className="empty">Za toto obdobie o kauzách v registri nevyšiel žiadny článok.</p>
        ) : (
          <ol className="toplist">
            {top.map((c, i) => (
              <li key={c.id}>
                <span className="rk tnum">{i + 1}</span>
                <div className="tt"><Link to={`/kauza/${c.slug}`}>{c.title}</Link><span>{caseLine(c)}</span></div>
                <Spark values={c.spark} />
                <span className="tc tnum">
                  <b>{c.articles} {plural(c.articles, "článok", "články", "článkov")}</b>
                  <span>
                    {c.publishers} {plural(c.publishers, "médium", "médiá", "médií")}
                    {typeof c.trend === "number" && ` · ${c.trend >= 0 ? "▲ +" : "▼ "}${c.trend} %`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {forgotten.length > 0 && (
        <section className="block forgot" aria-labelledby="zabudnute">
          <div className="block-head"><h2 id="zabudnute">Zabudnuté, ale nevyriešené</h2></div>
          <p className="hint-lg">
            Kauzy, o ktorých sa kedysi veľa písalo, médiá o nich mlčia viac ako rok a úradne stále nie sú uzavreté.
            Presne kvôli nim register existuje.
          </p>
          <ul className="fg-list">
            {forgotten.map((c) => {
              const [from, to] = [c.first_article.slice(0, 4), c.last_article.slice(0, 4)];
              return (
                <li key={c.id}>
                  <div className="tt"><Link to={`/kauza/${c.slug}`}>{c.title}</Link><span>{caseLine(c)}</span></div>
                  <Spark values={c.spark} width={140} height={30} />
                  <div className="fg">
                    <b>Posledný článok pred {c.months_silent} {plural(c.months_silent, "mesiacom", "mesiacmi", "mesiacmi")}</b>
                    <span>
                      {c.total_articles} {plural(c.total_articles, "článok", "články", "článkov")}{" "}
                      {from === to ? `v roku ${from}` : `v rokoch ${from}–${to}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="block two">
        <div>
          <div className="block-head"><h2>Najväčšie sumy</h2></div>
          <ul className="bars tnum">
            {biggest.filter((c) => typeof c.amount === "number").map((c) => (
              <li key={c.id}>
                <Link to={`/kauza/${c.slug}`}>{c.title.replace(/^Kauza /, "")}</Link>
                <span className="b" aria-hidden="true"><i style={{ width: `${((c.amount / maxAmount) * 100).toFixed(1)}%` }} /></span>
                <b>{moneyShort(c.amount)}</b>
              </li>
            ))}
          </ul>
          <p className="fine">Suma podľa najvyššieho zdrojovaného údaja. Pri spornej sume sú na stránke kauzy uvedené všetky verzie.</p>
        </div>
        <div>
          <div className="block-head"><h2>Mená v najviac kauzách</h2></div>
          <ol className="names">
            {(stats.top_entities ?? []).map((e) => (
              <li key={e.id}>
                <span className={e.type === "person" ? "tp big" : "to big"} aria-hidden="true" />
                <div><Link to={hrefOf(e)}>{e.name}</Link><span>{e.type === "org" ? orgKindLabel(e.kind) : "osoba"}</span></div>
                <b className="tnum">{e.cases} {plural(e.cases, "kauza", "kauzy", "káuz")}</b>
              </li>
            ))}
          </ol>
          <p className="fine">Výskyt v kauze nie je vina. Rola sa zobrazuje pri každom mene na stránke osoby.</p>
        </div>
      </section>
    </main>
  );
}

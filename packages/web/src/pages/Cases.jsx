// Zoznam káuz (handoff „Červená niť" kap. 4, 5.4). Všetky filtre sú v URL,
// takže funguje bez JS a dá sa poslať odkaz.
//
//   ?q=&status=&phase=&druh=<kód>&sort=updated|amount|started|najviac-pise&zabudnute=1
//
// „Najviac sa píše" a „len zabudnuté" sú rebríčky z titulky (`/api/cases/top`,
// `/forgotten`) a ostatné filtre sa na ne neuplatnia — stránka to povie.
// Pri triedení podľa sumy idú kauzy bez sumy na koniec pod oddeľovač „Kauzy bez
// sumy", nie medzi nuly.

import { Fragment } from "react";
import { GetForm } from "../components/GetForm.jsx";
import { Link, useSearchParams } from "react-router";
import { api } from "../api.js";
import { Empty, PhasePill, StatusPill } from "../components/chrome.jsx";
import {
  CASE_KIND_LABELS, PHASE_LABELS, caseKindLabel, money, monthYear, plural,
} from "../format.js";

const PHASES = Object.entries(PHASE_LABELS);
const KINDS = Object.entries(CASE_KIND_LABELS);

/** Riadok z rebríčka titulky v tvare položky zoznamu. */
const fromCard = (c, extra) => ({
  id: c.id, slug: c.slug, title: c.title, summary: c.summary, status: c.status, phase: c.phase,
  amount: c.amount, kind_main: c.kinds?.[0] ?? null,
  impact_value: c.impact?.value ?? null, impact_unit: c.impact?.unit ?? null, extra,
});

export async function load({ query = {}, signal }) {
  if (query.zabudnute === "1") {
    const res = await api("/cases/forgotten", { limit: 50 }, { signal });
    const items = res.items.map((c) => fromCard(c, `posledný článok pred ${c.months_silent} mesiacmi · ${c.total_articles} článkov`));
    return { result: { items, total: items.length }, query, mode: "forgotten" };
  }
  if (query.sort === "najviac-pise") {
    const res = await api("/cases/top", { period: "12m", limit: 50 }, { signal });
    const items = res.items.map((c) => fromCard(c, `${c.articles} článkov · ${c.publishers} médií za 12 mesiacov`));
    return { result: { items, total: items.length }, query, mode: "top" };
  }
  const result = await api("/cases", {
    q: query.q, status: query.status, phase: query.phase, case_kind: query.druh, sort: query.sort,
    cursor: query.cursor, limit: 20,
  }, { signal });
  return { result, query, mode: "list" };
}

export const meta = ({ data }) => ({
  title: `${data.mode === "forgotten" ? "Zabudnuté kauzy" : "Kauzy"} — Dosleduj.to`,
  description: "Zoznam evidovaných káuz — podľa stavu, fázy konania, druhu a objemu peňazí.",
  canonical: "/kauzy",
});

const hasAmount = (item) => typeof item.amount === "number" && item.amount > 0;

export default function Cases({ data }) {
  const [params] = useSearchParams();
  const { result } = data;
  const mode = data.mode ?? "list";
  const total = result.total ?? result.items.length;
  const byAmount = (params.get("sort") ?? "") === "amount" && mode === "list";
  const firstWithout = byAmount ? result.items.findIndex((item) => !hasAmount(item)) : -1;

  return (
    <main id="obsah" className="wrap">
      <section style={{ padding: "40px 0 8px" }}>
        <div className="kicker">Register</div>
        <h1 className="h1" style={{ fontSize: 48, margin: "16px 0 0" }}>
          {mode === "forgotten" ? "Zabudnuté, ale nevyriešené" : "Kauzy"}
        </h1>
      </section>

      <GetForm className="filters" action="/kauzy">
        <div>
          <label htmlFor="f-q">Hľadať</label>
          <input id="f-q" type="search" name="q" defaultValue={params.get("q") ?? ""} placeholder="názov, meno…" />
        </div>
        <div>
          <label htmlFor="f-status">Stav</label>
          <select id="f-status" name="status" defaultValue={params.get("status") ?? ""}>
            <option value="">všetky</option>
            <option value="open">otvorené</option>
            <option value="closed">uzavreté</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-phase">Fáza</label>
          <select id="f-phase" name="phase" defaultValue={params.get("phase") ?? ""}>
            <option value="">všetky</option>
            {PHASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-kind">Druh</label>
          <select id="f-kind" name="druh" defaultValue={params.get("druh") ?? ""}>
            <option value="">všetky</option>
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-sort">Zoradiť</label>
          <select id="f-sort" name="sort" defaultValue={params.get("sort") ?? "updated"}>
            <option value="updated">podľa zmeny</option>
            <option value="amount">podľa sumy</option>
            <option value="started">podľa začiatku</option>
            <option value="najviac-pise">najviac sa píše</option>
          </select>
        </div>
        <label className="f-check">
          <input type="checkbox" name="zabudnute" value="1" defaultChecked={params.get("zabudnute") === "1"} /> len zabudnuté
        </label>
        <button type="submit" className="btn-line btn-gold" style={{ padding: "8px 18px", fontSize: 13 }}>
          Filtrovať
        </button>
        <span className="count tnum" style={{ marginLeft: "auto" }}>
          {total} {plural(total, "kauza", "kauzy", "káuz")}
        </span>
      </GetForm>

      {mode !== "list" && (
        <p className="note" style={{ margin: "0 0 16px" }}>
          {mode === "forgotten"
            ? "Otvorené kauzy s mnohými článkami, o ktorých viac ako rok nič nevyšlo. Ostatné filtre sa tu neuplatňujú."
            : "Poradie podľa počtu článkov a rôznych médií za 12 mesiacov. Ostatné filtre sa tu neuplatňujú."}{" "}
          <Link to="/ako-pocitame">Ako počítame →</Link>
        </p>
      )}

      {result.items.length === 0 ? (
        <Empty>Na tieto filtre nesedí žiadna kauza. Skúste ich uvoľniť.</Empty>
      ) : (
        <ul className="entries">
          {result.items.map((item, index) => (
            <Fragment key={item.id}>
              {index === firstWithout && (index > 0 || params.get("cursor")) && (
                <li className="entries-sep"><span>Kauzy bez sumy</span></li>
              )}
              <li>
                <div>
                  <div className="entry-pills">
                    <StatusPill status={item.status} />
                    <PhasePill phase={item.phase} />
                    {item.kind_main && <span className="tag tag-kind">{caseKindLabel(item.kind_main)}</span>}
                    {item.tag && <span className="tags">{[].concat(item.tag).join(" · ")}</span>}
                  </div>
                  <h3 className="entry-title"><Link to={`/kauza/${item.slug}`}>{item.title}</Link></h3>
                  {item.summary && <p className="entry-summary prose">{item.summary}</p>}
                </div>
                <div className="entry-rail">
                  {hasAmount(item) ? (
                    <>
                      <b className="tnum">{money(item.amount)}</b>
                      <div className="cap">suma, o ktorú ide</div>
                    </>
                  ) : typeof item.impact_value === "number" ? (
                    <>
                      <b className="tnum">{new Intl.NumberFormat("sk-SK").format(item.impact_value)}</b>
                      <div className="cap">{item.impact_unit}</div>
                    </>
                  ) : null}
                  <div className="srcs tnum">
                    {item.extra ?? (
                      <>
                        {item.sources_count ?? 0} {plural(item.sources_count ?? 0, "zdroj", "zdroje", "zdrojov")}
                        {item.updated_at && ` · naposledy ${monthYear(item.updated_at)}`}
                      </>
                    )}
                  </div>
                </div>
              </li>
            </Fragment>
          ))}
        </ul>
      )}

      {result.next_cursor && (
        <div className="pager">
          <Link className="btn-line" to={`/kauzy?${new URLSearchParams({
            ...Object.fromEntries(params), cursor: result.next_cursor,
          })}`}>Ďalšie →</Link>
        </div>
      )}
    </main>
  );
}

// Čo sa chystá — kalendár (handoff „Červená niť" kap. 5.6): všetky budúce
// udalosti zoskupené podľa mesiaca, filter podľa súdu a kauzy, stránkovanie.
// Filtre sú formulár GET a odkazy, takže funguje bez JS.

import { Link } from "react-router";
import { GetForm } from "../components/GetForm.jsx";
import { api } from "../api.js";
import { Empty } from "../components/chrome.jsx";
import { Pager, qs } from "../components/profile.jsx";
import { eventLabel, formatLong, inDays, plural } from "../format.js";

const MONTHS = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

export async function load({ query = {}, signal }) {
  const data = await api("/events/calendar", {
    court: query.sud, case: query.kauza, page: Number(query.strana) > 0 ? Number(query.strana) : 1, per_page: 30,
  }, { signal });
  return { data, query, today: new Date().toISOString().slice(0, 10) };
}

export const meta = () => ({
  title: "Čo sa chystá — Dosleduj.to",
  description: "Kalendár pojednávaní a ďalších očakávaných udalostí v kauzách — podľa súdu aj kauzy.",
  canonical: "/kalendar",
});

export default function Calendar({ data: page }) {
  const { data, query, today } = page;
  const groups = [];
  for (const e of data.items) {
    const key = e.occurred_on.slice(0, 7);
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(e);
  }
  const href = (n) => `/kalendar${qs({ sud: query.sud, kauza: query.kauza, strana: n > 1 ? n : undefined })}`;

  return (
    <main id="obsah" className="wrap">
      <section style={{ padding: "40px 0 8px" }}>
        <div className="kicker">Kalendár</div>
        <h1 className="h1" style={{ fontSize: 48, margin: "16px 0 0" }}>Čo sa chystá</h1>
        <p className="hint-lg" style={{ marginTop: 14 }}>
          Pojednávania, lehoty a ďalšie očakávané udalosti v kauzách. Termín určuje súd alebo úrad a môže sa
          zmeniť — pri každom je zdroj na stránke kauzy.
        </p>
      </section>

      <GetForm className="filters" action="/kalendar">
        <div>
          <label htmlFor="c-court">Súd</label>
          <select id="c-court" name="sud" defaultValue={query.sud ?? ""}>
            <option value="">všetky</option>
            {data.facets.courts.map((c) => <option key={c.court} value={c.court}>{c.court} ({c.count})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="c-case">Kauza</label>
          <select id="c-case" name="kauza" defaultValue={query.kauza ?? ""}>
            <option value="">všetky</option>
            {data.facets.cases.map((c) => <option key={c.slug} value={c.slug}>{c.title} ({c.count})</option>)}
          </select>
        </div>
        <button type="submit" className="btn-line btn-gold" style={{ padding: "8px 18px", fontSize: 13 }}>Filtrovať</button>
        <span className="count tnum" style={{ marginLeft: "auto" }}>
          {data.total} {plural(data.total, "udalosť", "udalosti", "udalostí")}
        </span>
      </GetForm>

      {data.items.length === 0 ? (
        <Empty>Na tieto filtre nie je naplánovaná žiadna udalosť.</Empty>
      ) : (
        groups.map((g) => {
          const [y, m] = g.key.split("-");
          return (
            <section key={g.key} className="cal-month" aria-labelledby={`m-${g.key}`}>
              <h2 id={`m-${g.key}`} className="h2-sm">{MONTHS[Number(m) - 1]} {y}</h2>
              <ol className="upcoming">
                {g.items.map((e) => {
                  const d = new Date(e.occurred_on);
                  return (
                    <li key={e.id}>
                      <span className="date tnum"><b>{d.getUTCDate()}.</b> <time dateTime={e.occurred_on.slice(0, 10)}>{formatLong(e.occurred_on).replace(/^\d+\.\s*/, "")}</time></span>
                      <span className="ev-dia" aria-hidden="true" />
                      <div>
                        <Link to={`/kauza/${e.case.slug}`}>{e.title ?? eventLabel(e.category)}</Link>
                        <span>{e.case.title}{e.court ? ` · ${e.court}` : ""}</span>
                      </div>
                      <span className="in">{inDays(e.occurred_on, today)}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })
      )}

      <div className="pager" style={{ justifyContent: "flex-end" }}>
        <Pager page={data.page} pages={data.pages} href={href} label="Stránkovanie kalendára" />
      </div>
    </main>
  );
}

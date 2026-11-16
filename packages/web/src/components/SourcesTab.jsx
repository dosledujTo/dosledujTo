// Záložka Zdroje (handoff „Červená niť" kap. 3.4).
//
// Číslo `no` prichádza z API a je stabilné nad celým zoznamom — filter ani
// opačné triedenie ho nezmenia, takže `[4]` v Mape je tento riadok. Filtre sú
// odkazy a formulár GET, takže všetko funguje aj bez JS.

import { Link } from "react-router";
import { GetForm } from "./GetForm.jsx";
import { Pager, Seg, qs } from "./profile.jsx";
import {
  formatDate, linkLabel, period, roleLabel, safeUrl, eventLabel,
} from "../format.js";

/** Slovenský popis poľa entity, ktoré zdroj podopiera. */
const FIELD_LABELS = {
  short_bio: "popis osoby", summary: "popis kauzy", status: "stav kauzy", phase: "fáza konania",
  amount: "suma", kind: "druh kauzy", impact: "dopad", recovered_amount: "vrátené alebo zaistené",
  related_case_ids: "súvisiace kauzy",
};

/** Čip „konateľ TestBuild 3/2019–1/2024" z položky `supports`. */
export function supportText(s) {
  const when = period(s.valid_from, s.valid_to);
  switch (s.type) {
    case "role":
      return [roleLabel(s.role), s.case?.name ?? s.entity?.name, when].filter(Boolean).join(" · ");
    case "link":
      return [linkLabel(s.kind), s.other?.name, when].filter(Boolean).join(" · ") + (s.derived ? " (odvodené)" : "");
    case "event":
      return [s.title ?? eventLabel(s.kind), formatDate(s.occurred_on)].filter(Boolean).join(" · ");
    case "proceeding":
      return ["konanie", s.court, s.file_number].filter(Boolean).join(" · ");
    case "field":
      return (FIELD_LABELS[s.field] ?? s.field) + (s.disputed ? " (sporná verzia)" : "");
    default:
      return "";
  }
}

/**
 * @param {{ data: any, base: string, query: Record<string, string>, subject: string }} props
 *   `data` — odpoveď `/articles` (items, total, page, pages, facets)
 */
export function SourcesTab({ data, base, query, subject }) {
  const type = query.typ === "urad" ? "official" : query.typ === "media" ? "media" : "";
  const sort = query.zoradit === "najstarsie" ? "asc" : "desc";
  const params = { typ: query.typ, kauza: query.kauza, zoradit: query.zoradit };
  const href = (overrides) => `${base}/zdroje${qs({ ...params, ...overrides })}`;
  const f = data.facets ?? { all: 0, official: 0, media: 0, cases: [] };

  return (
    <>
      <div className="src-tools">
        <Seg
          label="Typ zdroja"
          options={[
            { label: `Všetky (${f.all})`, href: href({ typ: undefined, strana: undefined }), current: !type },
            { label: `Úradné dokumenty (${f.official})`, href: href({ typ: "urad", strana: undefined }), current: type === "official" },
            { label: `Médiá (${f.media})`, href: href({ typ: "media", strana: undefined }), current: type === "media" },
          ]}
        />
        <GetForm action={`${base}/zdroje`} className="src-form">
          {query.typ && <input type="hidden" name="typ" value={query.typ} />}
          <label className="sel">
            Zoradiť
            <select name="zoradit" defaultValue={sort === "asc" ? "najstarsie" : "najnovsie"}>
              <option value="najnovsie">od najnovších</option>
              <option value="najstarsie">od najstarších</option>
            </select>
          </label>
          {f.cases.length > 0 && (
            <label className="sel">
              Kauza
              <select name="kauza" defaultValue={query.kauza ?? ""}>
                <option value="">všetky</option>
                {f.cases.map((c) => <option key={c.id} value={c.slug}>{c.name} ({c.count})</option>)}
              </select>
            </label>
          )}
          <button type="submit" className="btn-sm">Použiť</button>
        </GetForm>
      </div>

      {data.items.length === 0 ? (
        <p className="empty">Pre tento filter tu nie je žiadny zdroj.</p>
      ) : (
        <ol className="src-list">
          {data.items.map((a) => (
            <li key={a.id} id={`zdroj-${a.no}`}>
              <span className="no tnum">[{a.no}]</span>
              <div>
                <a className="t" href={safeUrl(a.url)} target="_blank" rel="noopener noreferrer nofollow">{a.title}</a>
                <div className="m">
                  <span>{a.publisher}</span>
                  {a.kind === "official" && <span className="off">úradný dokument</span>}
                  {a.archive_url && (
                    <a className="arch" href={safeUrl(a.archive_url)} target="_blank" rel="noopener noreferrer nofollow">archív</a>
                  )}
                  {a.paywall && <span className="arch">za platenou bránou</span>}
                </div>
                {a.supports.length > 0 && (
                  <div className="uses">
                    {a.supports.map((s, i) => {
                      const target = s.case ?? s.other ?? s.entity;
                      const text = supportText(s);
                      const to = target?.slug
                        ? `/${target.type === "case" ? "kauza" : target.type === "org" ? "subjekt" : "osoba"}/${target.slug}`
                        : null;
                      return to ? <Link key={i} className="use" to={to}>{text}</Link> : <span key={i} className="use">{text}</span>;
                    })}
                  </div>
                )}
              </div>
              <span className="d tnum">{formatDate(a.published_at)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="pager">
        <span className="tnum">
          {data.total === 0 ? "" : `${(data.page - 1) * data.per_page + 1}–${Math.min(data.page * data.per_page, data.total)} z ${data.total}`}
          {" "}· zdroje k {subject}
        </span>
        <Pager page={data.page} pages={data.pages} href={(n) => href({ strana: n > 1 ? n : undefined })} label="Stránkovanie zdrojov" />
      </div>
    </>
  );
}

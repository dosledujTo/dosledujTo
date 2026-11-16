// Časti titulky (handoff „Červená niť" kap. 2.4, 5.1, 6): krivka `Spark`, niť
// na karte kauzy, karta kauzy a blok „Peniaze v kauzách".

import { Link } from "react-router";
import { PhasePill } from "./chrome.jsx";
import {
  BUCKET_LABELS, ago, caseKindLabel, eventLabel, impactText, moneyShort, percent, plural,
} from "../format.js";

/**
 * Krivka článkov za 24 mesiacov — výplň plochy a zvýraznený posledný bod.
 * Čísla sú vedľa, preto je krivka pre čítačky skrytá.
 *
 * @param {{ values: number[], width?: number, height?: number }} props
 */
export function Spark({ values, width = 180, height = 36 }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [Number((i * step).toFixed(1)), Number((height - 2 - (v / max) * (height - 6)).toFixed(1))]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const last = pts.at(-1) ?? [0, height];
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false">
      <polygon className="sa" points={`0,${height} ${line} ${width},${height}`} />
      <polyline className="sl" points={line} />
      <circle className="sd" cx={last[0]} cy={last[1]} r="3" />
    </svg>
  );
}

/**
 * Niť na karte kauzy: bodky = ľudia, štvorčeky = subjekty, max 8 tvarov, potom „+n".
 * @param {{ persons: number, orgs: number }} props
 */
export function Thread({ persons, orgs }) {
  const shapes = [...Array(persons).fill("p"), ...Array(orgs).fill("o")];
  const shown = shapes.slice(0, 8);
  const rest = shapes.length - shown.length;
  if (shapes.length === 0) return null;
  const label = [
    persons ? `${persons} ${plural(persons, "človek", "ľudia", "ľudí")}` : null,
    orgs ? `${orgs} ${plural(orgs, "subjekt", "subjekty", "subjektov")}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="thread" aria-label={`V kauze: ${label}`}>
      {shown.map((s, i) => <span key={i} className={s === "p" ? "tp" : "to"} aria-hidden="true" />)}
      {rest > 0 && <span className="t-more" aria-hidden="true">+{rest}</span>}
      <i>{label}</i>
    </div>
  );
}

/**
 * Suma alebo dopad — nikdy „0 €". Kauza bez oboch ukáže len druh.
 * @param {{ c: any }} props
 */
export function Figure({ c }) {
  if (typeof c.amount === "number" && c.amount > 0) {
    return (
      <div className="case-foot">
        <b className="tnum">{moneyShort(c.amount)}</b>
        {c.disputed && <span className="sporne">sporné</span>}
        {c.status === "closed" && <span className="closed-tag">uzavretá</span>}
      </div>
    );
  }
  if (c.impact && typeof c.impact.value === "number") {
    return (
      <div className="case-foot impact">
        <b className="tnum">{new Intl.NumberFormat("sk-SK").format(c.impact.value)}</b>
        <span className="imp-l">{c.impact.unit}{c.impact.note && <><br /><small>{c.impact.note}</small></>}</span>
      </div>
    );
  }
  return (
    <div className="case-foot">
      <span className="kind-tag">{caseKindLabel(c.kinds?.[0])}</span>
    </div>
  );
}

/**
 * Karta kauzy v „Naposledy sa pohlo". Nefinančná má hornú linku v akcente.
 * @param {{ c: any, today: string }} props
 */
export function CaseCard({ c, today }) {
  const nonfin = !(typeof c.amount === "number" && c.amount > 0);
  const change = c.latest_change;
  const summary = c.summary && c.summary.length > 170 ? `${c.summary.slice(0, 168).trimEnd()}…` : c.summary;
  return (
    <article className={`ccard${nonfin ? " nonfin" : ""}`}>
      <div className="pills">
        <PhasePill phase={c.phase} />
        {c.kinds?.[0] && <span className="kind-tag">{caseKindLabel(c.kinds[0])}</span>}
      </div>
      <h3><Link to={`/kauza/${c.slug}`}>{c.title}</Link></h3>
      {summary && <p>{summary}</p>}
      <Thread persons={c.persons ?? 0} orgs={c.orgs ?? 0} />
      <Figure c={c} />
      {change && (
        <div className="change">
          <span className="pulse" aria-hidden="true" />
          {ago(change.at, today)} ·{" "}
          {change.type === "article" ? `nový článok${change.publisher ? ` (${change.publisher})` : ""}` : `${eventLabel(change.category)}: ${change.title}`}
        </div>
      )}
      {c.correction && (
        <div className="change correction">
          <span className="fix-tag">oprava</span> {ago(c.correction.at, today)} · zmenené údaje kauzy
        </div>
      )}
    </article>
  );
}

const OPEN = ["none", "investigation", "charge", "trial"];
const CLOSED = ["convicted", "acquitted", "discontinued", "lapsed"];

/**
 * Peniaze v kauzách (kap. 6.1): štyri čísla, pruh z ôsmich segmentov, dva
 * stĺpce riadkov a nefinančné kauzy zvlášť.
 *
 * @param {{ stats: any }} props
 */
export function MoneyBlock({ stats }) {
  const buckets = new Map(stats.money.buckets.map((b) => [b.bucket, b]));
  const total = stats.amount || 0;
  const open = stats.money.amount_open ?? total - stats.amount_closed;
  const closed = stats.amount_closed;
  const nonMoney = stats.non_money ?? [];
  const nonMoneyCount = nonMoney.reduce((s, k) => s + k.cases, 0);
  const maxIn = (list) => Math.max(1, ...list.map((b) => buckets.get(b)?.amount ?? 0));
  const caseWord = (n) => `${n} ${plural(n, "kauza", "kauzy", "káuz")}`;

  const rows = (list) => {
    const max = maxIn(list);
    return (
      <ul className="mrows">
        {list.map((key) => {
          const b = buckets.get(key) ?? { amount: 0, cases: 0 };
          const [label, hint] = BUCKET_LABELS[key];
          return (
            <li key={key}>
              <span className={`mk b-${key}`} aria-hidden="true" />
              <div><b>{label}</b><span>{hint}</span></div>
              <span className="mbar" aria-hidden="true"><i className={`b-${key}`} style={{ width: `${((b.amount / max) * 100).toFixed(1)}%` }} /></span>
              <span className="mv tnum"><b>{moneyShort(b.amount) || "0 €"}</b><span>{percent(b.amount, total)} · {caseWord(b.cases)}</span></span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section className="block money-block" aria-labelledby="peniaze">
      <div className="block-head">
        <h2 id="peniaze">Peniaze v kauzách</h2>
        <Link className="more" to="/ako-pocitame">Ako počítame →</Link>
      </div>
      <p className="hint-lg">
        Suma, o ktorú v kauzách ide podľa zdrojov. Nie je to preukázaná škoda. Rozdelené podľa toho, kam sa
        kauza úradne dostala a ako sa skončila.
      </p>
      <div className="mtotal tnum">
        <div><span className="kicker">Spolu</span><b>{moneyShort(total)}</b><span>{stats.cases_with_amount} {plural(stats.cases_with_amount, "kauza", "kauzy", "káuz")} so sumou</span></div>
        <div><span className="kicker">V riešení</span><b>{moneyShort(open)}</b><span>{percent(open, total)} · {caseWord(stats.money.cases_open ?? 0)}</span></div>
        <div><span className="kicker">Uzavreté</span><b>{moneyShort(closed)}</b><span>{percent(closed, total)} · {caseWord(stats.money.cases_closed ?? 0)}</span></div>
        <div className="ret"><span className="kicker">Vrátené alebo zaistené</span><b>{moneyShort(stats.recovered) || "0 €"}</b><span>{percent(stats.recovered, total)} zo sumy vo všetkých kauzách</span></div>
      </div>

      <div className="mstack" role="img" aria-label={`Rozdelenie sumy podľa stavu konania: ${[...OPEN, ...CLOSED].map((k) => `${BUCKET_LABELS[k][0]} ${moneyShort(buckets.get(k)?.amount ?? 0) || "0 €"}`).join(", ")}`}>
        {[...OPEN, ...CLOSED].map((k) => {
          const b = buckets.get(k);
          if (!b?.amount) return null;
          return <span key={k} className={`mseg b-${k}`} style={{ width: `${((b.amount / total) * 100).toFixed(3)}%` }} title={`${BUCKET_LABELS[k][0]}: ${moneyShort(b.amount)}`} />;
        })}
      </div>
      <div className="mscale tnum" aria-hidden="true">
        <span className="ms-0">0</span>
        <span className="ms-total">{moneyShort(total)}</span>
        {/* Hranica má zmysel, len keď sú peniaze na oboch stranách. Popisok je
            v druhom riadku a pri hranici vpravo od stredu ide doľava od značky —
            inak by pri 93 % otvorených vyšiel z bloku a prekryl sumu. */}
        {open > 0 && closed > 0 && (() => {
          const at = (open / total) * 100;
          return at > 50
            ? <span className="ms-bound ms-left" style={{ left: `${at.toFixed(2)}%` }}>hranica otvorené / uzavreté ▲</span>
            : <span className="ms-bound" style={{ left: `${at.toFixed(2)}%` }}>▲ hranica otvorené / uzavreté</span>;
        })()}
      </div>

      <div className="mcols">
        <div><h3>V riešení <small className="tnum">{moneyShort(open)}</small></h3>{rows(OPEN)}</div>
        <div><h3>Uzavreté <small className="tnum">{moneyShort(closed)}</small></h3>{rows(CLOSED)}</div>
      </div>

      {nonMoneyCount > 0 && (
        <div className="nofin">
          <span className="kicker">{nonMoneyCount} {plural(nonMoneyCount, "kauza nie je", "kauzy nie sú", "káuz nie je")} o peniazoch</span>
          <span className="chips">
            {nonMoney.map((k) => (
              <Link key={k.kind} to={`/kauzy?druh=${k.kind}`}>{caseKindLabel(k.kind)} · {k.cases}</Link>
            ))}
          </span>
          <span className="fine" style={{ margin: 0 }}>
            Tieto kauzy nemajú sumu, ale svoj dopad, napríklad počet odvolaných ľudí alebo zrušených obvinení.
            Do grafu peňazí sa nezapočítavajú.
          </span>
        </div>
      )}
      <p className="fine">
        Kauza sa počíta podľa najďalšej fázy, ktorú dosiahla. Ak má viac obvinených s rôznym koncom, rozhoduje
        najzávažnejší uzavretý výsledok. Pri spornej sume sa počíta najvyšší zdrojovaný údaj.
        {stats.money.derived?.length > 0 && ` Takto odvodene je zaradených ${stats.money.derived.length} ${plural(stats.money.derived.length, "kauza", "kauzy", "káuz")}.`}
      </p>
    </section>
  );
}

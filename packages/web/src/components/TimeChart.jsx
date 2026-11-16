// Prepojenia v čase (handoff „Červená niť" kap. 3.2).
//
// Mriežka: vľavo popis riadku, vpravo časová os. Riadok pre každú firmu, stranu
// a kauzu v prvom kroku. Pruh = obdobie väzby (tmavý pre subjekty, červený pre
// roly v kauze), ukončený priehľadnejší, odvodený čiarkovaný, otvorený končí
// šípkou na čiare „dnes". Udalosti káuz sú kosoštvorce, budúce s prerušovaným
// rámikom. Pozície sú percentá spočítané na serveri — graf funguje bez JS.

import { Link } from "react-router";
import { SourceNos } from "./profile.jsx";
import { hrefOf } from "./ConnectionMap.jsx";
import { eventLabel, formatDate, linkLabel, roleLabel, yearFraction } from "../format.js";

const MAX_ROWS = 24;

/**
 * @param {{ graph: any, centerId: string, base: string, today: string, label: string }} props
 */
export function TimeChart({ graph, centerId, base, today, label }) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const rowsMap = new Map();
  for (const e of graph.edges) {
    if (e.from !== centerId && e.to !== centerId) continue;
    const other = e.from === centerId ? e.to : e.from;
    if (!nodes.has(other)) continue;
    (rowsMap.get(other) ?? rowsMap.set(other, []).get(other)).push(e);
  }
  const eventsByCase = new Map();
  for (const ev of graph.events ?? []) {
    (eventsByCase.get(ev.case_id) ?? eventsByCase.set(ev.case_id, []).get(ev.case_id)).push(ev);
  }

  const first = (edges) => edges.map((e) => e.valid_from).filter(Boolean).sort()[0] ?? "9999";
  const rows = [...rowsMap.entries()]
    .map(([id, edges]) => ({ node: nodes.get(id), edges: [...edges].sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from))) }))
    .sort((a, b) => (a.node.type === "case") - (b.node.type === "case") || first(a.edges).localeCompare(first(b.edges)));
  const shown = rows.slice(0, MAX_ROWS);

  const now = yearFraction(today);
  const dates = [
    ...shown.flatMap((r) => r.edges.map((e) => e.valid_from)),
    ...shown.flatMap((r) => (eventsByCase.get(r.node.id) ?? []).map((e) => e.occurred_on)),
  ].filter(Boolean).map(yearFraction);
  const start = Math.floor(Math.min(now - 5, ...dates));
  const end = Math.ceil(Math.max(now + 1, ...dates.filter((d) => d <= now + 3)));
  const pct = (y) => `${(((Math.min(Math.max(y, start), end) - start) / (end - start)) * 100).toFixed(2)}%`;
  const ticks = [];
  for (let y = start + ((end - start) % 2 === 0 ? 0 : 1); y <= end; y += 2) ticks.push(y);

  if (shown.length === 0) {
    return <p className="empty">Zatiaľ žiadne zverejnené väzby s dátumom.</p>;
  }

  return (
    <>
      <div className="fig">
        <div className="tlc" role="group" aria-label={label}>
          <div className="tl-corner" />
          <div className="tl-axis" aria-hidden="true">
            {ticks.map((y) => (
              // Krajné roky sa zarovnajú dovnútra, inak by ich orezal okraj.
              <i key={y} className={y === start ? "first" : y === end ? "last" : undefined} style={{ left: pct(y) }}>{y}</i>
            ))}
            <span className="tl-today-l" style={{ left: pct(now) }}>DNES</span>
          </div>

          {shown.map(({ node, edges }) => {
            const isCase = node.type === "case";
            const events = (eventsByCase.get(node.id) ?? []).sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)));
            return [
              <div className="tl-lbl" key={`l-${node.id}`}>
                <Link to={hrefOf(node)}>{node.label}</Link>
                <span>
                  {edges.map((e) => (isCase ? roleLabel(e.role) : linkLabel(e.kind))).filter((v, i, a) => a.indexOf(v) === i).join(" → ")}{" "}
                  <SourceNos base={base} nos={edges.flatMap((e) => e.source_nos)} derived={edges.some((e) => e.derived)} derivation={edges.find((e) => e.derived)?.derivation} />
                </span>
              </div>,
              <div className="tl-track" key={`t-${node.id}`}>
                <span className="tl-today" style={{ left: pct(now) }} aria-hidden="true" />
                {edges.map((e) => {
                  const from = yearFraction(e.valid_from) ?? start;
                  const to = e.valid_to ? yearFraction(e.valid_to) : now;
                  const cls = ["tl-bar", isCase ? "case" : "org", e.valid_to ? "ended" : "open", e.derived ? "derived" : ""].filter(Boolean).join(" ");
                  return (
                    <span
                      key={e.id}
                      className={cls}
                      style={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)})` }}
                      title={`${isCase ? roleLabel(e.role) : linkLabel(e.kind)}: ${formatDate(e.valid_from) || "?"} – ${e.valid_to ? formatDate(e.valid_to) : "dnes"}`}
                    />
                  );
                })}
                {events.map((ev, i) => {
                  const at = yearFraction(ev.occurred_on);
                  if (at === null) return null;
                  const future = ev.occurred_on > today;
                  return [
                    <span key={`e-${ev.id}`} className={`tl-ev${future ? " future" : ""}`} style={{ left: pct(at) }}
                      title={`${ev.title ?? eventLabel(ev.category)} · ${formatDate(ev.occurred_on)}`} />,
                    <span key={`el-${ev.id}`} className={`tl-ev-l${i % 2 ? " up" : ""}`} style={{ left: pct(at) }} aria-hidden="true">
                      {eventLabel(ev.category)}
                    </span>,
                  ];
                })}
              </div>,
            ];
          })}
        </div>
      </div>
      {/* Textová alternatíva grafu pre čítačky obrazovky. */}
      <ul className="sr-only">
        {shown.map(({ node, edges }) => (
          <li key={node.id}>
            {node.label}:{" "}
            {edges.map((e) => `${node.type === "case" ? roleLabel(e.role) : linkLabel(e.kind)} ${formatDate(e.valid_from) || "?"} – ${e.valid_to ? formatDate(e.valid_to) : "dnes"}`).join("; ")}
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <p className="hint">Zobrazených {shown.length} z {rows.length} riadkov. <Link to={`${base}/siet`}>Celé okolie ukazuje Sieť →</Link></p>
      )}
    </>
  );
}

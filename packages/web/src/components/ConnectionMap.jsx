// Mapa prepojení — 1 krok (handoff „Červená niť" kap. 3.1).
//
// SVG renderované na serveri, rozloženie je deterministické (žiadna simulácia):
// vľavo firmy a strany (pri subjekte ľudia), v strede stred, vpravo kauzy, dole
// „v okolí". Pod 820 px sa SVG skryje a ukáže sa zoznam s tými istými údajmi.
//
// Pri viacerých rolách v jednej kauze (podozrivý → obžalovaný) je **jeden uzol**
// s aktuálnou rolou a pod ňou ukončené. Celý vývoj ukazuje záložka V čase.

import { Link } from "react-router";
import { RoleTag } from "./chrome.jsx";
import { SourceNos, sourceHref } from "./profile.jsx";
import {
  caseKindLabel, impactText, linkLabel, moneyShort, orgKindLabel, period, phaseLabel, roleLabel, statusLabel,
} from "../format.js";

const MAX_PER_COLUMN = 8;
const W = 1040;
const LEFT = { x: 20, w: 248, h: 56, step: 78 };
const RIGHT = { x: 772, w: 248, h: 84, step: 100 };
const CENTER = { x: 440, w: 160, h: 78 };
const TOP = 48;

export const hrefOf = (node) =>
  node.type === "case" ? `/kauza/${node.slug}` : node.type === "org" ? `/subjekt/${node.slug}` : `/osoba/${node.slug}`;

/** Vývoj rolí alebo väzieb chronologicky: „podozrivý → obžalovaný". */
const chronology = (edges) =>
  [...new Set([...edges].sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from))).map(edgeLabel))].join(" → ");

/** Popis hrany: rola v kauze alebo typ prepojenia. */
const edgeLabel = (e) => (e.kind === "role" ? roleLabel(e.role) : linkLabel(e.kind));

const clip = (text, n = 28) => (text && text.length > n ? `${text.slice(0, n - 1)}…` : text ?? "");

/** Zoradenie hrán: platné pred ukončenými, potom od najnovšej. */
const byValidity = (a, b) =>
  (!!a.valid_to - !!b.valid_to) || String(b.valid_from ?? "").localeCompare(String(a.valid_from ?? ""));

/**
 * Z grafu urobí riadky stĺpcov: jeden riadok na uzol, so všetkými hranami do
 * stredu.
 *
 * @param {any} graph  odpoveď `/graph?depth=2`
 * @param {string} centerId
 */
export function mapModel(graph, centerId) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const center = nodes.get(centerId);
  const direct = new Map();
  for (const e of graph.edges) {
    if (e.from !== centerId && e.to !== centerId) continue;
    const other = e.from === centerId ? e.to : e.from;
    if (!nodes.has(other)) continue;
    (direct.get(other) ?? direct.set(other, []).get(other)).push(e);
  }
  const row = (id, edges, extra = {}) => {
    const sorted = [...edges].sort(byValidity);
    return { node: nodes.get(id), edges: sorted, current: sorted.some((e) => !e.valid_to), ...extra };
  };
  const order = (a, b) => (b.current - a.current) || byValidity(a.edges[0], b.edges[0]);

  const rows = [...direct.entries()].map(([id, edges]) => row(id, edges));

  // Kauza: vľavo ľudia a subjekty podľa rolí, vpravo súvisiace kauzy cez
  // spoločných ľudí alebo subjekty (handoff kap. 5.2). Okolie sa neukazuje.
  if (center?.type === "case") {
    const left = rows.sort(order);
    const ring1 = new Set(direct.keys());
    const viaMap = new Map();
    for (const e of graph.edges) {
      if (e.kind !== "role") continue;
      const [entity, caseId] = [e.from, e.to];
      if (!ring1.has(entity) || caseId === centerId || !nodes.has(caseId)) continue;
      (viaMap.get(caseId) ?? viaMap.set(caseId, { edges: [], through: new Set() }).get(caseId)).edges.push(e);
      viaMap.get(caseId).through.add(nodes.get(entity)?.label);
    }
    const related = [...viaMap.entries()]
      .map(([id, v]) => ({ ...row(id, v.edges, { via: [...v.through].filter(Boolean) }), isVia: true }))
      .sort((a, b) => b.via.length - a.via.length || order(a, b));
    return { center, left, cases: related, around: [] };
  }

  const leftType = center?.type === "org" ? "person" : "org";
  const left = rows.filter((r) => r.node.type === leftType).sort(order);
  const cases = rows.filter((r) => r.node.type === "case").sort(order);

  // Subjekt: kauzy, ktoré sa ho týkajú cez jeho ľudí — iný druh väzby, iný štýl čiary.
  const via = [];
  if (center?.type === "org") {
    const people = new Set(left.map((r) => r.node.id));
    const viaMap = new Map();
    for (const e of graph.edges) {
      if (e.kind !== "role") continue;
      if (!people.has(e.from) || direct.has(e.to) || !nodes.has(e.to)) continue;
      (viaMap.get(e.to) ?? viaMap.set(e.to, { edges: [], through: new Set() }).get(e.to)).edges.push(e);
      viaMap.get(e.to).through.add(nodes.get(e.from)?.label);
    }
    for (const [id, v] of viaMap) via.push(row(id, v.edges, { via: [...v.through].filter(Boolean) }));
    via.sort(order);
  }

  // V okolí: ľudia (pri subjekte firmy a strany), ku ktorým vedie cesta cez
  // spoločnú firmu alebo kauzu, alebo priame prepojenie.
  const aroundType = center?.type === "org" ? "org" : "person";
  const ring1 = new Set(direct.keys());
  const around = [];
  for (const n of graph.nodes) {
    if (n.id === centerId || n.type !== aroundType) continue;
    if (n.type === leftType && ring1.has(n.id)) continue;
    let through = null;
    if (ring1.has(n.id)) {
      const e = direct.get(n.id)[0];
      through = { label: linkLabel(e.kind), edge: e };
    } else {
      const e = graph.edges.find((x) => (x.from === n.id && ring1.has(x.to)) || (x.to === n.id && ring1.has(x.from)));
      if (!e) continue;
      const mid = nodes.get(e.from === n.id ? e.to : e.from);
      through = { label: `${e.kind === "role" ? roleLabel(e.role) : linkLabel(e.kind)} · ${mid?.label ?? ""}`, edge: e };
    }
    around.push({ node: n, through });
  }
  around.sort((a, b) => (a.node.distance - b.node.distance) || String(a.node.label).localeCompare(String(b.node.label), "sk"));

  return { center, left, cases: [...cases, ...via.map((v) => ({ ...v, isVia: true }))], around };
}

/** Text pod názvom kauzy: suma alebo dopad, stav, fáza. Nikdy „0 €". */
function caseLine(node) {
  const m = node.meta ?? {};
  const figure = typeof m.amount === "number" && m.amount > 0 ? moneyShort(m.amount) : impactText(m.impact);
  return [figure || caseKindLabel(m.kind?.[0]), statusLabel(m.status), phaseLabel(m.phase)].filter(Boolean).join(" · ");
}

const ROLE_STYLE = {
  suspect: { stroke: "var(--muted)", fill: "none", dash: "3 2", text: "var(--muted)" },
  accused: { stroke: "var(--accent)", fill: "none", text: "var(--accent)" },
  indicted: { stroke: "var(--accent)", fill: "var(--accent-soft)", text: "var(--accent)" },
  convicted: { stroke: "var(--accent)", fill: "var(--accent)", text: "var(--surface)" },
  acquitted: { stroke: "var(--ok)", fill: "var(--ok-soft)", text: "var(--ok)" },
};

/** Štítok roly v SVG — rovnaké tvary ako `RoleTag` v HTML. */
function SvgRole({ role, x, y }) {
  const s = ROLE_STYLE[role] ?? { stroke: "var(--line)", fill: "none", text: "var(--muted)" };
  const label = roleLabel(role).toUpperCase();
  const w = Math.max(56, label.length * 7 + 14);
  return (
    <g>
      <rect x={x} y={y} width={w} height={18} rx={3} fill={s.fill} stroke={s.stroke} strokeDasharray={s.dash} />
      <text x={x + w / 2} y={y + 13} textAnchor="middle" className="m-tag" style={{ fill: s.text }}>{label}</text>
    </g>
  );
}

/**
 * @param {{ graph: any, centerId: string, base: string, label: string, subtitle?: string }} props
 */
export function ConnectionMap({ graph, centerId, base, label, subtitle }) {
  const model = mapModel(graph, centerId);
  const isOrg = model.center?.type === "org";
  const left = model.left.slice(0, MAX_PER_COLUMN);
  const right = model.cases.slice(0, MAX_PER_COLUMN);
  const around = model.around.slice(0, MAX_PER_COLUMN);
  const more = {
    left: model.left.length - left.length,
    right: model.cases.length - right.length,
    around: model.around.length - around.length,
  };

  const colH = Math.max(left.length * LEFT.step, right.length * RIGHT.step, 140);
  const cy = TOP + colH / 2;
  const centerY = cy - CENTER.h / 2;
  const bandY = TOP + colH + 36;
  const aroundRows = Math.ceil(around.length / 4);
  const H = around.length ? bandY + 18 + aroundRows * 70 : TOP + colH + 16;

  const spread = (i, n) => (n <= 1 ? 0 : (i - (n - 1) / 2) * Math.min(10, 56 / n));
  const isCase = model.center?.type === "case";
  const leftTitle = isCase ? "ĽUDIA A SUBJEKTY" : isOrg ? "ĽUDIA" : "FIRMY A STRANY";
  const rightTitle = isCase ? "SÚVISIACE KAUZY · cez spoločných ľudí" : "KAUZY";
  const aroundTitle = isOrg ? "FIRMY A STRANY V OKOLÍ · cez spoločných ľudí" : "ĽUDIA V OKOLÍ · cez spoločnú firmu, stranu alebo kauzu";

  return (
    <>
      <div className="fig map-fig">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label={label} className="map-svg">
          <text x={LEFT.x} y={22} className="m-col">{leftTitle}</text>
          <text x={RIGHT.x + RIGHT.w} y={22} className="m-col" textAnchor="end">{rightTitle}</text>

          {left.map((r, i) => {
            const y = TOP + i * LEFT.step;
            const e = r.edges[0];
            const y2 = cy + spread(i, left.length);
            return (
              <g key={`l-${r.node.id}`} opacity={r.current ? 1 : 0.45}>
                <path
                  d={`M${LEFT.x + LEFT.w} ${y + LEFT.h / 2} C ${LEFT.x + LEFT.w + 90} ${y + LEFT.h / 2}, ${CENTER.x - 60} ${y2}, ${CENTER.x} ${y2}`}
                  className={`m-line ${e.kind === "role" ? "case" : "org"}`} strokeDasharray={e.derived ? "6 4" : undefined}
                />
                <text x={LEFT.x + LEFT.w + 10} y={y + LEFT.h / 2 - 8} className="m-lab">
                  {clip([edgeLabel(e), period(e.valid_from, e.valid_to)].filter(Boolean).join(" · "), 26)}
                </text>
                <SvgNos base={base} x={LEFT.x + LEFT.w + 10} y={y + LEFT.h / 2 + 22} edges={r.edges} />
                <a href={hrefOf(r.node)} aria-label={r.node.label}>
                  <title>{r.node.label}</title>
                  <rect x={LEFT.x} y={y} width={LEFT.w} height={LEFT.h} rx={6} className="m-node" />
                  {r.node.type === "person"
                    ? <circle cx={LEFT.x + 21} cy={y + LEFT.h / 2} r={7} className="m-person" />
                    : <rect x={LEFT.x + 14} y={y + LEFT.h / 2 - 7} width={14} height={14} className="m-org" />}
                  <text x={LEFT.x + 40} y={y + 24} className="m-nm">{clip(r.node.label, 26)}</text>
                  <text x={LEFT.x + 40} y={y + 42} className="m-sub">
                    {r.node.type === "org" ? orgKindLabel(r.node.meta?.kind) : clip(chronology(r.edges), 30)}
                  </text>
                </a>
              </g>
            );
          })}

          {right.map((r, i) => {
            const y = TOP + i * RIGHT.step;
            const y2 = cy + spread(i, right.length);
            const current = r.edges.find((e) => !e.valid_to) ?? r.edges[0];
            const ended = r.edges.filter((e) => e !== current);
            return (
              <g key={`r-${r.node.id}`} opacity={r.current || r.isVia ? 1 : 0.6}>
                <path
                  d={`M${CENTER.x + CENTER.w} ${y2} C ${CENTER.x + CENTER.w + 60} ${y2}, ${RIGHT.x - 80} ${y + RIGHT.h / 2}, ${RIGHT.x} ${y + RIGHT.h / 2}`}
                  className={`m-line case${r.isVia ? " via" : ""}`}
                  opacity={r.current ? 1 : 0.4}
                />
                {!r.isVia && <SvgNos base={base} x={RIGHT.x - 10} y={y + RIGHT.h / 2 - 8} edges={r.edges} anchor="end" />}
                <a href={hrefOf(r.node)} aria-label={r.node.label}>
                  <title>{r.node.label}</title>
                  <rect x={RIGHT.x} y={y} width={RIGHT.w} height={RIGHT.h} rx={6} className={`m-node${r.isVia ? "" : " case"}`} />
                  <rect x={RIGHT.x + 15} y={y + 16} width={11} height={11} transform={`rotate(45 ${RIGHT.x + 20.5} ${y + 21.5})`} className="m-case" />
                  <text x={RIGHT.x + 38} y={y + 26} className="m-nm">{clip(r.node.label, 26)}</text>
                  <text x={RIGHT.x + 38} y={y + 44} className="m-sub">{clip(caseLine(r.node), 34)}</text>
                </a>
                {r.isVia ? (
                  <text x={RIGHT.x + 38} y={y + 66} className="m-sub">{clip(`cez: ${r.via.join(", ")}`, 34)}</text>
                ) : (
                  <>
                    <SvgRole role={current.role} x={RIGHT.x + 38} y={y + 54} />
                    {ended.length > 0 && (
                      <text x={RIGHT.x + 150} y={y + 67} className="m-sub">
                        {clip(`predtým: ${ended.map((e) => roleLabel(e.role)).join(", ")}`, 18)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          <g>
            <rect x={CENTER.x} y={centerY} width={CENTER.w} height={CENTER.h} rx={8} className="m-center" />
            <text x={CENTER.x + CENTER.w / 2} y={centerY + 36} textAnchor="middle" className={`m-center-nm${isCase ? " small" : ""}`}>
              <title>{model.center?.label}</title>
              {clip(model.center?.label, isCase ? 20 : 17)}
            </text>
            {subtitle && (
              <text x={CENTER.x + CENTER.w / 2} y={centerY + 56} textAnchor="middle" className="m-center-sub">{subtitle}</text>
            )}
          </g>

          {around.length > 0 && (
            <>
              <text x={LEFT.x} y={bandY} className="m-col">{aroundTitle}</text>
              {around.map((a, i) => {
                const x = LEFT.x + (i % 4) * 252;
                const y = bandY + 14 + Math.floor(i / 4) * 70;
                return (
                  <a key={`a-${a.node.id}`} href={hrefOf(a.node)} aria-label={a.node.label}>
                    <title>{a.node.label}</title>
                    <rect x={x} y={y} width={236} height={56} rx={6} className="m-node" />
                    {a.node.type === "person"
                      ? <circle cx={x + 21} cy={y + 28} r={7} className="m-person" />
                      : <rect x={x + 14} y={y + 21} width={14} height={14} className="m-org" />}
                    <text x={x + 38} y={y + 24} className="m-nm">{clip(a.node.label, 24)}</text>
                    <text x={x + 38} y={y + 42} className="m-sub">{clip(a.through.label, 30)}</text>
                  </a>
                );
              })}
            </>
          )}
        </svg>
      </div>

      <MapList model={model} base={base} isOrg={isOrg} isCase={isCase} />

      {(more.left > 0 || more.right > 0 || more.around > 0) && (
        <p className="hint map-more">
          Na mape je najviac {MAX_PER_COLUMN} položiek v stĺpci.
          {more.left > 0 && ` ${isOrg ? "Ľudí" : "Firiem a strán"} je o ${more.left} viac.`}
          {more.right > 0 && ` Káuz je o ${more.right} viac.`}
          {more.around > 0 && ` V okolí je ešte ${more.around}.`}{" "}
          <Link to={`${base}/siet`}>Celé okolie ukazuje Sieť →</Link>
        </p>
      )}
    </>
  );
}

/** Čísla zdrojov hrany ako klikateľné `[n]` v SVG. */
function SvgNos({ base, x, y, edges, anchor = "start" }) {
  const nos = [...new Set(edges.flatMap((e) => e.source_nos).filter(Boolean))].sort((a, b) => a - b).slice(0, 4);
  const derived = edges.some((e) => e.derived);
  if (nos.length === 0 && !derived) return null;
  const parts = [...(derived ? [{ text: "odvodené", href: null }] : []), ...nos.map((no) => ({ text: `[${no}]`, href: sourceHref(base, no) }))];
  // Pozície po znakoch — v SVG sa šírka textu na serveri merať nedá.
  const widths = parts.map((p) => p.text.length * 6.6 + 6);
  const total = widths.reduce((s, w) => s + w, 0);
  let cursor = anchor === "end" ? x - total : x;
  return (
    <g>
      {parts.map((p, i) => {
        const at = cursor;
        cursor += widths[i];
        return p.href ? (
          <a key={p.text} href={p.href} aria-label={`zdroj ${p.text}`}><text x={at} y={y} className="m-src">{p.text}</text></a>
        ) : (
          <text key={p.text} x={at} y={y} className="m-src derived">{p.text}</text>
        );
      })}
    </g>
  );
}

/** Pod 820 px: tri bloky s rovnakými údajmi ako čiary na mape. */
function MapList({ model, base, isOrg, isCase }) {
  const block = (title, rows, render) =>
    rows.length > 0 && (
      <section className="map-block">
        <h3>{title}</h3>
        <ul>{rows.map(render)}</ul>
      </section>
    );
  return (
    <div className="map-list">
      {block(isCase ? "Ľudia a subjekty" : isOrg ? "Ľudia" : "Firmy a strany", model.left.slice(0, MAX_PER_COLUMN), (r) => (
        <li key={r.node.id} className={r.current ? undefined : "ended"}>
          <Link to={hrefOf(r.node)}>{r.node.label}</Link>
          {r.edges.map((e) => (
            <span key={e.id} className="map-row-meta">
              {e.kind === "role"
                ? <RoleTag role={e.role} ended={!!e.valid_to} period={period(e.valid_from, e.valid_to)} />
                : <>{linkLabel(e.kind)}{period(e.valid_from, e.valid_to) && ` · ${period(e.valid_from, e.valid_to)}`}</>}{" "}
              <SourceNos base={base} nos={e.source_nos} derived={e.derived} derivation={e.derivation} />
            </span>
          ))}
        </li>
      ))}
      {block(isCase ? "Súvisiace kauzy" : "Kauzy", model.cases.slice(0, MAX_PER_COLUMN), (r) => (
        <li key={r.node.id}>
          <Link to={hrefOf(r.node)}>{r.node.label}</Link>
          <span className="map-row-meta">{caseLine(r.node)}</span>
          {r.isVia ? (
            <span className="map-row-meta">cez: {r.via.join(", ")}</span>
          ) : (
            r.edges.map((e) => (
              <span key={e.id} className="map-row-meta">
                <RoleTag role={e.role} ended={!!e.valid_to} period={period(e.valid_from, e.valid_to)} />{" "}
                <SourceNos base={base} nos={e.source_nos} />
              </span>
            ))
          )}
        </li>
      ))}
      {block(isOrg ? "Firmy a strany v okolí" : "Ľudia v okolí", model.around.slice(0, MAX_PER_COLUMN), (a) => (
        <li key={a.node.id}>
          <Link to={hrefOf(a.node)}>{a.node.label}</Link>
          <span className="map-row-meta">{a.through.label}</span>
        </li>
      ))}
    </div>
  );
}

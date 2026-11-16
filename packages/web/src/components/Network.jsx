// Sieť do dvoch krokov (handoff „Červená niť" kap. 3.3).
//
// Server vráti uzly a hrany, **klient** spočíta rozloženie cez `d3-force` (jediná
// nová závislosť webu). Bez JS — a pod 820 px — je tu zoznam uzlov zoskupený
// podľa vzdialenosti, ktorý server vykreslí vždy; zároveň je to textová
// alternatíva grafu.
//
// Rozloženie sa počíta dopredu (300 krokov naraz, bez animácie), takže pri
// `prefers-reduced-motion` sa nič nehýbe. Ťahanie uzla posunie len ten uzol a
// zvyšok dorovná pár krokmi simulácie.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { hrefOf } from "./ConnectionMap.jsx";
import { linkLabel, roleLabel } from "../format.js";

const W = 1040;
const H = 560;

/** Popis hrany pre titulok a zoznam. */
const edgeText = (e) => (e.kind === "role" ? roleLabel(e.role) : linkLabel(e.kind));

/**
 * @param {{ graph: any, centerId: string, base: string, label: string }} props
 */
export function Network({ graph, centerId, base, label }) {
  const [layout, setLayout] = useState(null);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  // Počiatočný pohľad: celý graf na plátne. „Pôvodné" sa vracia sem.
  const fitRef = useRef({ k: 1, x: 0, y: 0 });
  const simRef = useRef(null);
  const svgRef = useRef(null);

  const neighbors = useMemo(() => {
    const map = new Map();
    for (const e of graph.edges) {
      (map.get(e.from) ?? map.set(e.from, new Set()).get(e.from)).add(e.to);
      (map.get(e.to) ?? map.set(e.to, new Set()).get(e.to)).add(e.from);
    }
    return map;
  }, [graph]);

  useEffect(() => {
    let cancelled = false;
    import("d3-force").then((d3) => {
      if (cancelled) return;
      const nodes = graph.nodes.map((n) => ({ ...n, ...(n.id === centerId ? { fx: 0, fy: 0 } : {}) }));
      const links = graph.edges.map((e) => ({ source: e.from, target: e.to, edge: e }));
      const sim = d3
        .forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((d) => d.id).distance((l) => (l.edge.kind === "role" ? 70 : 60)).strength(0.5))
        .force("charge", d3.forceManyBody().strength(-260))
        .force("collide", d3.forceCollide(26))
        .force("radial", d3.forceRadial((d) => d.distance * 170, 0, 0).strength(0.35))
        .stop();
      for (let i = 0; i < 300; i++) sim.tick();
      simRef.current = { sim, nodes, links };
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      // Okraj na popisky uzlov; viac než 1:1 sa nepribližuje.
      const k = Math.min(1, (W - 120) / Math.max(1, maxX - minX), (H - 90) / Math.max(1, maxY - minY));
      fitRef.current = { k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k };
      setView(fitRef.current);
      setLayout({ nodes: nodes.map((n) => ({ ...n })), links });
    });
    return () => {
      cancelled = true;
    };
  }, [graph, centerId]);

  // Ťahanie uzla a posúvanie plátna. Ťah dlhší ako 3 px nie je klik.
  const drag = useRef(null);
  const toGraph = (evt) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = ((evt.clientX - rect.left) / rect.width) * W - W / 2;
    const sy = ((evt.clientY - rect.top) / rect.height) * H - H / 2;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };
  const onPointerDown = (evt, nodeId = null) => {
    evt.stopPropagation();
    drag.current = { nodeId, start: { x: evt.clientX, y: evt.clientY }, view, moved: false };
    svgRef.current?.setPointerCapture?.(evt.pointerId);
  };
  const onPointerMove = (evt) => {
    const d = drag.current;
    if (!d) return;
    const dx = evt.clientX - d.start.x;
    const dy = evt.clientY - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.nodeId && simRef.current) {
      const p = toGraph(evt);
      const node = simRef.current.nodes.find((n) => n.id === d.nodeId);
      node.fx = p.x;
      node.fy = p.y;
      simRef.current.sim.alpha(0.15);
      for (let i = 0; i < 12; i++) simRef.current.sim.tick();
      setLayout({ nodes: simRef.current.nodes.map((n) => ({ ...n })), links: simRef.current.links });
    } else {
      const rect = svgRef.current.getBoundingClientRect();
      setView({ ...d.view, x: d.view.x + (dx / rect.width) * W, y: d.view.y + (dy / rect.height) * H });
    }
  };
  const onPointerUp = () => {
    setTimeout(() => {
      drag.current = null;
    }, 0);
  };
  const onWheel = (evt) => {
    evt.preventDefault();
    const k = Math.min(3, Math.max(0.2, view.k * (evt.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setView({ ...view, k });
  };
  // Koliesko musí byť pasívne-false, inak sa stránka posúva spolu so zoomom.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const lit = hover ? new Set([hover, ...(neighbors.get(hover) ?? [])]) : null;
  const pos = new Map((layout?.nodes ?? []).map((n) => [n.id, n]));
  const byDistance = [1, 2].map((d) => graph.nodes.filter((n) => n.distance === d));

  return (
    <>
      {layout && (
        <div className="fig net-fig">
          <div className="net-zoom" role="group" aria-label="Priblíženie">
            <button type="button" onClick={() => setView({ ...view, k: Math.min(3, view.k * 1.25) })} aria-label="Priblížiť">+</button>
            <button type="button" onClick={() => setView({ ...view, k: Math.max(0.2, view.k / 1.25) })} aria-label="Oddialiť">−</button>
            <button type="button" onClick={() => setView(fitRef.current)}>pôvodné</button>
          </div>
          <svg
            ref={svgRef}
            viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
            width="100%"
            role="group"
            aria-label={label}
            className="net-svg"
            onPointerDown={(e) => onPointerDown(e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {graph.edges.map((e) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const dim = lit && !(lit.has(e.from) && lit.has(e.to));
                return (
                  <line
                    key={e.id}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    className={`n-edge ${e.kind === "role" ? "case" : "org"}${e.valid_to ? " ended" : ""}`}
                    strokeDasharray={e.derived ? "5 4" : undefined}
                    opacity={dim ? 0.08 : undefined}
                  >
                    <title>{edgeText(e)}</title>
                  </line>
                );
              })}
              {layout.nodes.map((n) => {
                const isCenter = n.id === centerId;
                const dim = lit && !lit.has(n.id);
                const r = isCenter ? 16 : n.distance === 1 ? 10 : 7;
                return (
                  <a
                    key={n.id}
                    href={hrefOf(n)}
                    aria-label={n.label}
                    className="n-node"
                    opacity={dim ? 0.2 : 1}
                    onPointerDown={(e) => onPointerDown(e, n.id)}
                    onClick={(e) => {
                      if (drag.current?.moved) e.preventDefault();
                    }}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                  >
                    <title>{n.label}</title>
                    {n.type === "person" && <circle cx={n.x} cy={n.y} r={r} className={`n-person${isCenter ? " center" : ""}`} />}
                    {n.type === "org" && <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} className="n-org" />}
                    {n.type === "case" && (
                      <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${n.x} ${n.y})`} className="n-case" />
                    )}
                    {(n.distance <= 1 || hover === n.id) && (
                      <text x={n.x} y={n.y + r + 14} textAnchor="middle" className={`n-label${isCenter ? " center" : ""}`}>
                        {n.label}
                      </text>
                    )}
                  </a>
                );
              })}
            </g>
          </svg>
        </div>
      )}

      <div className="net-list">
        {byDistance.map((list, i) =>
          list.length > 0 && (
            <section key={i}>
              <h3>{i === 0 ? "1 krok" : "2 kroky"} <small>{list.length}</small></h3>
              <ul>
                {list.map((n) => {
                  const via = graph.edges.filter((e) => (e.from === n.id || e.to === n.id) && (i === 0 ? (e.from === centerId || e.to === centerId) : true));
                  return (
                    <li key={n.id}>
                      <span className={`shape ${n.type}`} aria-hidden="true" />
                      <Link to={hrefOf(n)}>{n.label}</Link>
                      <span className="map-row-meta">{[...new Set(via.map(edgeText))].join(", ")}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </>
  );
}

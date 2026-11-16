// Logo „Červená niť": wordmark s niťou, ktorá spája dva špendlíky — odkaz na
// nástenku vyšetrovateľa. Text je krivka (nie <text>), takže logo nečaká na
// webfont a vyzerá rovnako v hlavičke, vo favicone aj v OG obrázku.
//
// Farby idú cez tokeny, preto logo funguje v oboch režimoch: text `--ink`,
// niť a špendlíky `--accent`. V tmavej pätičke sa tokeny prepíšu lokálne.

import { ICON, ICON_PINS, ICON_THREAD, WORDMARK, WORDMARK_PINS, WORDMARK_THREAD } from "./logo-paths.js";

/**
 * @param {{ width?: number, title?: string, className?: string }} props
 *   `title` — keď je logo samo o sebe obsah (nie súčasť odkazu s popisom).
 */
export function Logo({ width = 170, title, className }) {
  const height = Math.round((width * 56) / 260);
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 260 56"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={WORDMARK} style={{ fill: "var(--ink)" }} />
      <path
        d={WORDMARK_THREAD}
        fill="none"
        style={{ stroke: "var(--accent)" }}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {WORDMARK_PINS.map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="4.5" style={{ fill: "var(--accent)" }} />
      ))}
    </svg>
  );
}

/** Ikona — „d" s niťou na tmavom štvorci. Tmavá v oboch režimoch. */
export function LogoIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <rect width="52" height="52" rx="6" fill="#151312" />
      <path d={ICON} fill="#fff" />
      <path d={ICON_THREAD} fill="none" stroke="#ff4a40" strokeWidth="2.6" strokeLinecap="round" />
      {ICON_PINS.map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="4" fill="#ff4a40" />
      ))}
    </svg>
  );
}

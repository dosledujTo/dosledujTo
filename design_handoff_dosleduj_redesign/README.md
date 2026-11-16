# Handoff: Dosleduj.to — vizuálny redizajn + tmavý režim

## Overview
Redesign of **dosleduj.to** — a public register of Slovak corruption/court cases ("verejná pamäť káuz"). Two screens are designed: the front page (register overview) and the case dossier page. The visual direction is **editorial / print-like**: paper ground, serif type, hairline rules, gold used only as stroke and small marks — never as a filled block. A **light/dark theme toggle** is included, persisted in `localStorage`.

## About the Design Files
The files in this bundle are **design references authored in HTML** — prototypes showing the intended look, structure and behaviour. They are **not production code to copy verbatim**. The task is to recreate these designs in the target codebase (whatever renders dosleduj.to today — Django/Jinja templates, Astro, Next.js, etc.) using its existing template, styling and asset conventions. If no front-end environment exists yet, pick the simplest server-rendered stack: these pages are content pages with almost no client-side state (only the theme toggle).

Each design file is a "Design Component" (`.dc.html`) — open it in a browser to see it render. Ignore the `<x-dc>` / `data-dc-script` wrapper and the `{{ }}` holes; they are the prototyping runtime. The `{{ }}` holes used are only: `showUpcoming` (section visibility), `toggleTheme` (click handler), `themeLabel` (button caption).

## Fidelity
**High-fidelity.** Colors, type, spacing, borders and states are final and should be reproduced closely. Content is the site's current test data (Kauza Testovací most, Kauza Skúšobné dotácie) and must come from the real database.

---

## Screens / Views

### 1. Front page — `DosledujHome.dc.html`

**Purpose:** show the state of the register, what is coming up, and the most recently updated / largest cases.

**Layout:** single column, `max-width: 1120px`, `margin: 0 auto`, `padding: 0 40px`. Sections separated by 1px hairlines (`--rule`), never by cards or filled boxes.

**Header (site-wide)** — flex row, `align-items: baseline`, `gap: 28px`, `padding: 16px 40px`, bottom hairline.
- Brand lockup (link to `/`): "Dosleduj.to" in heading serif 21px/600, letter-spacing −0.01em; next to it "VEREJNÁ PAMÄŤ KÁUZ" 11px, letter-spacing 0.14em, uppercase, ink@55%. `margin-right: auto`.
- Nav: "Kauzy", "Ľudia" — 13px, letter-spacing 0.04em, no underline, `border-bottom: 1px solid` gold when current, transparent otherwise, `padding-bottom: 2px`.
- Theme toggle button: 12px heading serif 600, gold-ink text, 1px ink@16% border, radius 4px, padding 6px 12px. Caption is "Tmavý režim" in light mode, "Svetlý režim" in dark.
- Search: input (13px, 150px wide, transparent bg, 1px ink@16% border, radius `4px 0 0 4px`, right border removed) butted against a "Hľadať" button (radius `0 4px 4px 0`, same border, gold-ink label).

**Masthead** — grid `1.25fr 1fr`, `gap: 56px`, `padding: 64px 0 40px`, bottom hairline.
- Left: kicker "REGISTER KÁUZ NA SLOVENSKU" (11px, 0.16em, gold-ink); H1 in heading serif **400** (not bold), 66px, line-height 1.02, letter-spacing −0.02em, two lines; dek 16px/1.62, `text-align: justify`, `hyphens: auto`, `max-width: 52ch`, ink@82%; search row (input flex:1 + outlined gold "Hľadať" button, both radius 4px, `max-width: 460px`).
- Right (`border-left: 1px solid` rule, `padding-left: 32px`): label "STAV REGISTRA" then a 2×2 figure grid with internal hairlines. Figures in heading serif 400, 40px, `font-variant-numeric: tabular-nums`; captions 11px ink@60%. The money figure ("13 390 000 €") is 29px and gold-ink.

**"Čo sa chystá"** — grid `260px 1fr`, gap 56px. Left: H2 (heading serif 600, 28px) + 13px ink@60% note. Right: `<ol>` of rows, each `grid: 132px 1fr auto`, `padding: 16px 0`, top hairline: tabular date (12px gold-ink) · event title (heading serif 600, 19px, link) with case + court underneath (12px ink@60%) · status pill "OČAKÁVANÉ" (10px, 0.12em, 1px gold border, radius 3px, padding 3px 8px).

**"Naposledy doplnené"** — section head row: H2 + right-aligned "VŠETKY KAUZY →" (12px, 0.1em, uppercase, gold-ink). Then `<ul>` of case entries, each: top hairline, `padding: 26px 0`, grid `1fr 220px`, gap 48px.
- Left: pill row — status pill (filled tint: `--tag-bg` bg / `--tag-ink` text, 10px uppercase, radius 3px) + phase pill (outlined ink@24%) + tag list (11px ink@45%, separated by " · "); H3 title link, heading serif 600, 27px, line-height 1.14; summary 14px/1.62 justified, `max-width: 64ch`, ink@78%.
- Right: `border-left: 1px solid` rule, `padding-left: 24px`, `text-align: right` — amount in heading serif 400, 31px, tabular; caption "suma, o ktorú ide" 11px ink@55%; source count line 11px gold-ink.

**"Najväčšie sumy"** — grid `260px 1fr`. Table, `border-collapse: collapse`, 14px: header cells 10px/0.12em uppercase ink@55%, weight 400, bottom hairline; body cells `padding: 14px 0`, bottom hairline; case title as heading serif 600 18px link; amount column right-aligned, tabular, 16px.

**Footer (site-wide)** — background `--colophon` (#221f1c, dark in both themes), text #e8e4de. `padding: 56px 40px 44px`, inner grid `1.1fr 1fr 1fr`, gap 56px: brand + mission; "PRAVIDLÁ" (label 10px/0.16em in #e1ad66) + sourcing/presumption-of-innocence text; "OPRAVA" + outlined "Poslať podnet" button (1px #e1ad66, radius 4px). Body copy 13px/1.65 at 72% opacity.

### 2. Case page — `DosledujKauza.dc.html`

**Purpose:** the full dossier of one case — what is claimed, by which source, what has happened, what comes next.

- **Breadcrumb**: 11px/0.1em uppercase ink@50%, "Kauzy / <case>".
- **Case head**: grid `1.3fr 1fr`, `align-items: end`, bottom hairline. Left: pill row (status + phase + tags), H1 heading serif **400** 58px/1.03, lead paragraph 16px/1.65 justified `max-width: 60ch`. Right rail (left hairline, padding-left 32px): "NAJBLIŽŠÍ TERMÍN" label, date in heading serif 34px tabular, court line 13px ink@70%, then a hairline-topped row of three counters (zdroje / ľudia / konanie) in heading serif 22px with 11px captions.
- **"Kľúčové údaje"**: 3-column grid with vertical hairlines between cells, top hairline, `padding: 22px` per cell. Each cell: uppercase 11px label, value in heading serif 400 **36px** tabular, then the source link (12px gold-ink with a `1px solid gold@40%` bottom border). The **conflicting-figure treatment** is the key idea: the second cell repeats the amount from another source at ink@60% with a "SPORNÉ" pill (1px gold border) next to its label — the design never silently averages or picks one number.
- **Timeline "Čo sa dialo a čo sa chystá"**: grid `260px 1fr`; the right column is an `<ol>` with `border-left: 1px solid ink@20%`, `padding-left: 28px`. Each entry: 9px dot at `left: -33px` — paper fill + 1px ink@45% border for past events, solid ink for the latest, **dashed gold border for expected** ones; date 12px gold-ink tabular; title heading serif 600 20px; body 14px/1.6 ink@75% `max-width: 62ch`; source link. Between past and future sits the **"dnes" divider**: uppercase 10px/0.18em ink label + a 1px full-width ink rule.
- **Bottom split**: grid `1.4fr 1fr`, gap 56px.
  - **Zdroje**: numbered list, each row `grid: 28px 1fr`, top hairline, `padding: 14px 0`. Number as "01" in heading serif 14px gold. Title 15px/1.45 ink with a 1px ink@25% bottom border. Meta line 12px ink@60%: publisher · date, plus an "ÚRADNÝ DOKUMENT" filled tint pill and an "archív" link where present. Official documents are listed first.
  - **Aside**: "Ľudia v kauze" (rows: name link left, role right — accused role uses the filled tint pill, others plain uppercase 11px ink@60%); "Súdne konania" (court + file number, tabular); "Niečo tu nesedí?" with the outlined gold "Poslať podnet" button.

---

## Interactions & Behavior
- **Theme toggle**: sets `data-theme="light" | "dark"` on `<html>`; all colors are CSS custom properties, so nothing else changes. Persist the choice in `localStorage` under `dosleduj-theme`, read it before first paint (inline script in `<head>`) to avoid a flash. Optional improvement for production: default to `prefers-color-scheme` when nothing is stored. Transition `background .2s ease, color .2s ease` on `body`.
- **Links/hover**: body links are `--gold-ink`, hovering moves to `--gold`. Nav items get gold text/underline on hover and `aria-current="page"`. Buttons: outlined; hover = 12% accent tint, active = 22%.
- **Focus**: `:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px }` everywhere — never the browser default.
- **Section visibility**: "Čo sa chystá" hides when there are no known future dates (`showUpcoming` in the prototype).
- **Responsive** (not drawn — implement): below ~900px collapse every 2-column grid to one column, move the case-entry amount rail above the summary (drop the left border, keep the hairline), stack the case-head rail under the H1, and reduce H1 to ~40px (front page) / ~36px (case page). Header wraps: brand row, then nav + toggle + search. Keep 24px page padding.
- No loading/error states are designed; use the codebase's conventions. The search form is a normal GET submit.

## State Management
Only one piece of client state: `theme: 'light' | 'dark'` (persisted). Everything else is server-rendered data. Data shape implied by the design:
- **Case**: title, slug, status (`otvorená` / `uzavretá`), phase (`obžaloba`, `oslobodené`, …), tags[], summary, amounts[] (`{ value, currency, source, disputed }`), nearest upcoming event, counts (sources / people / proceedings).
- **Event**: date, title, description, `expected: boolean`, source.
- **Source**: title, url, publisher, date, `official: boolean`, `archiveUrl?`.
- **Person**: name, slug, role, optional role period, source.
Every displayed value carries its source — a value with no source is not rendered at all.

## Design Tokens

Light (`:root`) → Dark (`[data-theme="dark"]`):
| Token | Light | Dark |
| --- | --- | --- |
| `--paper` (page ground) | `#f3f2f2` | `#1b1a18` |
| `--ink` (text) | `#201f1d` | `#eae7e2` |
| `--gold` (stroke accent) | `#b68235` | `#d3a35d` |
| `--gold-ink` (accent text/links) | `#7d5411` | `#e1ad66` |
| `--tag-bg` / `--tag-ink` (status tint) | `#ffe3bf` / `#5a3b0a` | `#4a3413` / `#facb8d` |
| `--tagn-bg` / `--tagn-ink` (neutral tint) | `#eae7e7` / `#444141` | `#2f2c2a` / `#cfcac4` |
| `--colophon` / `--colophon-ink` (footer) | `#221f1c` / `#e8e4de` | `#131211` / `#e8e4de` |

All translucent values are `color-mix(in srgb, var(--ink) N%, transparent)` — hairlines N=16, muted text N=50–60, body text N=75–84, borders on inputs N=24–30. This is what makes both themes work from one set of rules.

**Type**: headings `"Cormorant Garamond", serif` — weight **400** for display sizes (H1, big figures), **600** for interface headings; body `"Lora", Georgia, serif` 15px/1.55. Scale used: 66 / 58 / 40 / 36 / 34 / 31 / 28 / 27 / 26 / 20 / 19 / 16 / 15 / 14 / 13 / 12 / 11 / 10px. Uppercase labels get letter-spacing 0.1–0.18em. Every figure and date sets `font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`; running prose does **not**.

**Spacing** (from the system's 4.6px-based scale, rounded as used): 4 / 8 / 12 / 16 / 24 / 28 / 40 / 48 / 56 / 64px. **Radius**: 3px pills, 4px controls. **Shadows**: none — elevation is not used on these pages; structure is carried by hairlines.

## Assets
None. No images, no logo file, no icon set is used — the brand is set in type. If icons are added later the system specifies [Lucide](https://lucide.dev). Fonts are Google Fonts (Cormorant Garamond 400/600, Lora 400/600) — self-host them in production.

## Files
- `DosledujHome.dc.html` — front page design reference (open in a browser).
- `DosledujKauza.dc.html` — case page design reference.
- `ds-base.js` — loader the prototypes use to pull in the design system; not needed in production.
- `styles.css` — the "Classical" design system stylesheet the prototypes sit on (tokens, tonal ramps, base component classes). Useful as the source of truth for ramps and states.
- `design-system-readme.md` — the written rules of the system (do/don't; how color, type and imagery are handled). Read this before inventing new elements.

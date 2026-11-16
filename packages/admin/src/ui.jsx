// Vizuálny slovník administrácie (zadanie §10).
//
// Tri veci tu nie sú štýlovanie, ale produktové rozhodnutia: role sa nikdy
// nerenderujú spoločným červeným štítkom, stav zdrojovania je rozoznateľný bez
// čítania, a publikačný stav je vidieť v zozname aj na detaile.

import { useEffect, useState } from "react";

/**
 * Role a prezumpcia neviny. Každý stav má vlastné slovo a vlastnú farbu —
 * oslobodenie má rovnakú váhu ako obvinenie, nie menšiu.
 */
const ROLE_STYLES = {
  suspect: { label: "podozrivý", cls: "text-bg-warning" },
  accused: { label: "obvinený", cls: "text-bg-warning" },
  indicted: { label: "obžalovaný", cls: "text-bg-danger" },
  convicted: { label: "právoplatne odsúdený", cls: "text-bg-dark" },
  acquitted: { label: "oslobodený", cls: "text-bg-success" },
  witness: { label: "svedok", cls: "text-bg-info" },
  victim: { label: "poškodený", cls: "text-bg-info" },
  investigator: { label: "vyšetrovateľ", cls: "text-bg-secondary" },
  prosecutor: { label: "prokurátor", cls: "text-bg-secondary" },
  judge: { label: "sudca", cls: "text-bg-secondary" },
  other: { label: "iné", cls: "text-bg-light border" },
};

/** Slovenský názov role a ponuka do formulárov — ten istý slovník ako badge. */
export const roleKindLabel = (role) => (ROLE_STYLES[role] ?? ROLE_STYLES.other).label;

export const ROLE_KIND_OPTIONS = Object.entries(ROLE_STYLES).map(([value, style]) => ({
  value,
  label: style.label,
}));

export function RoleBadge({ role, current = true }) {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.other;
  return (
    <span className={`badge ${style.cls} ${current ? "" : "opacity-75"}`}>
      {style.label}
      {!current && <span className="ms-1 fw-normal">· ukončená</span>}
    </span>
  );
}

const PUBLISH_STYLES = {
  draft: { label: "koncept", cls: "text-bg-secondary" },
  published: { label: "publikované", cls: "text-bg-success" },
  hidden: { label: "skryté", cls: "text-bg-dark" },
};

export function PublishBadge({ state }) {
  const style = PUBLISH_STYLES[state] ?? PUBLISH_STYLES.draft;
  return <span className={`badge ${style.cls}`}>{style.label}</span>;
}

export const PHASE_LABELS = {
  investigation: "vyšetrovanie",
  charges: "obvinenie",
  indictment: "obžaloba",
  trial: "súdne konanie",
  appeal: "odvolanie",
  convicted: "právoplatne odsúdené",
  acquitted: "oslobodené",
  halted: "zastavené",
  lapsed: "premlčané alebo odložené",
};

export const CASE_KIND_LABELS = {
  public_money: "verejné peniaze",
  investigation_interference: "zásah do vyšetrovania",
  abuse_of_power: "zneužitie právomoci",
  elections_party_finance: "voľby a financovanie strán",
  conflict_of_interest: "konflikt záujmov",
  other: "iné",
};
export const caseKindLabel = (kind) => CASE_KIND_LABELS[kind] ?? kind ?? "—";

export const phaseLabel = (phase) => PHASE_LABELS[phase] ?? phase ?? "—";

export function PhaseBadge({ phase }) {
  if (!phase) return null;
  return <span className="badge text-bg-light border">{phaseLabel(phase)}</span>;
}

/**
 * Stav zdrojovania. Tri stavy, rozoznateľné bez čítania — a nikdy len farbou,
 * vždy aj slovom (zadanie §10, prístupnosť).
 */
export function SourceState({ sources = [], derived = false }) {
  if (sources.length === 0) {
    return (
      <span className="badge text-bg-danger">
        <span aria-hidden="true">✕ </span>bez zdroja — nezverejní sa
      </span>
    );
  }
  if (derived) {
    return (
      <span className="badge text-bg-warning">
        <span aria-hidden="true">⚙ </span>odvodené nami · {sources.length}
      </span>
    );
  }
  return (
    <span className="badge text-bg-light border">
      <span aria-hidden="true">✓ </span>{sources.length}{" "}
      {sources.length === 1 ? "zdroj" : sources.length < 5 ? "zdroje" : "zdrojov"}
    </span>
  );
}

/** Prázdny stav je výzva na akciu, nie oznam (zadanie §10). */
export function EmptyState({ title, hint, action }) {
  return (
    <div className="text-center py-5 px-3">
      <p className="h6 mb-1">{title}</p>
      {hint && <p className="text-body-secondary mb-3">{hint}</p>}
      {action}
    </div>
  );
}

/** Chyba hovorí, čo sa stalo a čo s tým — a neospravedlňuje sa. */
export function ErrorState({ error, onRetry }) {
  return (
    <div className="alert alert-danger">
      <p className="mb-1 fw-semibold">{error?.message ?? "Načítanie zlyhalo"}</p>
      {error?.code && <p className="mb-2 small font-monospace">{error.code}</p>}
      {onRetry && (
        <button className="btn btn-sm btn-outline-danger" onClick={onRetry} type="button">
          Skúsiť znova
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = "Načítava sa…" }) {
  return (
    <div className="py-4 text-center text-body-secondary">
      <span className="spinner-border spinner-border-sm me-2" role="status" />
      {label}
    </div>
  );
}

/** Suma je v centoch, integer (backend-zadanie.md §4). */
export function money(cents) {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

/**
 * Dátum aj s časom, ale len keď ho zdroj naozaj nesie.
 *
 * Články chodia z feedov s presným časom vydania a pri fronte na tom záleží:
 * dva články z toho istého dňa sa inak nedajú zoradiť očami. Dátum bez času
 * (`2024-02-28`) sa ale nesmie vykresliť ako „0:00" — to by bol údaj, ktorý sme
 * si vymysleli.
 *
 * @param {string|null|undefined} value
 */
export function formatMoment(value) {
  if (!value) return "—";
  return /T\d{2}:/.test(String(value)) ? formatDateTime(value) : formatDate(value);
}

/**
 * Povinný dôvod zmeny (zadanie §5.2). Nie voliteľné pole na konci formulára,
 * ale dialóg pri uložení — dôvod končí v audite a moderátor ho má napísať vtedy,
 * keď ešte vie, prečo mení.
 */
export function ReasonDialog({ title = "Dôvod zmeny", hint, onConfirm, onCancel, busy }) {
  const [reason, setReason] = useState("");

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-dialog-centered">
        <form
          className="modal-content"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) onConfirm(reason.trim());
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button className="btn-close" type="button" onClick={onCancel} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <p className="text-body-secondary small">
              {hint ?? "Jedna veta, ktorá zostane v histórii zmien. Uvidí ju každý, kto sa na kauzu pozrie."}
            </p>
            <input
              className="form-control" autoFocus value={reason} maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="napr. doplnený zdroj k sume z uznesenia súdu"
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>
              Zrušiť
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || reason.trim().length < 3}>
              {busy ? "Ukladám…" : "Uložiť"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Konflikt verzií nie je technická chyba, ale bežná situácia: dvaja moderátori
 * na tej istej kauze. Rozhranie ukáže, čo sa medzitým zmenilo, a nikdy ticho
 * neprepíše ani nezahodí rozpracované (zadanie §10).
 */
export function ConflictDialog({ error, onReload, onKeepEditing }) {
  const current = error?.details?.current;
  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Medzitým to zmenil niekto iný</h5>
          </div>
          <div className="modal-body">
            <p>
              Dokument bol upravený, kým si pracoval. Tvoje zmeny sa nezahodili — sú stále vo formulári.
            </p>
            {current && (
              <p className="text-body-secondary small mb-2">
                Poslednú zmenu urobil <strong>{current.updated_by ?? "neznámy"}</strong>{" "}
                {formatDateTime(current.updated_at)}.
              </p>
            )}
            <p className="mb-0 text-body-secondary small">
              Načítaním prevezmeš cudziu verziu a o svoje rozpracované zmeny prídeš. Návratom k formuláru
              si ich necháš a môžeš ich prekopírovať.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onKeepEditing}>
              Späť k formuláru
            </button>
            <button className="btn btn-primary" type="button" onClick={onReload}>
              Načítať cudziu verziu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Trvalý pruh nad obsahom — pre koncept a pre čítací režim. */
export function Notice({ tone = "info", children }) {
  return <div className={`alert alert-${tone} d-flex align-items-center gap-2 py-2`}>{children}</div>;
}

/**
 * Adresa záznamu sa odvodzuje z názvu. Diakritika ide preč — slug je súčasť
 * URL, ktorú niekto pošle ďalej.
 */
export const slugify = (text) =>
  String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

/** Zavrie sa klávesou Escape. */
export function useEscape(handler) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && handler();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler]);
}

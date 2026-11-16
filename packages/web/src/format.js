// Formátovanie zdieľané serverom aj klientom. Musí dávať rovnaký výsledok na
// oboch stranách, inak sa hydratácia rozíde — preto všade explicitná
// slovenská lokalizácia a UTC, nikdy nie predvolené nastavenie prostredia.

const money0 = new Intl.NumberFormat("sk-SK", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
});
const dayMonthYear = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

/** Sumy sú v centoch ako integer (backend-zadanie.md §4). */
export function money(cents) {
  if (typeof cents !== "number") return "";
  return money0.format(cents / 100).replace(/ /g, " ");
}

export const formatDate = (value) => (value ? dayMonthYear.format(new Date(value)) : "");
export const formatLong = (value) => (value ? longDate.format(new Date(value)) : "");

/** „6/2026" — pri zdrojoch stačí mesiac a rok. */
export function monthYear(value) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
}

/** „3/2019–1/2024", „od 2018" — obdobie väzby alebo roly. */
export function period(from, to) {
  if (from && to) return `${monthYear(from)}–${monthYear(to)}`;
  if (from) return `od ${monthYear(from)}`;
  if (to) return `do ${monthYear(to)}`;
  return "";
}

export const isoDay = (value) => String(value ?? "").slice(0, 10);

export const STATUS_LABELS = { open: "otvorená", closed: "uzavretá" };

export const PHASE_LABELS = {
  investigation: "vyšetrovanie", charges: "obvinenie", indictment: "obžaloba",
  trial: "súdne konanie", appeal: "odvolanie", convicted: "právoplatne odsúdené",
  acquitted: "oslobodené", halted: "zastavené", lapsed: "premlčané alebo odložené",
};

/** Druh kauzy. Kauza môže mať viac druhov, prvý je hlavný. */
export const CASE_KIND_LABELS = {
  public_money: "verejné peniaze",
  investigation_interference: "zásah do vyšetrovania",
  abuse_of_power: "zneužitie právomoci",
  elections_party_finance: "voľby a financovanie strán",
  conflict_of_interest: "konflikt záujmov",
  other: "iné",
};
export const caseKindLabel = (kind) => CASE_KIND_LABELS[kind] ?? kind ?? "";

/**
 * Role sa nikdy nezlučujú do jedného štítku. Podozrivý, obvinený, obžalovaný a
 * odsúdený sú rôzne veci; oslobodenie má rovnakú váhu ako obvinenie
 * (produktové zadanie §6).
 */
export const ROLE_LABELS = {
  suspect: "podozrivý", accused: "obvinený", indicted: "obžalovaný",
  convicted: "právoplatne odsúdený", acquitted: "oslobodený", witness: "svedok",
  victim: "poškodený", investigator: "vyšetrovateľ", prosecutor: "prokurátor",
  judge: "sudca", other: "iné",
};

/** Rola, ktorá znamená trestné obvinenie — v dizajne má plnú tintu. */
/** Druh subjektu. Strana, firma a inštitúcia sa v kauze čítajú rôzne. */
export const ORG_KIND_LABELS = {
  party: "politická strana",
  company: "firma",
  institution: "inštitúcia",
};

export const isAccusatory = (role) =>
  ["suspect", "accused", "indicted", "convicted"].includes(role);

export const phaseLabel = (phase) => PHASE_LABELS[phase] ?? phase ?? "";
export const roleLabel = (role) => ROLE_LABELS[role] ?? role ?? "";
export const statusLabel = (status) => STATUS_LABELS[status] ?? status ?? "";
export const orgKindLabel = (kind) => ORG_KIND_LABELS[kind] ?? kind ?? "";

/** Iba http(s) — URL zdrojov pochádzajú z článkov, teda z cudzieho vstupu. */
export const safeUrl = (url) => (/^https?:\/\//i.test(String(url ?? "")) ? String(url) : "#");

export function plural(count, one, few, many) {
  if (count === 1) return one;
  return count >= 2 && count <= 4 ? few : many;
}

/** Typ prepojenia — ako ho číta človek pri čiare v Mape. */
export const LINK_LABELS = {
  member: "člen", statutory: "štatutár", owner: "vlastník", ubo: "konečný užívateľ výhod",
  family: "rodina", business: "obchodný partner", other: "iné prepojenie",
};
export const linkLabel = (kind) => LINK_LABELS[kind] ?? kind ?? "";

/** Kategória udalosti na časovej osi. */
export const EVENT_LABELS = {
  charge: "obvinenie", hearing: "pojednávanie", verdict: "rozsudok", appeal: "odvolanie",
  seizure: "zaistenie", other: "udalosť",
};
export const eventLabel = (category) => EVENT_LABELS[category] ?? category ?? "";

/** Kratšia suma do uzlov a kariet: „12,5 mil. €", „890 tis. €". */
export function moneyShort(cents) {
  if (typeof cents !== "number") return "";
  const eur = cents / 100;
  const fmt = (n) => new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format(n);
  if (eur >= 1e9) return `${fmt(eur / 1e9)} mld. €`;
  if (eur >= 1e6) return `${fmt(eur / 1e6)} mil. €`;
  if (eur >= 1e3) return `${fmt(eur / 1e3)} tis. €`;
  return money(cents);
}

/** Dopad nefinančnej kauzy: „6 odvolaných vyšetrovateľov". */
export function impactText(impact) {
  if (!impact || typeof impact.value !== "number") return "";
  return `${new Intl.NumberFormat("sk-SK").format(impact.value)} ${impact.unit ?? ""}`.trim();
}

/** Desatinný rok pre časovú os („2019-03-01" → 2019.16). */
export function yearFraction(value) {
  if (!value) return null;
  const d = new Date(value);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

/** Dnešok ako ISO deň v UTC — rovnaký na serveri aj v prehliadači v ten istý deň. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * „pred 2 dňami", „včera", „pred 3 týždňami" — relatívne k `today` z `load`,
 * nie k `new Date()`, aby sa server a klient nerozišli.
 * @param {string} at
 * @param {string} today
 */
export function ago(at, today) {
  const days = Math.round((Date.parse(today) - Date.parse(String(at).slice(0, 10))) / 86_400_000);
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  if (days < 14) return `pred ${days} dňami`;
  if (days < 60) return `pred ${Math.round(days / 7)} týždňami`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `pred ${months} mesiacmi`;
  return `pred ${Math.round(months / 12)} rokmi`;
}

/** „o 3 dni", „o 18 dní", „zajtra". */
export function inDays(at, today) {
  const days = Math.round((Date.parse(String(at).slice(0, 10)) - Date.parse(today)) / 86_400_000);
  if (days <= 0) return "dnes";
  if (days === 1) return "zajtra";
  return `o ${days} ${plural(days, "deň", "dni", "dní")}`;
}

/** Segment metriky „Peniaze v kauzách" — názov a vysvetlivka (kap. 6.1). */
export const BUCKET_LABELS = {
  none: ["Bez trestného konania", "len médiá, kontrola alebo úrad"],
  investigation: ["Vyšetrovanie", "trestné stíhanie vo veci, bez obvinenej osoby"],
  charge: ["Obvinenie", "vznesené obvinenie konkrétnej osobe"],
  trial: ["Obžaloba a súd", "podaná obžaloba, konanie na súde"],
  convicted: ["Právoplatné odsúdenie", "aspoň jedna osoba právoplatne odsúdená"],
  acquitted: ["Oslobodenie", "súd obžalovaných oslobodil"],
  discontinued: ["Zastavené alebo zrušené", "zastavenie stíhania, zrušenie obvinenia (§ 363)"],
  lapsed: ["Premlčané alebo odložené", "vec odložená alebo premlčaná"],
};

/** Percento s čiarkou: 70,1 %. */
export const percent = (part, whole) =>
  whole ? `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format((part / whole) * 100)} %` : "0 %";

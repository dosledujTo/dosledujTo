// Generátor testovacích dát pre dizajn „Červená niť" (handoff kap. 7.5).
//
//   npm run couch:generate          # prepíše couch/fixtures/dosledujto_register/7x-gen-*.json
//
// Ručne písané fixtures (00–62) zostávajú, ako sú — sú to príklady, na ktorých
// stoja testy. Generované dáta pridávajú objem, aby sa dalo dizajnovať: krivky,
// „najviac sa píše", zabudnuté kauzy, Sieť do dvoch krokov s orezaním na 60.
//
// Pravidlá, ktoré platia aj tu:
//   - **všetko je fiktívne.** Priezviská sú z konvencie repozitára (Testovací,
//     Skúšobná, Vzorová, Pokusný, Modelový, Príkladná…), domény `*.example`,
//     IČO sa negeneruje vôbec — vymyslené osemciferné číslo môže patriť
//     skutočnej firme;
//   - každý zverejnený údaj má zdroj a zdroj je článok tej istej kauzy alebo
//     osoby, takže všetko prejde `validate_doc_update`;
//   - výstup je deterministický: rovnaký seed a rovnaký referenčný dátum dajú
//     bajt po bajte rovnaké súbory. Preto sa dá commitnúť a diff má zmysel.
//
// Referenčný dátum `REF` je „dnes" generovaných dát (budúce udalosti, ticho
// zabudnutých káuz). Je pevný, nie `new Date()`: s plávajúcim dátumom by každé
// spustenie dalo iné dáta. Keď dáta zostarnú, posuň `REF` a pregeneruj.

import { createHash } from "node:crypto";
import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson } from "./tools/format.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "dosledujto_register");
const SEED = 20261115;
export const REF = "2026-11-15";
const MODERATOR = "user:0192a1b0-7c0c-7000-8000-000000000002";
const STAMP = "2026-11-15T09:00:00Z";

const COUNTS = { persons: 320, orgs: 126, cases: 50, minArticles: 1950 };

// ── Náhoda so seedom ──────────────────────────────────────────────────────────

/** mulberry32 — malý, rýchly a hlavne deterministický generátor. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
function sample(list, n) {
  const copy = [...list];
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

// ── Identifikátory a dátumy ──────────────────────────────────────────────────

// Ručné fixtures majú `0192a1b0-7c0X-…`, generované `0193b000-7c0X-…`. Stredný
// blok je rovnaký ako pri ručných (02 článok, 03 osoba, 04 subjekt, 05 kauza,
// 06 rola, 07 udalosť, 08 konanie, 09 prepojenie), aby sa dal typ prečítať z id.
const TYPE_BLOCK = { article: "02", person: "03", org: "04", case: "05", role: "06", event: "07", proceeding: "08", link: "09" };
const counters = {};
function id(type) {
  counters[type] = (counters[type] ?? 0) + 1;
  return `${type}:0193b000-7c${TYPE_BLOCK[type]}-7000-8000-${String(counters[type]).padStart(12, "0")}`;
}

const DAY = 86_400_000;
const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const ms = (day) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day, n) => toDay(ms(day) + n * DAY);
const between = (from, to) => toDay(ms(from) + Math.floor(rand() * Math.max(1, ms(to) - ms(from))));
const minDay = (a, b) => (a < b ? a : b);

const sourced = (value, sources, asserted_at, extra = {}) => ({
  value, ...extra, sources, derived: false, derivation: null, disputed: [], asserted_at,
});
const meta = () => ({ created_at: STAMP, updated_at: STAMP, created_by: MODERATOR, updated_by: MODERATOR });

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// ── Mená ──────────────────────────────────────────────────────────────────────

// Priezvisko ako prídavné meno, aby sa dalo prechýliť: [mužský, ženský, genitív m., genitív ž.].
const SURNAMES = [
  ["Testovací", "Testovacia", "Testovacieho", "Testovacej"],
  ["Skúšobný", "Skúšobná", "Skúšobného", "Skúšobnej"],
  ["Vzorový", "Vzorová", "Vzorového", "Vzorovej"],
  ["Pokusný", "Pokusná", "Pokusného", "Pokusnej"],
  ["Modelový", "Modelová", "Modelového", "Modelovej"],
  ["Príkladný", "Príkladná", "Príkladného", "Príkladnej"],
  ["Ukážkový", "Ukážková", "Ukážkového", "Ukážkovej"],
  ["Cvičný", "Cvičná", "Cvičného", "Cvičnej"],
  ["Overovací", "Overovacia", "Overovacieho", "Overovacej"],
  ["Náhradný", "Náhradná", "Náhradného", "Náhradnej"],
  ["Šablónový", "Šablónová", "Šablónového", "Šablónovej"],
  ["Pracovný", "Pracovná", "Pracovného", "Pracovnej"],
];
const MALE = ["Ján", "Peter", "Martin", "Tomáš", "Michal", "Juraj", "Marek", "Pavol", "Róbert", "Igor",
  "Miroslav", "Ľubomír", "Dušan", "Stanislav", "Andrej", "Vladimír", "Rastislav", "Matej", "Ondrej", "Branislav"];
const FEMALE = ["Eva", "Mária", "Jana", "Zuzana", "Katarína", "Lucia", "Ivana", "Monika", "Andrea", "Simona",
  "Veronika", "Daniela", "Martina", "Alžbeta", "Lenka", "Petra", "Barbora", "Dagmar", "Soňa", "Natália"];

const BIOS = [
  "Bývalý poslanec mestského zastupiteľstva v Testoviciach.",
  "Podnikateľ v stavebníctve, konateľ niekoľkých spoločností.",
  "Bývalý štátny tajomník rezortu skúšobníctva.",
  "Riaditeľ odboru verejného obstarávania na úrade.",
  "Policajný vyšetrovateľ, neskôr v súkromnom sektore.",
  "Starosta obce Vzorovce v dvoch volebných obdobiach.",
  "Členka predstavenstva štátnej spoločnosti.",
  "Advokát, zastupoval viacerých obvinených.",
  "Bývalý poslanec parlamentu.",
  "Manažér v energetike, predtým v samospráve.",
];

// ── Subjekty ─────────────────────────────────────────────────────────────────

const PARTIES = ["Strana Vzorová", "Hnutie Skúšobné", "Pokusná aliancia", "Modelová strana",
  "Príkladní demokrati", "Občianska Ukážka", "Cvičné hnutie", "Strana Overovacia"];
const INSTITUTIONS = ["Mesto Testovice", "Obec Vzorovce", "Ministerstvo skúšobníctva", "Úrad pre pokusy",
  "Správa ciest Testovice", "Nemocnica Skúšobná", "Fond modelových dotácií", "Kontrolný úrad Testovice",
  "Prokuratúra Skúšobná", "Polícia Vzorová", "Agentúra pre ukážky", "Samosprávny kraj Testovický",
  "Štátny podnik Vzorové lesy", "Úrad pre verejné skúšky", "Krajský úrad Pokusov", "Inšpektorát Modelov",
  "Ústav Príkladov", "Fond Cvičnej podpory", "Správa Overovacieho majetku", "Mesto Šablónovo"];
const CO_STEMS = ["Test", "Skúš", "Vzor", "Pokus", "Model", "Príklad", "Ukážk", "Cvič", "Overov", "Šablón"];
const CO_TAILS = ["Build", "Invest", "Consult", "Trade", "Energy", "Agro", "Med", "Data", "Logistic", "Holding", "Stav", "Group"];
const CO_FORMS = ["s.r.o.", "a.s.", "s.r.o.", "s.r.o."];

// ── Médiá a úrady (zdroje) ───────────────────────────────────────────────────

const MEDIA = [
  ["Testoviny.sk", "testoviny.example"], ["Denník Skúška", "dennik-skuska.example"],
  ["Vzorové noviny", "vzorove-noviny.example"], ["Pokusný týždeň", "pokusny-tyzden.example"],
  ["Modelové správy", "modelove-spravy.example"], ["Rádio Príklad", "radio-priklad.example"],
  ["TV Ukážka", "tv-ukazka.example"], ["Cvičný portál", "cvicny-portal.example"],
  ["Overovací denník", "overovaci-dennik.example"], ["Šablóna dnes", "sablona-dnes.example"],
  ["Regionálne Testovice", "regio-testovice.example"], ["Týždenník Náhrada", "tyzdennik-nahrada.example"],
];
const OFFICIAL = [
  ["Okresný súd Testovice", "sud-testovice.example"], ["Krajský súd Testovice", "ks-testovice.example"],
  ["Špecializovaný trestný súd Skúšobný", "sts-skusobny.example"], ["Prokuratúra Skúšobná", "prokuratura-skusobna.example"],
  ["Polícia Vzorová", "policia-vzorova.example"], ["Kontrolný úrad Testovice", "kontrola-testovice.example"],
  ["Register zmlúv Testovice", "zmluvy-testovice.example"],
];
const COURTS = ["Okresný súd Testovice", "Krajský súd Testovice", "Špecializovaný trestný súd Skúšobný"];

// ── Kauzy ─────────────────────────────────────────────────────────────────────

const CASE_SUBJECTS = [
  "nemocnica", "diaľnica", "tender na IT systém", "dotácie pre farmy", "pozemky pri meste", "eurofondy",
  "nákup sanitiek", "obchvat", "kotolňa", "štadión", "zimná údržba", "dodávky liekov", "školské tablety",
  "rekonštrukcia úradu", "lesy", "parkovací systém", "skládka", "mestská doprava", "energetický podnik",
  "nájomné byty", "kamerový systém", "očkovacie centrum", "čistička", "prístav", "letisko",
  "opravy ciest", "vodovod", "sociálne služby", "kúpalisko", "konzultačné zmluvy", "nákup áut",
  "mestská televízia", "zateplenie škôl", "osvetlenie", "kasárne", "kúpa budovy", "poradenstvo pre fond",
  "propagačné kampane", "cyklotrasa", "výstavisko", "trhovisko",
];
const NONMONEY_SUBJECTS = {
  investigation_interference: ["odvolaní vyšetrovatelia", "zastavené spisy", "presun vyšetrovateľov"],
  abuse_of_power: ["previerky úradníkov", "služobné autá"],
  elections_party_finance: ["skrytá kampaň", "pôžička strane"],
  conflict_of_interest: ["poradca ministra"],
  other: ["únik dokumentov"],
};
const IMPACT = {
  investigation_interference: [[6, "odvolaných vyšetrovateľov", "2 zrušené obvinenia politikov"], [14, "zastavených spisov", null], [4, "presunutí vyšetrovatelia", "počas prebiehajúceho stíhania"]],
  abuse_of_power: [[23, "úradníkov preverovaných bez dôvodu", null], [9, "služobných áut na súkromné účely", null]],
  elections_party_finance: [[3, "neohlásené kampane", "pred voľbami 2023"], [1, "nevrátená pôžička", "od firmy napojenej na stranu"]],
  conflict_of_interest: [[11, "zmlúv s firmou blízkej osoby", null]],
  other: [[40, "uniknutých dokumentov", null]],
};
// Fiktívne obce. Názov kauzy je „predmet + miesto" („Kauza Obchvat Pokusov"),
// nie prídavné meno — to by sa muselo zhodovať v rode s predmetom.
const PLACES = ["Testovice", "Vzorovce", "Skúšobné", "Pokusov", "Modelovo", "Príkladovce", "Ukážkovo",
  "Cvičná Ves", "Overovice", "Šablónovo"];

// Plán káuz: bucket → koľko. Fáza vyplýva z bucketu; `none` je bez fázy.
const MONEY_PLAN = [
  ["none", 5], ["investigation", 7], ["charge", 6], ["trial", 9],
  ["convicted", 5], ["acquitted", 3], ["discontinued", 3], ["lapsed", 3],
];
const PHASE_OF = {
  none: [null], investigation: ["investigation"], charge: ["charges"], trial: ["indictment", "trial", "appeal"],
  convicted: ["convicted"], acquitted: ["acquitted"], discontinued: ["halted"], lapsed: ["lapsed"],
};
const CLOSED = new Set(["convicted", "acquitted", "discontinued", "lapsed"]);

// ── Generovanie ───────────────────────────────────────────────────────────────

const docs = { orgs: [], persons: [], cases: [], roles: [], events: [], proceedings: [], links: [], articles: [] };

// Subjekty
const usedOrgNames = new Set();
function org(kind, name) {
  usedOrgNames.add(name);
  const doc = {
    _id: id("org"), type: "org", kind, name,
    name_variants: [name, fold(name)].filter((v, i, a) => a.indexOf(v) === i),
    slug: slugify(name), ico: null, publish_state: "published", ...meta(),
  };
  docs.orgs.push(doc);
  return doc;
}
const parties = PARTIES.map((n) => org("party", n));
const institutions = INSTITUTIONS.map((n) => org("institution", n));
const companies = [];
while (docs.orgs.length < COUNTS.orgs) {
  const name = `${pick(CO_STEMS)}${pick(CO_TAILS)} ${pick(CO_FORMS)}`;
  if (usedOrgNames.has(name)) continue;
  companies.push(org("company", name));
}

// Osoby
const usedNames = new Set();
while (docs.persons.length < COUNTS.persons) {
  const female = chance(0.4);
  const first = pick(female ? FEMALE : MALE);
  const s = pick(SURNAMES);
  const last = female ? s[1] : s[0];
  const full = `${first} ${last}`;
  if (usedNames.has(full)) continue;
  usedNames.add(full);
  const genitiveFirst = female ? first.replace(/a$/, "y") : `${first}a`;
  const genitive = `${genitiveFirst} ${female ? s[3] : s[2]}`;
  docs.persons.push({
    _id: id("person"), type: "person", full_name: full,
    name_variants: [full, genitive, last, fold(full), `${first[0]}. ${last[0]}.`],
    slug: slugify(full),
    birth_year: int(1950, 1992),
    short_bio: null, // doplní sa so zdrojom nižšie
    publish_state: "published",
    _female: female,
    ...meta(),
  });
}

// Články: zbierka s pomocnými poliami, ktoré sa pred zápisom odstránia.
function article({ day, caseDoc = null, persons = [], orgs = [], official = false, title, excerpt }) {
  const [publisher, domain] = official ? pick(OFFICIAL) : pick(MEDIA);
  const _id = id("article");
  const n = counters.article;
  const slug = `${slugify(title).slice(0, 60)}-${n}`;
  const url = `https://${domain}/${official ? "dokumenty" : "clanky"}/${day.slice(0, 4)}/${slug}`;
  const body = `${excerpt} Text je vymyslený a slúži len na testovanie registra.`;
  const doc = {
    _id, type: "article", kind: official ? "official" : "media", url, canonical_url: url,
    archive_url: chance(0.3) ? `https://web.archive.org/web/${day.replace(/-/g, "")}/${url}` : null,
    title, publisher, published_at: `${day}T${String(int(5, 20)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00Z`,
    fetched_at: STAMP, author: official ? null : pick(["Redakcia", "TASR (vzor)", "Autor Vzorový", "Autorka Testovacia"]),
    excerpt, body,
    content_hash: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    status: "linked",
    case_ids: caseDoc ? [caseDoc._id] : [],
    person_ids: persons.map((p) => p._id),
    org_ids: orgs.map((o) => o._id),
    feed_id: null, paywall: !official && chance(0.15),
    created_at: STAMP, updated_at: STAMP,
  };
  docs.articles.push(doc);
  return doc;
}

const MEDIA_TITLES = [
  (c) => `Nové zistenia v kauze ${c}`, (c) => `Kauza ${c}: čo vieme po roku`, (c) => `V kauze ${c} pribudli svedkovia`,
  (c) => `Opozícia žiada vysvetlenie v kauze ${c}`, (c) => `Kauza ${c} sa vracia na program`, (c) => `Firma z kauzy ${c} mlčí`,
  (c) => `Analýza: kde sa stratili peniaze v kauze ${c}`, (c) => `Kauza ${c}: obhajoba spochybňuje dôkazy`,
  (c) => `Čo ukázali zmluvy v kauze ${c}`, (c) => `Kauza ${c} a otázky, na ktoré zatiaľ nikto neodpovedal`,
];
const OFFICIAL_TITLES = [
  (c, f) => `Uznesenie o vznesení obvinenia, ${c}`, (c, f) => `Oznámenie o podaní obžaloby, sp. zn. ${f}`,
  (c, f) => `Rozsudok v trestnej veci sp. zn. ${f}`, (c, f) => `Kontrolná správa k zákazke ${c}`,
  (c, f) => `Zmluva zverejnená v registri, ${c}`, (c, f) => `Tlačová správa prokuratúry k veci ${c}`,
];

// Kauzy
let usedCaseTitles = new Set();
function caseTitle(subject) {
  for (;;) {
    const title = `Kauza ${subject[0].toUpperCase()}${subject.slice(1)} ${pick(PLACES)}`;
    if (!usedCaseTitles.has(title)) {
      usedCaseTitles.add(title);
      return title;
    }
  }
}

const plan = [];
for (const [bucket, n] of MONEY_PLAN) for (let i = 0; i < n; i++) plan.push({ bucket, kinds: ["public_money"] });
for (const [kind, subjects] of Object.entries(NONMONEY_SUBJECTS)) {
  subjects.forEach((subject, i) => {
    const bucket = pick(["none", "investigation", "charge", "trial", "discontinued"]);
    plan.push({ bucket, kinds: [kind], subject, impact: IMPACT[kind][i] });
  });
}
// Druhý druh pri časti finančných káuz — kauza môže mať viac druhov, prvý je hlavný.
for (const p of plan) {
  if (p.kinds[0] === "public_money" && chance(0.2)) p.kinds.push(pick(["abuse_of_power", "conflict_of_interest", "elections_party_finance"]));
}
while (plan.length > COUNTS.cases) plan.splice(int(0, MONEY_PLAN[0][1]), 1);

// Ktoré kauzy sú „zabudnuté" (otvorené, veľa článkov, rok ticho) a ktoré majú
// termín v najbližších 30 dňoch.
const openIdx = plan.map((p, i) => (CLOSED.has(p.bucket) ? -1 : i)).filter((i) => i >= 0);
const forgottenIdx = new Set(sample(openIdx.filter((i) => plan[i].kinds[0] === "public_money"), 4));
const upcomingIdx = sample(openIdx.filter((i) => !forgottenIdx.has(i) && plan[i].bucket === "trial"), 2);
const disputedIdx = new Set(sample(plan.map((p, i) => (p.kinds[0] === "public_money" ? i : -1)).filter((i) => i >= 0), 4));
const silentIdx = new Set(sample(openIdx.filter((i) => !forgottenIdx.has(i)), 3));

// Ústredné osoby so širokou sieťou (test orezania Siete na 60 uzlov).
const hubs = docs.persons.slice(0, 4);

const personPool = docs.persons.slice(4);
const caseOfPerson = new Map(); // person id → počet káuz (aby sa ľudia opakovali, ale nie všetci)

plan.forEach((p, index) => {
  const subject = p.subject ?? CASE_SUBJECTS[index % CASE_SUBJECTS.length];
  const title = caseTitle(subject);
  const forgotten = forgottenIdx.has(index);
  const start = forgotten ? between("2019-01-01", "2021-06-30") : between("2019-01-01", "2024-06-30");
  const closed = CLOSED.has(p.bucket);
  const phase = pick(PHASE_OF[p.bucket]);

  // Časová os: obvinenie → obžaloba → koniec. Každý ďalší krok je po
  // predchádzajúcom, takže žiadna rola nekončí skôr, než začala.
  const stage = ["investigation", "charge", "trial", "convicted", "acquitted", "discontinued", "lapsed"].indexOf(p.bucket);
  const charged = stage >= 1 && p.bucket !== "lapsed";
  const tried = stage >= 2 && !["discontinued", "lapsed"].includes(p.bucket);
  const chargeDay = between(addDays(start, 30), addDays(start, 300));
  const indictDay = between(addDays(chargeDay, 60), addDays(chargeDay, 400));
  const lastStep = tried ? indictDay : charged ? chargeDay : start;
  const end = forgotten
    ? between(addDays(lastStep, 120) > "2023-01-01" ? addDays(lastStep, 120) : "2023-01-01", "2025-06-30")
    : closed ? between(addDays(lastStep, 120), "2026-09-30") : REF;

  const caseDoc = { _id: id("case"), type: "case", title, slug: slugify(title) };
  docs.cases.push(caseDoc);

  // Ľudia a subjekty v kauze
  const people = sample(personPool, int(2, 7));
  if (index % 6 === 0) people.push(pick(hubs));
  for (const person of people) caseOfPerson.set(person._id, (caseOfPerson.get(person._id) ?? 0) + 1);
  const firms = sample(companies, int(1, 3));
  const institution = pick(institutions);

  // Články: hustota podľa toho, ako veľmi sa o kauze píše. Zabudnuté majú
  // veľa článkov v minulosti a potom ticho; „tiché" otvorené kauzy málo.
  const lastDay = minDay(end, REF);
  const total = forgotten ? int(28, 55) : silentIdx.has(index) ? int(4, 9) : int(14, 60);
  const caseArticles = [];
  const opener = article({
    day: start, caseDoc, persons: people.slice(0, 2), orgs: [firms[0], institution],
    title: `${title}: kontrola našla nezrovnalosti`,
    excerpt: `Kontrola v inštitúcii ${institution.name} upozornila na nezrovnalosti spojené so spoločnosťou ${firms[0].name}.`,
  });
  caseArticles.push(opener);
  for (let i = 1; i < total; i++) {
    // Rozloženie: viac článkov na začiatku a pri udalostiach, menej neskôr.
    const t = Math.pow(rand(), 1.6);
    const day = toDay(ms(start) + t * (ms(lastDay) - ms(start)));
    const official = chance(0.28);
    const fileNo = `${int(1, 9)}T/${int(10, 99)}/${day.slice(0, 4)}`;
    const name = title.replace(/^Kauza /, "");
    caseArticles.push(article({
      day, caseDoc, official,
      persons: sample(people, int(0, Math.min(3, people.length))),
      orgs: chance(0.4) ? [pick(firms)] : [],
      title: official ? pick(OFFICIAL_TITLES)(name, fileNo) : pick(MEDIA_TITLES)(name),
      excerpt: official
        ? `Úradný dokument k veci ${name}. Obsahuje opis skutku a právnu kvalifikáciu.`
        : `Redakcia sa venuje kauze ${name} a reakciám dotknutých osôb a inštitúcie ${institution.name}.`,
    }));
  }
  caseArticles.sort((a, b) => a.published_at.localeCompare(b.published_at));
  const first = caseArticles[0];
  const latest = caseArticles[caseArticles.length - 1];
  const officialOne = caseArticles.find((a) => a.kind === "official") ?? latest;
  const at = (a) => a.published_at.slice(0, 10);

  // Polia kauzy
  caseDoc.summary = sourced(
    `${title.replace(/^Kauza /, "")} — kauza okolo inštitúcie ${institution.name} a spoločnosti ${firms[0].name}. ` +
      "Text je vymyslený, slúži na testovanie registra.",
    [first._id], at(first),
  );
  caseDoc.status = sourced(closed ? "closed" : "open", [latest._id], at(latest));
  if (phase) caseDoc.phase = sourced(phase, [officialOne._id], at(officialOne));
  caseDoc.kind = sourced(p.kinds, [first._id], at(first));
  if (p.kinds[0] === "public_money") {
    const amount = int(5, 4000) * 10_000_000 + int(0, 99) * 100_000; // 0,5 mil. – 400 mil. €
    caseDoc.amount = sourced(amount, [first._id], at(first), { unit: "EUR" });
    if (disputedIdx.has(index)) {
      const other = caseArticles[Math.min(1, caseArticles.length - 1)];
      caseDoc.amount.disputed = [{ value: Math.round(amount * (0.5 + rand() * 0.4) / 100) * 100, sources: [other._id] }];
    }
    if ((p.bucket === "convicted" || (p.bucket === "trial" && chance(0.3))) && chance(0.8)) {
      caseDoc.recovered_amount = sourced(Math.round(amount * (0.05 + rand() * 0.4) / 100) * 100, [officialOne._id], at(officialOne), { unit: "EUR" });
    }
  } else if (p.impact) {
    const [value, unit, note] = p.impact;
    caseDoc.impact = sourced({ value, unit, ...(note ? { note } : {}) }, [first._id], at(first));
  }
  caseDoc.started_on = start;
  caseDoc.closed_on = closed ? end : null;
  caseDoc.tags = sample(["verejne-obstaravanie", "dotacie", "pozemky", "samosprava", "doprava"], int(0, 2));
  caseDoc.publish_state = "published";
  Object.assign(caseDoc, meta());

  // Konania a udalosti
  const proceedings = [];

  if (tried) {
    const court = pick(COURTS);
    const fileNumber = `${int(1, 9)}T/${int(10, 99)}/${indictDay.slice(0, 4)}`;
    proceedings.push({
      _id: id("proceeding"), type: "proceeding", case_id: caseDoc._id, court, file_number: fileNumber,
      phase: phase && ["indictment", "trial", "appeal", "convicted", "acquitted"].includes(phase) ? phase : "trial",
      decisions: closed ? [{
        decided_on: end, outcome: p.bucket === "convicted" ? "conviction" : "acquittal",
        summary: p.bucket === "convicted" ? "Súd uznal obžalovaných vinnými." : "Súd obžalovaných oslobodil.",
        final: true, sources: [latest._id],
      }] : [],
      sources: [officialOne._id],
      person_ids: people.slice(0, 2).map((x) => x._id), org_ids: [],
      ...meta(),
    });
  }
  docs.proceedings.push(...proceedings);

  const event = (day, kind, category, eventTitle, description, source, proceeding = null, persons = []) =>
    docs.events.push({
      _id: id("event"), type: "event", case_id: caseDoc._id, occurred_on: day, kind, category,
      title: eventTitle, description, sources: [source._id], person_ids: persons.map((x) => x._id),
      proceeding_id: proceeding ? proceeding._id : null, ...meta(),
    });
  const nearest = (day) => caseArticles.reduce((best, a) => (Math.abs(ms(at(a)) - ms(day)) < Math.abs(ms(at(best)) - ms(day)) ? a : best), first);

  event(start, "past", "other", "Prvé zistenia kontroly", `Kontrola v inštitúcii ${institution.name} zverejnila zistenia.`, first);
  if (stage >= 1 || p.bucket === "lapsed") {
    event(chargeDay, "past", "charge", "Vznesenie obvinenia", "Vyšetrovateľ vzniesol obvinenie.", nearest(chargeDay), null, people.slice(0, 2));
  }
  if (chance(0.3)) event(between(start, lastDay), "past", "seizure", "Zaistenie majetku", "Polícia zaistila majetok obvinených.", nearest(lastDay));
  if (tried) {
    const pr = proceedings[0];
    event(indictDay, "past", "hearing", `Podanie obžaloby na ${pr.court}`, `Vec vedená pod sp. zn. ${pr.file_number}.`, officialOne, pr);
    const hearings = int(1, 4);
    for (let h = 0; h < hearings; h++) {
      const day = between(addDays(indictDay, 60), addDays(lastDay, -1));
      if (day > indictDay) event(day, "past", "hearing", "Hlavné pojednávanie", "Súd pokračoval vo výsluchoch svedkov.", nearest(day), pr);
    }
    if (closed) event(end, "past", "verdict", p.bucket === "convicted" ? "Odsudzujúci rozsudok" : "Oslobodzujúci rozsudok",
      "Rozsudok nadobudol právoplatnosť.", latest, pr);
  }
  if (p.bucket === "discontinued") event(end, "past", "other", "Zastavenie trestného stíhania", "Prokurátor stíhanie zastavil.", latest);
  if (p.bucket === "lapsed") event(end, "past", "other", "Vec odložená pre premlčanie", "Trestné stíhanie nemožno začať pre premlčanie.", latest);

  // Budúce termíny. Dve kauzy majú pojednávanie v najbližších 30 dňoch.
  if (upcomingIdx.includes(index) && proceedings[0]) {
    event(addDays(REF, upcomingIdx.indexOf(index) === 0 ? 5 : 19), "expected", "hearing", "Hlavné pojednávanie",
      "Termín určil súd.", latest, proceedings[0]);
  } else if (tried && !closed && chance(0.5)) {
    event(addDays(REF, int(40, 300)), "expected", "hearing", "Pokračovanie hlavného pojednávania", "Termín určil súd.", latest, proceedings[0]);
  }

  // Roly. História sa neprepisuje: obvinenie sa uzavrie a vznikne obžaloba,
  // obžaloba sa uzavrie a vznikne rozsudok.
  const accused = people.slice(0, Math.min(people.length, int(1, 3)));
  const role = (person, roleName, from, to, source, note = null) => docs.roles.push({
    _id: id("role"), type: "role", case_id: caseDoc._id, person_id: person._id, role: roleName,
    sources: [source._id], valid_from: from, valid_to: to, note, ...meta(),
  });
  accused.forEach((person, i) => {
    if (p.bucket === "none") {
      // Bez trestného konania nie je nikto podozrivý — len figuruje.
      role(person, "other", start, null, first, "Figuruje v zisteniach kontroly a médií.");
      return;
    }
    if (!charged) {
      role(person, "suspect", start, closed ? end : null, first);
      return;
    }
    role(person, "accused", chargeDay, tried ? indictDay : closed ? end : null, nearest(chargeDay));
    if (!tried) return;
    if (!closed) {
      role(person, "indicted", indictDay, null, officialOne);
      return;
    }
    role(person, "indicted", indictDay, end, officialOne);
    // Viac obvinených s rôznym koncom: pri časti odsúdených káuz je jeden oslobodený.
    const outcome = p.bucket === "convicted" && i > 0 && chance(0.5) ? "acquitted" : p.bucket;
    role(person, outcome === "convicted" ? "convicted" : "acquitted", end, null, latest);
  });
  for (const person of people.slice(accused.length)) {
    role(person, pick(["witness", "witness", "victim", "other"]), between(start, lastDay), null, nearest(start));
  }
  // Firma ako obvinená (aj subjekt môže byť v kauze stíhaný).
  if (charged && chance(0.25)) {
    docs.roles.push({
      _id: id("role"), type: "role", case_id: caseDoc._id, org_id: firms[0]._id, role: "accused",
      sources: [nearest(chargeDay)._id], valid_from: chargeDay, valid_to: null, note: null, ...meta(),
    });
  }

  caseDoc._people = people;
  caseDoc._firms = firms;
  caseDoc._institution = institution;
});

// ── Prepojenia ───────────────────────────────────────────────────────────────

const linkSeen = new Set();
function link(from, to, kind, source, from_day = null, to_day = null) {
  const key = `${from._id}|${to._id}|${kind}`;
  if (from._id === to._id || linkSeen.has(key)) return;
  linkSeen.add(key);
  docs.links.push({
    _id: id("link"), type: "link", from_id: from._id, to_id: to._id, kind,
    valid_from: from_day, valid_to: to_day, sources: [source._id], derived: false, derivation: null, ...meta(),
  });
}

// Profilový článok osoby — zdroj jej popisu a prepojení, ak nemá vlastnú kauzu.
const profileArticle = new Map();
function profileOf(person, orgs = []) {
  if (profileArticle.has(person._id)) return profileArticle.get(person._id);
  const day = between("2019-01-01", "2026-10-31");
  const a = article({
    day, persons: [person], orgs,
    title: `Profil: ${person.full_name}`,
    excerpt: `${person.full_name} pôsobí vo verejnom živote aj v podnikaní. Prehľad funkcií a firiem.`,
  });
  profileArticle.set(person._id, a);
  return a;
}

for (const person of docs.persons) {
  // Členstvo v strane — asi pri tretine ľudí, niekedy už ukončené.
  if (chance(0.35)) {
    const party = pick(parties);
    const from = between("2010-01-01", "2022-12-31");
    link(person, party, "member", profileOf(person, [party]), from, chance(0.25) ? between(addDays(from, 200), "2026-06-30") : null);
  }
  // Štatutár alebo vlastník firmy.
  const roles = int(0, 2);
  for (let i = 0; i < roles; i++) {
    const firm = pick(companies);
    const from = between("2012-01-01", "2024-12-31");
    link(person, firm, pick(["statutory", "statutory", "owner", "ubo"]), profileOf(person, [firm]), from, chance(0.3) ? between(addDays(from, 300), "2026-06-30") : null);
  }
}
// Ústredné osoby: veľa firiem, strana, rodina a obchodní partneri.
hubs.forEach((hub, h) => {
  const firms = sample(companies, 14);
  for (const firm of firms) link(hub, firm, pick(["statutory", "owner", "ubo"]), profileOf(hub, [firm]), between("2012-01-01", "2023-12-31"));
  link(hub, parties[h % parties.length], "member", profileOf(hub), "2014-03-01", null);
  for (const partner of sample(personPool, 6)) link(hub, partner, pick(["business", "business", "family"]), profileOf(hub, []), between("2015-01-01", "2024-01-01"));
  // Ďalší ľudia v tých istých firmách, aby druhý krok Siete mal kam rásť.
  for (const firm of firms) {
    for (const other of sample(personPool, int(3, 6))) link(other, firm, pick(["statutory", "owner"]), profileOf(other, [firm]), between("2012-01-01", "2024-12-31"));
  }
});
// Firmy v kauzách majú štatutárov z ľudí v kauze.
for (const c of docs.cases) {
  for (const firm of c._firms) {
    const person = pick(c._people);
    link(person, firm, "statutory", profileOf(person, [firm]), between("2012-01-01", c.started_on), null);
  }
}

// ── Popis osoby so zdrojom ───────────────────────────────────────────────────

const firstMention = new Map();
for (const a of docs.articles) {
  for (const pid of a.person_ids) {
    const prev = firstMention.get(pid);
    if (!prev || a.published_at < prev.published_at) firstMention.set(pid, a);
  }
}
for (const person of docs.persons) {
  const source = firstMention.get(person._id) ?? profileOf(person);
  let bio = pick(BIOS);
  if (person._female) bio = bio.replace("Bývalý", "Bývalá").replace("Podnikateľ", "Podnikateľka").replace("Policajný vyšetrovateľ", "Policajná vyšetrovateľka").replace("Advokát", "Advokátka").replace("Manažér", "Manažérka").replace("Riaditeľ", "Riaditeľka").replace("Starosta", "Starostka").replace("zastupoval", "zastupovala");
  person.short_bio = sourced(bio, [source._id], source.published_at.slice(0, 10));
  // Pár osôb ako rozpracovaný koncept — aj to musí web zvládnuť (neukázať).
  if (chance(0.03) && !caseOfPerson.has(person._id)) person.publish_state = "draft";
}

// ── Denormalizácia kauzy (rovnako ako syncCaseEntities) ──────────────────────

const partyIds = new Set(parties.map((p) => p._id));
for (const c of docs.cases) {
  const personIds = [...new Set(docs.roles.filter((r) => r.case_id === c._id && r.person_id).map((r) => r.person_id))];
  const party = new Set();
  for (const l of docs.links) {
    if (l.kind === "member" && !l.valid_to && personIds.includes(l.from_id) && partyIds.has(l.to_id)) party.add(l.to_id);
  }
  c.person_ids = personIds;
  c.party_ids = [...party];
}

// Nedávna vlna článkov pri piatich otvorených kauzách — aby mal rebríček „O čom
// sa najviac píše" za 30 dní a 12 mesiacov čo ukázať. Generuje sa až tu, na
// konci, aby sa id skôr vytvorených dokumentov nezmenili.
const lively = sample(docs.cases.filter((c, i) => !CLOSED.has(plan[i].bucket) && !forgottenIdx.has(i)), 5);
lively.forEach((c, rank) => {
  const n = 14 - rank * 2;
  const name = c.title.replace(/^Kauza /, "");
  for (let i = 0; i < n; i++) {
    const official = chance(0.15);
    article({
      day: addDays(REF, -int(1, rank < 2 ? 25 : 60)), caseDoc: c, official,
      persons: sample(c._people, int(0, Math.min(2, c._people.length))),
      title: official ? pick(OFFICIAL_TITLES)(name, `${int(1, 9)}T/${int(10, 99)}/2026`) : pick(MEDIA_TITLES)(name),
      excerpt: `Redakcia sa venuje kauze ${name} a reakciám dotknutých osôb.`,
    });
  }
});

// Doplnkové články bez kauzy (o firmách, stranách), kým nie je dosť zdrojov.
while (docs.articles.length < COUNTS.minArticles) {
  const o = pick(docs.orgs);
  article({
    day: between("2019-01-01", REF), orgs: [o], official: chance(0.2),
    title: `${o.name}: výročná správa a zmeny vo vedení`,
    excerpt: `Prehľad hospodárenia a zmien vo vedení subjektu ${o.name}.`,
  });
}

// ── Zápis ─────────────────────────────────────────────────────────────────────

const clean = (doc) => Object.fromEntries(Object.entries(doc).filter(([k]) => !k.startsWith("_") || k === "_id"));
const files = {
  "70-gen-orgs.json": docs.orgs, "71-gen-persons.json": docs.persons, "72-gen-cases.json": docs.cases,
  "73-gen-roles.json": docs.roles, "74-gen-events.json": docs.events, "75-gen-proceedings.json": docs.proceedings,
  "76-gen-links.json": docs.links, "77-gen-articles.json": docs.articles.sort((a, b) => a._id.localeCompare(b._id)),
};
for (const old of readdirSync(OUT).filter((f) => /^7\d-gen-.*\.json$/.test(f))) unlinkSync(path.join(OUT, old));
for (const [name, list] of Object.entries(files)) writeFileSync(path.join(OUT, name), formatJson(list.map(clean)));

const summary = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length]));
console.log(summary);

// Request shapes. Nothing reaches the store without passing through one of
// these — the enums repeat what validate_doc_update enforces, so a bad value is
// a readable 422 instead of a database rejection.

import { z } from "zod";

export const PUBLISH_STATES = ["draft", "published", "hidden"];
export const CASE_STATUSES = ["open", "closed"];
// Fázy konania. Pôvodné `final` (právoplatné) sa rozdelilo na odsúdenie
// a oslobodenie — sú to dva opačné konce a metrika ich musí vedieť rozlíšiť —
// a pribudlo `lapsed` (premlčané alebo odložené). Rozhodnutie vlastníka
// z 15. 11. 2026, `packages/web/README.md`.
export const CASE_PHASES = [
  "investigation", "charges", "indictment", "trial", "appeal",
  "convicted", "acquitted", "halted", "lapsed",
];
// Segment metriky „Peniaze v kauzách". Mapovanie fáza → segment drží číselník
// `phase` (pole `bucket`), nie kód, aby ho vedel moderátor upraviť. Kauza bez
// fázy patrí do `none` (bez trestného konania).
export const PHASE_BUCKETS = [
  "none", "investigation", "charge", "trial", "convicted", "acquitted", "discontinued", "lapsed",
];
export const OPEN_BUCKETS = ["none", "investigation", "charge", "trial"];
// Druh kauzy. Kauza môže mať viac druhov, prvý je hlavný.
export const CASE_KINDS = [
  "public_money", "investigation_interference", "abuse_of_power",
  "elections_party_finance", "conflict_of_interest", "other",
];
export const ROLE_KINDS = [
  "suspect", "accused", "indicted", "convicted", "acquitted", "witness", "victim",
  "investigator", "prosecutor", "judge", "other",
];
export const LINK_KINDS = ["member", "statutory", "owner", "ubo", "family", "business", "other"];
export const EVENT_KINDS = ["past", "expected"];
export const EVENT_CATEGORIES = ["charge", "hearing", "verdict", "appeal", "seizure", "other"];
export const ARTICLE_KINDS = ["media", "official"];
export const ARTICLE_STATUSES = ["candidate", "processed", "linked", "rejected"];
export const SUGGESTION_STATUSES = ["pending", "accepted", "rejected", "needs_info"];
export const ORG_KINDS = ["party", "company", "institution"];
export const USER_ROLES = ["user", "moderator", "admin", "superadmin"];
export const TARGET_TYPES = ["case", "person", "org"];
export const FREQUENCIES = ["instant", "daily", "weekly"];
// Číselníky (admin-zadanie.md §9). Dva si obsah určujú samy, dva sú viazané na
// enum, ktorý stráži `validate_doc_update` — tam číselník drží iba slovenský
// názov ku kódu, lebo hodnotu mimo enumu by databáza odmietla.
export const CODELIST_KINDS = ["court", "case_tag", "event_category", "link_type", "phase", "case_kind"];
export const CODELIST_ENUMS = {
  event_category: EVENT_CATEGORIES, link_type: LINK_KINDS, phase: CASE_PHASES, case_kind: CASE_KINDS,
};
export const LEVELS = ["all", "significant"];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "očakáva sa dátum v tvare YYYY-MM-DD");
const docId = (type) =>
  z.string().regex(new RegExp(`^${type}:.+`), `očakáva sa id v tvare ${type}:<uuid7>`);

/** A sourced value as it arrives from a moderator. */
export const sourcedInput = z
  .object({
    value: z.any(),
    unit: z.string().optional(),
    sources: z.array(docId("article")).default([]),
    derived: z.boolean().default(false),
    derivation: z.string().nullable().default(null),
    disputed: z
      .array(z.object({ value: z.any(), sources: z.array(docId("article")).min(1) }))
      .default([]),
    asserted_at: isoDate.nullable().default(null),
  })
  .refine((v) => !v.derived || (v.derivation && v.derivation.length > 10), {
    message: "odvodený údaj musí opísať postup odvodenia — je to naše tvrdenie, nie citácia",
    path: ["derivation"],
  });

// ── Auth and profile ──────────────────────────────────────────────────────────

export const registerBody = z.object({
  email: z.string().email().max(254),
  // Length beats composition rules; argon2id does the rest.
  password: z.string().min(10, "heslo musí mať aspoň 10 znakov").max(200),
  display_name: z.string().min(2).max(80).optional(),
});

export const loginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const profileBody = z
  .object({
    display_name: z.string().min(2).max(80).optional(),
    notification_prefs: z
      .object({
        frequency: z.enum(FREQUENCIES).optional(),
        level: z.enum(LEVELS).optional(),
      })
      .optional(),
    current_password: z.string().max(200).optional(),
    new_password: z.string().min(10).max(200).optional(),
  })
  .refine((v) => !v.new_password || v.current_password, {
    message: "zmena hesla vyžaduje súčasné heslo",
    path: ["current_password"],
  });

// ── Suggestions ───────────────────────────────────────────────────────────────

export const suggestionBody = z.object({
  // A suggestion without a source is not accepted — for humans and bots alike
  // (produktové zadanie §4.4).
  source_urls: z.array(z.string().url()).min(1, "podnet musí obsahovať aspoň jeden zdroj").max(20),
  comment: z.string().max(4000).optional(),
  path: z.string().max(120).nullable().optional(),
  proposed_value: z.any().optional(),
  submitter_email: z.string().email().optional(),
});

export const suggestionAcceptBody = z.object({
  edited_value: z.any().optional(),
  note: z.string().max(2000).optional(),
});

export const suggestionRejectBody = z.object({
  reason: z.string().min(3, "zamietnutie musí mať dôvod").max(2000),
});

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subscriptionBody = z.object({
  target_type: z.enum(TARGET_TYPES),
  target_id: z.string().min(3),
  frequency: z.enum(FREQUENCIES).default("daily"),
  level: z.enum(LEVELS).default("all"),
});

// ── Editorial writes ──────────────────────────────────────────────────────────

export const caseCreateBody = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug smie obsahovať len a-z, 0-9 a pomlčku").max(120),
  summary: sourcedInput.optional(),
  status: sourcedInput.optional(),
  phase: sourcedInput.optional(),
  amount: sourcedInput.optional(),
  kind: sourcedInput.optional(),
  impact: sourcedInput.optional(),
  recovered_amount: sourcedInput.optional(),
  started_on: isoDate.optional(),
  closed_on: isoDate.nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
}).superRefine((body, ctx) => {
  for (const [field, shape] of Object.entries(CASE_VALUE_SHAPES)) {
    const v = body[field]?.value;
    const problem = v === null || v === undefined ? null : shape(v);
    if (problem) ctx.addIssue({ code: "custom", path: [field, "value"], message: problem });
  }
});

export const personCreateBody = z.object({
  full_name: z.string().min(3).max(160),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(120),
  // Inflected and transliterated forms; the matcher depends on these more than
  // on anything Lucene does (backend-zadanie.md §2.2).
  name_variants: z.array(z.string().max(160)).max(50).default([]),
  birth_year: z.number().int().min(1900).max(2100).nullable().optional(),
  short_bio: sourcedInput.optional(),
});

export const orgCreateBody = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(120),
  kind: z.enum(ORG_KINDS),
  ico: z.string().max(20).nullable().optional(),
  name_variants: z.array(z.string().max(200)).max(50).default([]),
});

/**
 * Tvar hodnoty pri poliach kauzy, ktoré nie sú obyčajný text. Rovnaké pravidlá
 * stráži `validate_doc_update`; tu sú preto, aby moderátor dostal chybu
 * s názvom poľa. Vracia text chyby alebo null.
 *
 * @type {Record<string, (v: any) => string|null>}
 */
export const CASE_VALUE_SHAPES = {
  kind: (v) =>
    Array.isArray(v) && v.every((k) => CASE_KINDS.includes(k))
      ? null
      : `druh kauzy je zoznam kódov: ${CASE_KINDS.join(", ")}`,
  impact: (v) =>
    v && typeof v === "object" && typeof v.value === "number" && typeof v.unit === "string" && v.unit
      ? null
      : "dopad je { value: číslo, unit: jednotka, note?: poznámka }",
  recovered_amount: (v) =>
    Number.isInteger(v) && v >= 0 ? null : "vrátená alebo zaistená suma je celé číslo v centoch",
  amount: (v) => (Number.isInteger(v) && v >= 0 ? null : "suma je celé číslo v centoch"),
  phase: (v) => (CASE_PHASES.includes(v) ? null : `fáza konania je jedna z: ${CASE_PHASES.join(", ")}`),
  status: (v) => (CASE_STATUSES.includes(v) ? null : `stav kauzy je jeden z: ${CASE_STATUSES.join(", ")}`),
};

/**
 * Every editorial PATCH carries a reason — it ends up in the audit log.
 *
 * The patch itself is an open object, because a moderator edits arbitrary
 * fields. Anything shaped like a sourced value is still checked against
 * `sourcedInput`: the database would reject a malformed one anyway, and a
 * validation error that names the field beats a CouchDB `forbidden`.
 */
export const patchBody = z
  .object({
    patch: z.record(z.string(), z.any()),
    reason: z.string().min(3, "úprava musí mať dôvod").max(500),
    rev: z.string().optional(),
  })
  .superRefine((body, ctx) => {
    for (const [field, value] of Object.entries(body.patch)) {
      if (!value || typeof value !== "object" || !Array.isArray(value.sources)) continue;

      const result = sourcedInput.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            path: ["patch", field, ...issue.path],
            message: issue.message,
          });
        }
        continue;
      }

      const shape = CASE_VALUE_SHAPES[field];
      const problem = shape && value.value !== null && value.value !== undefined ? shape(value.value) : null;
      if (problem) ctx.addIssue({ code: "custom", path: ["patch", field, "value"], message: problem });
    }
  });

export const roleBody = z
  .object({
  // Rola viaže ku kauze osobu **alebo** subjekt — aj firma môže byť v kauze
  // obvinená. Práve jedno z dvoch; databáza to stráži rovnako.
  person_id: docId("person").optional(),
  org_id: docId("org").optional(),
  role: z.enum(ROLE_KINDS),
  sources: z.array(docId("article")).min(1, "rola bez zdroja sa nezapisuje"),
  valid_from: isoDate,
  valid_to: isoDate.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  // Closing the previous role instead of overwriting it: history is not
  // rewritten (produktové zadanie §6).
  supersedes: docId("role").optional(),
  })
  .refine((v) => Boolean(v.person_id) !== Boolean(v.org_id), {
    message: "rola patrí osobe alebo subjektu, nie obom naraz",
    path: ["person_id"],
  });

export const eventBody = z.object({
  occurred_on: isoDate,
  kind: z.enum(EVENT_KINDS),
  category: z.enum(EVENT_CATEGORIES),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  sources: z.array(docId("article")).min(1),
  person_ids: z.array(docId("person")).max(50).default([]),
  // Konanie, do ktorého udalosť patrí — kalendár podľa neho filtruje súd.
  proceeding_id: docId("proceeding").nullable().optional(),
});

export const proceedingBody = z.object({
  court: z.string().min(3).max(200),
  // The only practical key for matching an anonymised decision to a case.
  file_number: z.string().min(3).max(60),
  phase: z.enum(CASE_PHASES).optional(),
  decisions: z.array(z.record(z.string(), z.any())).default([]),
  sources: z.array(docId("article")).min(1),
  // Proti komu sa konanie vedie. Konanie visí na kauze, ale obvinení sú
  // menovite — inak sa z profilu osoby k jej konaniam nedá dostať.
  person_ids: z.array(docId("person")).max(100).default([]),
  org_ids: z.array(docId("org")).max(100).default([]),
});

export const linkBody = z
  .object({
    from_id: z.string().min(3),
    to_id: z.string().min(3),
    kind: z.enum(LINK_KINDS),
    valid_from: isoDate.nullable().optional(),
    valid_to: isoDate.nullable().optional(),
    sources: z.array(docId("article")).min(1),
    derived: z.boolean().default(false),
    derivation: z.string().max(2000).nullable().default(null),
  })
  .refine((v) => !v.derived || (v.derivation && v.derivation.length > 10), {
    message: "odvodené prepojenie musí opísať postup odvodenia",
    path: ["derivation"],
  });

export const articleBody = z.object({
  kind: z.enum(ARTICLE_KINDS).default("official"),
  url: z.string().url(),
  title: z.string().min(3).max(300),
  publisher: z.string().min(2).max(120),
  published_at: z.string().min(4),
  author: z.string().max(160).nullable().optional(),
  excerpt: z.string().max(2000).optional(),
  archive_url: z.string().url().nullable().optional(),
  case_ids: z.array(docId("case")).default([]),
  person_ids: z.array(docId("person")).default([]),
  org_ids: z.array(docId("org")).default([]),
});

export const articlePatchBody = z.object({
  kind: z.enum(ARTICLE_KINDS).optional(),
  status: z.enum(ARTICLE_STATUSES).optional(),
  case_ids: z.array(docId("case")).optional(),
  person_ids: z.array(docId("person")).optional(),
  // Zdroj hovorí aj o firmách, nielen o ľuďoch; bez tejto väzby by sa článok
  // k subjektu dal pripojiť len oklukou cez kauzu.
  org_ids: z.array(docId("org")).optional(),
  reason: z.string().min(3).max(500),
  rev: z.string().optional(),
});

/**
 * Úprava prepojenia. Ukončiť členstvo (`valid_to`) a zmazať prepojenie sú dve
 * rôzne veci — rovnako ako pri role.
 */
export const linkPatchBody = z.object({
  kind: z.enum(LINK_KINDS).optional(),
  valid_from: isoDate.nullable().optional(),
  valid_to: isoDate.nullable().optional(),
  sources: z.array(docId("article")).min(1, "aspoň jeden zdroj").optional(),
  note: z.string().max(1000).nullable().optional(),
  reason: z.string().min(3, "úprava musí mať dôvod").max(500),
  rev: z.string().optional(),
});

export const mergeBody = z.object({
  keep_id: docId("person"),
  merge_id: docId("person"),
  reason: z.string().min(3).max(500),
});

export const moderatorBody = z.object({
  user_id: docId("user"),
  reason: z.string().min(3).max(500).optional(),
});

export const userPatchBody = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(["active", "blocked"]).optional(),
  // Profil účtu upravuje superadmin komukoľvek, admin moderátorom a bežným
  // používateľom (admin-zadanie.md §2). E-mail je prihlasovacia identita a
  // nemení sa odtiaľto.
  display_name: z.string().min(2).max(80).nullable().optional(),
  // Súhlas s marketingovými oznámeniami (admin-zadanie.md §9). Admin ho vidí
  // a vie odobrať; udeliť ho môže len sám používateľ.
  marketing_consent: z.literal(false).optional(),
  reason: z.string().min(3).max(500),
});

// Úprava a mazanie potomkov kauzy (rola, udalosť, konanie).
//
// Všetky sú čiastočné — moderátor opravuje jedno pole, nie celý riadok — a
// všetky nesú dôvod, ktorý skončí v audite. `sources` sa dá zmeniť, ale nikdy
// nie vyprázdniť: údaj bez zdroja sa nezverejňuje.
const patchable = { reason: z.string().min(3, "úprava musí mať dôvod").max(500), rev: z.string().optional() };
const sourcesPatch = z.array(docId("article")).min(1, "aspoň jeden zdroj").optional();

export const rolePatchBody = z.object({
  role: z.enum(ROLE_KINDS).optional(),
  valid_from: isoDate.optional(),
  valid_to: isoDate.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  sources: sourcesPatch,
  ...patchable,
});

export const eventPatchBody = z.object({
  occurred_on: isoDate.optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(4000).optional(),
  person_ids: z.array(docId("person")).max(50).optional(),
  proceeding_id: docId("proceeding").nullable().optional(),
  sources: sourcesPatch,
  ...patchable,
});

export const proceedingPatchBody = z.object({
  court: z.string().min(3).max(200).optional(),
  file_number: z.string().min(3).max(60).optional(),
  phase: z.enum(CASE_PHASES).optional(),
  decisions: z.array(z.record(z.string(), z.any())).optional(),
  sources: sourcesPatch,
  person_ids: z.array(docId("person")).max(100).optional(),
  org_ids: z.array(docId("org")).max(100).optional(),
  ...patchable,
});

/** Mazanie má povinný dôvod — dokument zmizne, záznam o ňom nie. */
export const deleteBody = z.object({
  reason: z.string().min(3, "zmazanie musí mať dôvod").max(500),
});

export const endRoleBody = z.object({
  valid_to: isoDate,
  reason: z.string().min(3).max(500).optional(),
});

export const hideBody = z.object({
  reason: z.string().min(3, "skrytie musí mať dôvod").max(500),
  rev: z.string().optional(),
});

// ── Query parameters ──────────────────────────────────────────────────────────

const cursor = z.string().max(4000).optional();
const limit = z.coerce.number().int().min(1).max(200).default(20);

export const listQuery = z.object({
  q: z.string().max(200).optional(),
  limit,
  cursor,
});

export const proceedingsQuery = z.object({
  q: z.string().max(200).optional(),
  court: z.string().max(200).optional(),
  phase: z.enum(CASE_PHASES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const casesQuery = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  phase: z.enum(CASE_PHASES).optional(),
  case_kind: z.enum(CASE_KINDS).optional(),
  party: docId("org").optional(),
  person_id: docId("person").optional(),
  tag: z.string().max(40).optional(),
  amount_min: z.coerce.number().int().min(0).optional(),
  amount_max: z.coerce.number().int().min(0).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(["updated", "amount", "started", "relevance"]).optional(),
  limit,
  cursor,
});

/** Administratívny zoznam vidí aj koncepty a skryté — a vie si vybrať. */
export const adminEntitiesQuery = z.object({
  q: z.string().max(200).optional(),
  type: z.enum(TARGET_TYPES).optional(),
  publish_state: z.enum(PUBLISH_STATES).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  phase: z.enum(CASE_PHASES).optional(),
  case_kind: z.enum(CASE_KINDS).optional(),
  party: docId("org").optional(),
  person_id: docId("person").optional(),
  moderator_id: docId("user").optional(),
  has_moderator: z.enum(["true", "false"]).optional(),
  tag: z.string().max(40).optional(),
  kind: z.enum(ORG_KINDS).optional(),
  amount_min: z.coerce.number().int().min(0).optional(),
  amount_max: z.coerce.number().int().min(0).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(["updated", "amount", "started", "relevance"]).optional(),
  limit,
  cursor,
});

export const personsQuery = z.object({
  q: z.string().max(200).optional(),
  party: docId("org").optional(),
  case_id: docId("case").optional(),
  role: z.enum(ROLE_KINDS).optional(),
  limit,
  cursor,
});

export const searchQuery = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(["case", "person", "org", "article"]).optional(),
  limit,
  cursor,
});

export const articlesQuery = z.object({
  q: z.string().max(200).optional(),
  kind: z.enum(ARTICLE_KINDS).optional(),
  status: z.enum(ARTICLE_STATUSES).optional(),
  // Zdroje jednej kauzy alebo osoby. Bez toho by ich záložka Zdroje musela
  // filtrovať až v prehliadači a zdroj mimo prvej stránky by nenašla.
  case_id: docId("case").optional(),
  person_id: docId("person").optional(),
  feed_id: docId("feed").optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit,
  cursor,
});

export const moderationQuery = z.object({
  status: z.enum(SUGGESTION_STATUSES).optional(),
  origin: z.enum(["user", "bot"]).optional(),
  target_type: z.enum(TARGET_TYPES).optional(),
  limit,
  cursor,
});

export const timelineQuery = z.object({
  kind: z.enum(EVENT_KINDS).optional(),
});

export const revisionsQuery = z.object({
  target_id: z.string().max(120).optional(),
  actor_id: z.string().max(120).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit,
});


// ── Číselníky ─────────────────────────────────────────────────────────────────

const codelistCode = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "kód smie obsahovať len a-z, 0-9, pomlčku a podčiarkovník");

export const codelistBody = z.object({
  kind: z.enum(CODELIST_KINDS),
  code: codelistCode,
  name: z.string().min(2).max(200),
  // Skratka do tabuliek a filtrov („OS Testovice"), kde sa celý názov nezmestí.
  short_name: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  // Poradie vo formulári: nižšie číslo je vyššie v ponuke, pri zhode rozhoduje
  // abeceda. Bez neho by „iné" skončilo uprostred zoznamu.
  sort: z.number().int().min(0).max(999).default(100),
  // Len pri číselníku `phase`: do ktorého segmentu metriky fáza patrí.
  bucket: z.enum(PHASE_BUCKETS).optional(),
  reason: z.string().min(3).max(500),
});

export const codelistPatchBody = z.object({
  // Kód je kľúč, na ktorý odkazujú dokumenty — mení sa názov, nie kód.
  name: z.string().min(2).max(200).optional(),
  short_name: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  sort: z.number().int().min(0).max(999).optional(),
  // Neaktívna položka sa prestane ponúkať vo formulároch, ale nezmizne:
  // dokumenty, ktoré ju už nesú, zostávajú čitateľné.
  active: z.boolean().optional(),
  bucket: z.enum(PHASE_BUCKETS).optional(),
  reason: z.string().min(3).max(500),
});

export const codelistsQuery = z.object({
  kind: z.enum(CODELIST_KINDS).optional(),
  active: z.enum(["true", "false"]).optional(),
});

// ── Prepojenia a zdroje entity (handoff „Červená niť" kap. 7.1–7.2) ──────────

const flag = z.enum(["0", "1"]).optional().transform((v) => (v === undefined ? undefined : v === "1"));

export const entityArticlesQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(["official", "media"]).optional(),
  // Kauza ako slug alebo id — profil osoby filtruje zdroje podľa kauzy.
  case: z.string().max(200).optional(),
  sort: z.enum(["desc", "asc"]).default("desc"),
});

export const graphQuery = z.object({
  depth: z.coerce.number().int().min(1).max(2).default(1),
  active: flag,
  derived: flag,
  cases_only: flag,
  events: flag,
});

// ── Metriky titulky (handoff „Červená niť" kap. 6) ──────────────────────────

export const topCasesQuery = z.object({
  period: z.enum(["30d", "12m", "all"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export const limitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(3),
});

export const calendarQuery = z.object({
  court: z.string().max(200).optional(),
  case: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(30),
});

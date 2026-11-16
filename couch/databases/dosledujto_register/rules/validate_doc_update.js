// Database-level invariants. The write layer in `packages/shared` is the only
// thing that should ever write here, but "should" is not an invariant — a
// misbehaving worker, a curl during an incident or a half-finished migration
// all reach the same database. What must never be true is enforced here.
//
// The rule this file exists for: **a datum without a source is not published**
// (produktové zadanie §4.6). Everything else is schema hygiene.
//
// What this cannot enforce, and where it therefore lives instead:
//   - that every write is accompanied by a `revision` document (§2.2) — the
//     validation function sees one document, not the batch;
//   - that a source id actually resolves to an `article` — no cross-document
//     reads in a validation function.

var TYPES = {
  case: 1, person: 1, org: 1, role: 1, link: 1, event: 1, proceeding: 1,
  article: 1, suggestion: 1, revision: 1, user: 1, session: 1,
  subscription: 1, notification: 1, feed: 1, codelist: 1,
};

/** Types whose whole document is one sourced assertion. */
var ROOT_SOURCED = { role: 1, link: 1, event: 1, proceeding: 1 };

/** Editorial types: an actor is always known, because a human or the bot acted. */
var NEEDS_ACTOR = {
  case: 1, person: 1, org: 1, role: 1, link: 1, event: 1, proceeding: 1,
};

var ENUMS = {
  case: {
    publish_state: ["draft", "published", "hidden"],
  },
  person: { publish_state: ["draft", "published", "hidden"] },
  org: {
    kind: ["party", "company", "institution"],
    publish_state: ["draft", "published", "hidden"],
  },
  role: {
    role: ["suspect", "accused", "indicted", "convicted", "acquitted", "witness",
      "victim", "investigator", "prosecutor", "judge", "other"],
  },
  link: {
    kind: ["member", "statutory", "owner", "ubo", "family", "business", "other"],
  },
  event: {
    kind: ["past", "expected"],
    category: ["charge", "hearing", "verdict", "appeal", "seizure", "other"],
  },
  article: {
    kind: ["media", "official"],
    status: ["candidate", "processed", "linked", "rejected"],
  },
  suggestion: {
    origin: ["user", "bot"],
    status: ["pending", "accepted", "rejected", "needs_info"],
  },
  user: {
    role: ["user", "moderator", "admin", "superadmin"],
    status: ["active", "blocked"],
  },
  subscription: {
    target_type: ["case", "person", "org"],
    frequency: ["instant", "daily", "weekly"],
    level: ["all", "significant"],
  },
  notification: { state: ["pending", "sent", "read"] },
  feed: { kind: ["rss", "sitemap", "html"] },
  // Číselníky. `court` a `case_tag` si obsah určujú samy; `event_category`
  // a `link_type` sú viazané na enum vyššie v tomto súbore — číselník im drží
  // slovenský názov, nie zoznam hodnôt, lebo hodnotu mimo enumu by databáza aj
  // tak odmietla.
  codelist: {
    kind: ["court", "case_tag", "event_category", "link_type", "phase", "case_kind"],
  },
};

// Fázy konania a ich segmenty v metrike. `final` sa rozdelilo na `convicted`
// a `acquitted`, pribudlo `lapsed` (rozhodnutie vlastníka 15. 11. 2026).
var PHASES = ["investigation", "charges", "indictment", "trial", "appeal",
  "convicted", "acquitted", "halted", "lapsed"];
var BUCKETS = ["none", "investigation", "charge", "trial", "convicted", "acquitted",
  "discontinued", "lapsed"];
var CASE_KINDS = ["public_money", "investigation_interference", "abuse_of_power",
  "elections_party_finance", "conflict_of_interest", "other"];

/** Sourced fields whose `value` is an enum (the enum sits inside the object). */
var SOURCED_ENUMS = {
  case: {
    status: ["open", "closed"],
    phase: PHASES,
  },
};

export default function (newDoc, oldDoc, userCtx, secObj) {
  // Deletions and infrastructure documents pass through. couchman's alias
  // document and the migration bookkeeping are not part of the data model.
  if (newDoc._deleted) return;
  if (newDoc._id.indexOf("_design/") === 0) return;
  if (newDoc._id.indexOf("couchman:") === 0) return;
  if (newDoc._id === "migration_state") return;

  var type = newDoc.type;
  if (!type || !has(TYPES, type)) {
    reject("document must have a known `type` (got " + JSON.stringify(type) + ")");
  }

  // `<type>:<uuid7>` — the id says what the document is without reading it,
  // which is what makes `_all_docs` ranges and id prefixes usable.
  if (newDoc._id.indexOf(type + ":") !== 0 || newDoc._id.length <= type.length + 1) {
    reject('_id must be "' + type + ':<uuid7>", got "' + newDoc._id + '"');
  }
  if (oldDoc && oldDoc.type && oldDoc.type !== type) {
    reject("a document cannot change type (" + oldDoc.type + " → " + type + ")");
  }

  isoDate(newDoc.created_at, "created_at");
  isoDate(newDoc.updated_at, "updated_at");

  if (has(NEEDS_ACTOR, type)) {
    if (!newDoc.created_by) reject(type + " requires created_by");
    if (!newDoc.updated_by) reject(type + " requires updated_by");
  }

  checkEnums(ENUMS[type], newDoc, type);
  checkSourcedEnums(SOURCED_ENUMS[type], newDoc, type);

  // Every sourced field must be shaped like one, whatever its state.
  var sourcedFields = [];
  for (var key in newDoc) {
    if (!has(newDoc, key) || key.charAt(0) === "_") continue;
    var field = newDoc[key];
    if (!field || typeof field !== "object" || !isArray(field.sources)) continue;
    sourcedFields.push(key);
    if (field.derived && !field.derivation) {
      reject(
        "field `" + key + "` is marked derived, so it must describe its " +
        "derivation — a derived value is our own assertion, not a quotation",
      );
    }
  }

  // The load-bearing rule: publishing requires a source for every sourced field.
  if (newDoc.publish_state === "published") {
    for (var i = 0; i < sourcedFields.length; i++) {
      var name = sourcedFields[i];
      if (newDoc[name].sources.length === 0) {
        reject(
          "cannot publish " + type + " " + newDoc._id + ": field `" + name +
          "` has no source. A datum without a source is not published.",
        );
      }
    }
  }

  // Types that are themselves one assertion always need a source — they are
  // only ever created as part of a published statement about someone.
  if (has(ROOT_SOURCED, type)) {
    if (!isArray(newDoc.sources) || newDoc.sources.length === 0) {
      reject(type + " requires a non-empty `sources` array");
    }
    if (newDoc.derived && !newDoc.derivation) {
      reject(type + " is marked derived, so it must describe its derivation");
    }
  }

  switch (type) {
    case "case":
      checkCase(newDoc);
      break;
    case "role":
      // Rola viaže ku kauze osobu **alebo** subjekt: aj firma môže byť v kauze
      // obvinená a bez tejto väzby by sa subjekt dal ku kauze pripojiť len
      // nepriamo, cez členstvo svojich ľudí. Práve jedno z dvoch, nikdy oboje —
      // inak by sa nedalo povedať, o kom rola hovorí.
      if (!newDoc.case_id) reject("role requires case_id");
      if (!newDoc.person_id && !newDoc.org_id) reject("role requires person_id or org_id");
      if (newDoc.person_id && newDoc.org_id) {
        reject("role belongs to a person or to an org, never to both");
      }
      break;
    case "link":
      if (!newDoc.from_id || !newDoc.to_id) reject("link requires from_id and to_id");
      break;
    case "event":
      if (!newDoc.case_id) reject("event requires case_id");
      isoDate(newDoc.occurred_on, "occurred_on");
      if (newDoc.proceeding_id !== undefined && newDoc.proceeding_id !== null &&
          (typeof newDoc.proceeding_id !== "string" || newDoc.proceeding_id.indexOf("proceeding:") !== 0)) {
        reject("event.proceeding_id must be a proceeding id or null");
      }
      break;
    case "proceeding":
      if (!newDoc.case_id) reject("proceeding requires case_id");
      if (newDoc.phase !== undefined && newDoc.phase !== null && !contains(PHASES, newDoc.phase)) {
        reject("proceeding.phase must be one of " + PHASES.join("|"));
      }
      if (!newDoc.file_number) {
        // The file number is the only practical key for matching an anonymised
        // court decision to a case (produktové zadanie §5.10).
        reject("proceeding requires file_number (spisová značka)");
      }
      break;
    case "article":
      if (!newDoc.url) reject("article requires url");
      break;
    case "suggestion":
      // No source, no suggestion — for humans and for the bot alike.
      if (!isArray(newDoc.source_urls) || newDoc.source_urls.length === 0) {
        reject("suggestion requires at least one source_url");
      }
      if (!newDoc.target || typeof newDoc.target !== "object") {
        reject("suggestion requires a target");
      }
      // A proposal for a new case or person has no target id, but then it must
      // say what it is proposing.
      if (!newDoc.target.id && !newDoc.comment) {
        reject("a suggestion without target.id proposes a new entity and requires a comment");
      }
      if (newDoc.origin === "bot" && typeof newDoc.confidence !== "number") {
        reject("a bot suggestion requires a numeric confidence");
      }
      break;
    case "user":
      if (!newDoc.email) reject("user requires email");
      if (!newDoc.password_hash) reject("user requires password_hash");
      // Registration creates `user` and nothing else; promotion is an explicit
      // admin action (backend-zadanie.md §7).
      if (!newDoc.role) reject("user requires role");
      break;
    case "session":
      if (!newDoc.user_id) reject("session requires user_id");
      // Only the hash of the token is ever stored.
      if (newDoc.token) reject("session must not store the raw token, only its hash");
      break;
    case "subscription":
      if (!newDoc.user_id || !newDoc.target_id) {
        reject("subscription requires user_id and target_id");
      }
      break;
    case "revision":
      if (!newDoc.target_id || !newDoc.actor_id) {
        reject("revision requires target_id and actor_id");
      }
      if (oldDoc) reject("revisions are append-only; an audit trail is not editable");
      break;
    case "feed":
      if (!newDoc.url) reject("feed requires url");
      break;
    case "codelist":
      if (!newDoc.code) reject("codelist requires code");
      if (!newDoc.name) reject("codelist requires name");
      // Kód je kľúč, na ktorý sa odkazuje z dokumentov; premenovať sa smie
      // názov, nie kód, inak by odkaz ticho prestal platiť.
      if (oldDoc && oldDoc.code && oldDoc.code !== newDoc.code) {
        reject("codelist code is a key and cannot change (" + oldDoc.code + " → " + newDoc.code + ")");
      }
      if (oldDoc && oldDoc.kind && oldDoc.kind !== newDoc.kind) {
        reject("codelist cannot change kind");
      }
      if (newDoc.kind === "event_category" && !contains(ENUMS.event.category, newDoc.code)) {
        reject("event_category codelist entry must be one of " + ENUMS.event.category.join("|"));
      }
      if (newDoc.kind === "link_type" && !contains(ENUMS.link.kind, newDoc.code)) {
        reject("link_type codelist entry must be one of " + ENUMS.link.kind.join("|"));
      }
      if (newDoc.kind === "phase") {
        if (!contains(PHASES, newDoc.code)) reject("phase codelist entry must be one of " + PHASES.join("|"));
        // Bez segmentu by fáza z metriky „Peniaze v kauzách" ticho vypadla.
        if (!contains(BUCKETS, newDoc.bucket)) {
          reject("phase codelist entry requires bucket, one of " + BUCKETS.join("|"));
        }
      }
      if (newDoc.kind === "case_kind" && !contains(CASE_KINDS, newDoc.code)) {
        reject("case_kind codelist entry must be one of " + CASE_KINDS.join("|"));
      }
      break;
  }

  function checkCase(doc) {
    // Druh kauzy: neprázdny zoznam kódov, prvý je hlavný. Pri zverejnenej
    // kauze povinný — bez neho by nefinančná kauza na webe vyzerala ako kauza
    // s nulovou sumou.
    if (doc.publish_state === "published" && !(doc.kind && typeof doc.kind === "object")) {
      reject("cannot publish case " + doc._id + ": field `kind` is required");
    }
    if (doc.kind && typeof doc.kind === "object" && doc.kind.value !== null && doc.kind.value !== undefined) {
      var kinds = doc.kind.value;
      if (!isArray(kinds)) reject("case.kind.value must be an array of codes");
      // Prázdny zoznam je rozpracovaný koncept; zverejnená kauza druh mať musí.
      if (kinds.length === 0 && doc.publish_state === "published") {
        reject("cannot publish case " + doc._id + ": field `kind` is empty");
      }
      for (var k = 0; k < kinds.length; k++) {
        if (!contains(CASE_KINDS, kinds[k])) {
          reject("case.kind.value entries must be one of " + CASE_KINDS.join("|") + ' (got "' + kinds[k] + '")');
        }
      }
    }
    var impact = doc.impact && typeof doc.impact === "object" ? doc.impact.value : null;
    if (impact !== null && impact !== undefined) {
      if (typeof impact !== "object" || typeof impact.value !== "number" ||
          typeof impact.unit !== "string" || !impact.unit) {
        reject("case.impact.value must be { value: number, unit: string, note?: string }");
      }
    }
    var recovered = doc.recovered_amount && typeof doc.recovered_amount === "object"
      ? doc.recovered_amount.value : null;
    if (recovered !== null && recovered !== undefined) {
      if (typeof recovered !== "number" || recovered < 0 || Math.floor(recovered) !== recovered) {
        reject("case.recovered_amount.value must be a non-negative integer (cents)");
      }
    }
  }

  function reject(reason) {
    throw { forbidden: reason };
  }

  function isoDate(v, name) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
      reject(name + " must be an ISO 8601 date (got " + JSON.stringify(v) + ")");
    }
  }

  function checkEnums(spec, doc, label) {
    if (!spec) return;
    for (var field in spec) {
      if (!has(spec, field)) continue;
      var v = doc[field];
      if (v === undefined || v === null) continue;
      if (!contains(spec[field], v)) {
        reject(label + "." + field + ' must be one of ' + spec[field].join("|") +
          ' (got "' + v + '")');
      }
    }
  }

  function checkSourcedEnums(spec, doc, label) {
    if (!spec) return;
    for (var field in spec) {
      if (!has(spec, field)) continue;
      var wrapper = doc[field];
      if (!wrapper || typeof wrapper !== "object") continue;
      var v = wrapper.value;
      if (v === undefined || v === null) continue;
      if (!contains(spec[field], v)) {
        reject(label + "." + field + '.value must be one of ' + spec[field].join("|") +
          ' (got "' + v + '")');
      }
    }
  }
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isArray(v) {
  return Object.prototype.toString.call(v) === "[object Array]";
}

function contains(list, v) {
  for (var i = 0; i < list.length; i++) if (list[i] === v) return true;
  return false;
}

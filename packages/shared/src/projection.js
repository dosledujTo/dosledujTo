// What the public API is allowed to return.
//
// Two rules, both from the product specification and neither negotiable:
//   1. only `publish_state: published`, and within it only fields that carry a
//      source (§4.6) — an unsourced field is not "empty", it does not exist;
//   2. never the full text of an article (§10) — we quote facts and link, we do
//      not republish somebody else's text.

import { isSourced } from "./sourced.js";

const EXCERPT_MAX = 300;

/** Fields that are internal bookkeeping, not public content. */
const INTERNAL = new Set(["_rev", "created_by", "updated_by", "couchman:fixture", "body"]);

/**
 * Strip unsourced fields and internal bookkeeping from an entity.
 *
 * @param {Record<string, any>} doc
 * @returns {Record<string, any>}
 */
export function publicEntity(doc) {
  if (!doc) return null;
  const out = { id: doc._id };

  for (const [key, v] of Object.entries(doc)) {
    if (key === "_id" || INTERNAL.has(key)) continue;
    // A sourced field with no source is not published — it is not rendered as
    // null either, because "we have nothing" and "we have something unsourced"
    // must look the same from outside.
    if (isSourced(v) && v.sources.length === 0) continue;
    out[key] = v;
  }
  return out;
}

/**
 * A source, as the public sees it: enough to verify, never the text itself.
 * @param {Record<string, any>} doc
 */
export function publicArticle(doc) {
  if (!doc) return null;
  const excerpt =
    typeof doc.excerpt === "string" && doc.excerpt.length > EXCERPT_MAX
      ? doc.excerpt.slice(0, EXCERPT_MAX).trimEnd() + "…"
      : doc.excerpt ?? null;

  return {
    id: doc._id,
    kind: doc.kind,
    title: doc.title ?? null,
    publisher: doc.publisher ?? null,
    author: doc.author ?? null,
    published_at: doc.published_at ?? null,
    url: doc.url,
    canonical_url: doc.canonical_url ?? null,
    // Kept so a datum stays verifiable after the publisher takes the page down
    // (produktové zadanie §4.6).
    archive_url: doc.archive_url ?? null,
    paywall: !!doc.paywall,
    excerpt,
  };
}

/** @param {Record<string, any>} doc */
export function publicRole(doc) {
  return {
    id: doc._id,
    case_id: doc.case_id,
    person_id: doc.person_id ?? null,
    // Aj subjekt môže mať v kauze rolu (obvinená firma).
    org_id: doc.org_id ?? null,
    role: doc.role,
    valid_from: doc.valid_from ?? null,
    valid_to: doc.valid_to ?? null,
    current: !doc.valid_to,
    // `note` je pracovná poznámka moderátora („status sa neprepisuje…"), nie
    // zdrojovaný údaj — von nejde (handoff „Červená niť" kap. 5.2).
    sources: doc.sources ?? [],
  };
}

/** @param {Record<string, any>} doc */
export function publicEvent(doc) {
  return {
    id: doc._id,
    case_id: doc.case_id,
    occurred_on: doc.occurred_on,
    kind: doc.kind,
    category: doc.category,
    title: doc.title ?? null,
    description: doc.description ?? null,
    person_ids: doc.person_ids ?? [],
    proceeding_id: doc.proceeding_id ?? null,
    sources: doc.sources ?? [],
  };
}

/** @param {Record<string, any>} doc */
export function publicProceeding(doc) {
  return {
    id: doc._id,
    case_id: doc.case_id,
    court: doc.court,
    file_number: doc.file_number,
    phase: doc.phase ?? null,
    decisions: doc.decisions ?? [],
    sources: doc.sources ?? [],
  };
}

/** @param {Record<string, any>} doc */
export function publicLink(doc) {
  return {
    id: doc._id,
    from_id: doc.from_id,
    to_id: doc.to_id,
    kind: doc.kind,
    valid_from: doc.valid_from ?? null,
    valid_to: doc.valid_to ?? null,
    derived: !!doc.derived,
    // A derived link is our own claim, not a quotation, and says so out loud.
    derivation: doc.derivation ?? null,
    sources: doc.sources ?? [],
  };
}

/** What the submitter of a suggestion may see about it. */
export function publicSuggestion(doc) {
  return {
    id: doc._id,
    origin: doc.origin,
    target: doc.target,
    proposed_value: doc.proposed_value ?? null,
    source_urls: doc.source_urls ?? [],
    comment: doc.comment ?? null,
    status: doc.status,
    review_note: doc.review_note ?? null,
    created_at: doc.created_at,
    reviewed_at: doc.reviewed_at ?? null,
  };
}

/** @param {Record<string, any>} doc */
export function publicUser(doc) {
  return {
    id: doc._id,
    email: doc.email,
    display_name: doc.display_name ?? null,
    role: doc.role,
    status: doc.status,
    notification_prefs: doc.notification_prefs ?? null,
    created_at: doc.created_at,
    last_login_at: doc.last_login_at ?? null,
  };
}

/**
 * Admin reads see drafts and unsourced fields — that is the point of the
 * moderation interface — but still never a password hash or a session token.
 * @param {Record<string, any>} doc
 */
export function adminDoc(doc) {
  if (!doc) return null;
  const { password_hash, token_hash, ...rest } = doc;
  return { id: doc._id, ...rest };
}

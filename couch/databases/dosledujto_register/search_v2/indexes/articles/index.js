// Full-text index over sources — both media articles and official documents
// (`kind: media|official`).
//
// The body is indexed but never stored: the API returns only `excerpt`, title,
// publisher, date and link (backend-zadanie.md §2.2). Full text exists for
// matching, for search and for detecting that a publisher changed the article —
// not for republishing.

import { fold } from "../../../../../shared/normalize.js";
import { epoch } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (doc.type !== "article") return;

  index("kind", doc.kind || "media", { store: true, facet: true });
  index("status", doc.status || "candidate", { store: true, facet: true });
  if (doc.publisher) index("publisher", doc.publisher, { store: true, facet: true });
  if (doc.feed_id) index("feed_id", doc.feed_id, { store: false });
  if (doc.url) index("url", doc.url, { store: true });
  if (doc.canonical_url) index("canonical_url", doc.canonical_url, { store: false });
  if (doc.content_hash) index("content_hash", doc.content_hash, { store: false });
  if (doc.paywall) index("paywall", "true", { store: true });

  if (doc.title) {
    index("title", doc.title, { store: true });
    index("title_fold", fold(doc.title), { store: false });
  }
  if (doc.excerpt) {
    index("excerpt", doc.excerpt, { store: true });
    // Kým crawler sťahuje len feedy, `body` je prázdne a perex je jediný text,
    // ktorý o článku máme. Bez foldnutej kópie sa v ňom nedá hľadať rovnako ako
    // v titulku — a to je celý obsah kroku 1.
    index("excerpt_fold", fold(doc.excerpt), { store: false });
  }

  // Body is folded as well, so a query without diacritics still hits.
  if (typeof doc.body === "string" && doc.body) {
    index("body", doc.body, { store: false });
    index("body_fold", fold(doc.body), { store: false });
  }

  var published = epoch(doc.published_at);
  if (published !== null) index("published_at", published, { store: true });

  var fetched = epoch(doc.fetched_at);
  if (fetched !== null) index("fetched_at", fetched, { store: false });

  var cases = doc.case_ids || [];
  for (var i = 0; i < cases.length; i++) {
    if (cases[i]) index("case_id", cases[i], { store: true });
  }
  var people = doc.person_ids || [];
  for (var j = 0; j < people.length; j++) {
    if (people[j]) index("person_id", people[j], { store: true });
  }
  if (cases.length === 0 && people.length === 0) {
    index("unlinked", "true", { store: false });
  }
}

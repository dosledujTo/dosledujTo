// Udalosti káuz kľúčované len id kauzy — pre záložku „V čase" na profile, kde
// treba udalosti všetkých káuz osoby naraz:
//
//   POST _view/events  { "keys": ["case:…", "case:…"] }
//
// `by_case/children` má zložený kľúč pre rozsah jednej kauzy a do `keys` sa
// nehodí.

export default function (doc) {
  if (doc.type !== "event" || !doc.case_id) return;
  emit(doc.case_id, {
    occurred_on: doc.occurred_on || null,
    kind: doc.kind || "past",
    category: doc.category || "other",
    title: doc.title || null,
    proceeding_id: doc.proceeding_id || null,
    sources: doc.sources || [],
  });
}

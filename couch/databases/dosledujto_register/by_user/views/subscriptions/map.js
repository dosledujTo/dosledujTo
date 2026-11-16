// Odbery jedného používateľa — pre `GET /api/subscriptions`.
//
// `by_target/subscriptions` odpovedá na opačnú otázku (kto sleduje tento cieľ,
// pre notifikátor). Obe sú potrebné: bez tejto by si zoznam vlastných odberov
// vyžadoval prejsť celý view.
//
//   ?startkey=["user:018f…"]&endkey=["user:018f…",{}]&include_docs=true

export default function (doc) {
  if (doc.type !== "subscription" || !doc.user_id) return;

  emit([doc.user_id, doc.target_type || "case", doc.target_id], {
    target_type: doc.target_type,
    target_id: doc.target_id,
    frequency: doc.frequency || "daily",
    level: doc.level || "all",
  });
}

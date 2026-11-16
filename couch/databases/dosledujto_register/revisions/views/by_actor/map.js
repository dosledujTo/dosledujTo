// Čo urobil konkrétny moderátor. Kontrola kvality práce aj vyšetrenie sporu —
// `GET /api/admin/revisions?actor_id=`.
//
//   ?startkey=["user:018f…"]&endkey=["user:018f…",{}]&include_docs=true

export default function (doc) {
  if (doc.type !== "revision" || !doc.actor_id) return;

  emit([doc.actor_id, doc.at || doc.created_at || ""], {
    target_type: doc.target_type,
    target_id: doc.target_id,
    reason: doc.reason || null,
  });
}

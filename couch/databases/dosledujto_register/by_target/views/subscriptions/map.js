// Who is watching a given target. The notifier reads `_changes`, and for each
// changed case / event / role asks this view for the subscribers
// (backend-zadanie.md §8.3).
//
//   ?startkey=["case","case:018f…"]&endkey=["case","case:018f…",{}]
//
// `frequency` sits in the key so the instant batch can be selected without
// reading every subscriber document.

export default function (doc) {
  if (doc.type !== "subscription" || !doc.target_id) return;

  emit([doc.target_type, doc.target_id, doc.frequency || "daily"], {
    user_id: doc.user_id,
    level: doc.level || "all",
  });
}

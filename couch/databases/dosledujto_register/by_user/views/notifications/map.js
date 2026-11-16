// Upozornenia používateľa, najnovšie prvé (kľúč sa číta s `descending=true`).
//
//   ?startkey=["user:018f…",{}]&endkey=["user:018f…"]&descending=true

export default function (doc) {
  if (doc.type !== "notification" || !doc.user_id) return;

  emit([doc.user_id, doc.created_at || ""], {
    state: doc.state || "pending",
    subscription_id: doc.subscription_id || null,
    event_ids: doc.event_ids || [],
    sent_at: doc.sent_at || null,
  });
}

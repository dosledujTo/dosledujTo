// História zmien jedného dokumentu, v poradí, v akom nastali.
//
//   ?startkey=["case:018f…"]&endkey=["case:018f…",{}]&include_docs=true
//
// Reťaz je úplná — `createDoc` zapisuje revíziu aj pri vzniku dokumentu — takže
// prehratím `diff`-ov od začiatku sa dá zrekonštruovať ľubovoľný starší stav.
// Na tom stojí `POST /api/admin/revisions/:id/revert`.

export default function (doc) {
  if (doc.type !== "revision" || !doc.target_id) return;

  emit([doc.target_id, doc.at || doc.created_at || ""], {
    actor_id: doc.actor_id,
    actor_role: doc.actor_role,
    reason: doc.reason || null,
    ops: (doc.diff || []).length,
    suggestion_id: doc.suggestion_id || null,
  });
}

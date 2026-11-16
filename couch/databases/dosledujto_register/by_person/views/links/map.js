// Prepojenia osoby alebo subjektu — na profil (`GET /api/persons/:id`) a na
// dopočítanie `party_ids` kauzy.
//
// Emituje sa z oboch strán väzby, aby sa dala čítať jedným rozsahom bez ohľadu
// na to, ktorý koniec je známy:
//
//   ?startkey=["person:018f…"]&endkey=["person:018f…",{}]&include_docs=true

export default function (doc) {
  if (doc.type !== "link" || !doc.from_id || !doc.to_id) return;

  var current = !doc.valid_to;
  emit([doc.from_id, "out", doc.kind || "other"], {
    other_id: doc.to_id,
    kind: doc.kind || "other",
    direction: "out",
    current: current,
    derived: !!doc.derived,
  });
  emit([doc.to_id, "in", doc.kind || "other"], {
    other_id: doc.from_id,
    kind: doc.kind || "other",
    direction: "in",
    current: current,
    derived: !!doc.derived,
  });
}

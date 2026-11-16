// Cases a person appears in, with the role in each — the main added value of
// the product over reading the media (produktové zadanie §4.2).
//
//   ?startkey=["person:018f…"]&endkey=["person:018f…",{}]
//
// Historical roles are emitted too: an acquittal has to be as visible as the
// charge that preceded it (produktové zadanie §6).

export default function (doc) {
  if (doc.type !== "role" || !doc.case_id) return;

  // Kľúčom je **entita**, nie osoba: rola viaže ku kauze osobu alebo subjekt
  // (`rules/validate_doc_update.js`), a profil subjektu potrebuje tú istú
  // odpoveď ako profil osoby. Názov view zostáva `by_person/cases`, aby sa
  // nemusel prestavovať index kvôli premenovaniu.
  var entityId = doc.person_id || doc.org_id;
  if (!entityId) return;

  emit([entityId, doc.case_id, doc.valid_from || ""], {
    role: doc.role,
    valid_from: doc.valid_from || null,
    valid_to: doc.valid_to || null,
    current: !doc.valid_to,
    entity_type: doc.person_id ? "person" : "org",
    sources: doc.sources || [],
  });
}

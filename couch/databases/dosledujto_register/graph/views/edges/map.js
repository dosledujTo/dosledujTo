// Hrany grafu prepojení (handoff „Červená niť" kap. 7.1) — `link` aj `role`,
// emitované z oboch koncov a kľúčované **len id entity**. Vďaka tomu sa celý
// krok grafu načíta jedným dotazom s `keys`, bez ohľadu na to, koľko uzlov má:
//
//   POST _view/edges  { "keys": ["person:…", "org:…", "case:…"] }
//
// `by_person/links` a `by_case/children` majú zložené kľúče pre rozsahy jednej
// entity; na dávku cez `keys` sa nehodia (rozsah sa do `keys` nedá napísať).
//
// Hodnota nesie všetko, čo hrana v grafe potrebuje, takže dokumenty väzieb sa
// netreba dočítavať. Dočítavajú sa len uzly (meno, slug, stav zverejnenia).

export default function (doc) {
  if (doc.type === "link") {
    if (!doc.from_id || !doc.to_id) return;
    var link = {
      edge: doc._id,
      kind: doc.kind || "other",
      role: null,
      from: doc.from_id,
      to: doc.to_id,
      valid_from: doc.valid_from || null,
      valid_to: doc.valid_to || null,
      derived: !!doc.derived,
      derivation: doc.derivation || null,
      sources: doc.sources || [],
    };
    emit(doc.from_id, link);
    if (doc.to_id !== doc.from_id) emit(doc.to_id, link);
    return;
  }

  if (doc.type === "role") {
    var entity = doc.person_id || doc.org_id;
    if (!entity || !doc.case_id) return;
    var role = {
      edge: doc._id,
      kind: "role",
      role: doc.role,
      from: entity,
      to: doc.case_id,
      valid_from: doc.valid_from || null,
      valid_to: doc.valid_to || null,
      derived: !!doc.derived,
      derivation: doc.derivation || null,
      sources: doc.sources || [],
    };
    emit(entity, role);
    emit(doc.case_id, role);
  }
}

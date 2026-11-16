// Súdne konania, v ktorých figuruje osoba alebo subjekt.
//
// Konanie visí na kauze (`case_id`), ale obvinení sú menovite — z profilu osoby
// sa treba dostať k jej konaniam bez toho, aby sa prechádzali všetky kauzy,
// v ktorých má rolu.
//
//   ?startkey=["person:018f…"]&endkey=["person:018f…",{}]&include_docs=true

export default function (doc) {
  if (doc.type !== "proceeding") return;

  var ids = (doc.person_ids || []).concat(doc.org_ids || []);
  for (var i = 0; i < ids.length; i++) {
    if (ids[i]) {
      emit([ids[i], doc.court || "", doc.file_number || ""], {
        case_id: doc.case_id,
        court: doc.court || null,
        file_number: doc.file_number || null,
        phase: doc.phase || null,
      });
    }
  }
}

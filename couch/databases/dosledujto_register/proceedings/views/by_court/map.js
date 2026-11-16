// Súdne konania naprieč všetkými kauzami — pre samostatnú sekciu v administrácii.
//
// `by_case/children` odpovedá na opačnú otázku (čo patrí k tejto kauze). Tu
// treba zoznam konaní ako taký, zoradený tak, ako s ním pracuje moderátor:
// podľa súdu a v rámci neho podľa spisovej značky.
//
//   ?include_docs=true                              všetky
//   ?startkey=["Okresný súd Testovice"]&endkey=[…,{}]   jeden súd

export default function (doc) {
  if (doc.type !== "proceeding") return;
  emit([doc.court || "", doc.file_number || ""], { case_id: doc.case_id, phase: doc.phase || null });
}

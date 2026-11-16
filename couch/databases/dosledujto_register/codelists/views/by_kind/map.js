// Číselníky: súdy, tagy káuz, kategórie udalostí, typy prepojení, fázy konania
// (s segmentom metriky `bucket`) a druhy káuz.
//
// Kľúč je `[kind, sort, name]`, takže jeden dotaz vráti celý číselník už
// zoradený tak, ako ho vidí moderátor vo formulári — poradie určuje `sort`
// (nižšie hore), pri zhode abeceda. Neaktívne položky sa **neodfiltrujú**:
// existujúce dokumenty na ne stále odkazujú a administrácia ich musí vedieť
// ukázať, aj keď ich už neponúka.
//
//   ?startkey=["court"]&endkey=["court",{}]&include_docs=true
//   ?reduce=false

export default function (doc) {
  if (doc.type !== "codelist") return;

  emit([doc.kind, typeof doc.sort === "number" ? doc.sort : 100, doc.name || doc.code || ""], {
    code: doc.code,
    name: doc.name,
    active: doc.active !== false,
    bucket: doc.bucket || null,
  });
}

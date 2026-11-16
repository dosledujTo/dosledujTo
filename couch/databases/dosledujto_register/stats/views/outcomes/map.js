// Konečné výsledky pre jednotlivých ľudí a subjekty v kauze — pre pravidlo 3
// metriky „Peniaze v kauzách": pri viacerých obvinených s rôznym koncom
// rozhoduje najzávažnejší uzavretý výsledok (odsúdenie > oslobodenie > …).
//
//   ?keys=["case:…", …]  alebo celé, je malé

export default function (doc) {
  if (doc.type !== "role" || !doc.case_id) return;
  if (doc.role !== "convicted" && doc.role !== "acquitted") return;
  if (!doc.sources || !doc.sources.length) return;
  emit(doc.case_id, doc.role);
}

// Konania, ktoré sa opierajú o tento článok.
//
// Úradný dokument (uznesenie, rozsudok) je zdrojom konania — väzba je uložená
// v `proceeding.sources`, teda na konaní. Detail článku ale musí vedieť
// povedať, kde všade je použitý, inak by moderátor to isté rozhodnutie pripájal
// druhýkrát.
//
//   ?key="article:018f…"&include_docs=true

export default function (doc) {
  if (doc.type !== "proceeding") return;

  var sources = doc.sources || [];
  for (var i = 0; i < sources.length; i++) {
    if (sources[i]) {
      emit(sources[i], {
        case_id: doc.case_id,
        court: doc.court || null,
        file_number: doc.file_number || null,
        phase: doc.phase || null,
      });
    }
  }
}

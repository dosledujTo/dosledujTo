// Objem peňazí v kauzách — číslo na titulku.
//
// Sčítať sumy cez `_search` sa nedá: Lucene vie fasety a rozsahy, nie súčet.
// A dotiahnuť všetky kauzy na klienta kvôli jednému číslu je plytvanie, ktoré
// s počtom káuz rastie.
//
//   ?group=true&reduce=true    → [počet, suma] pre každý publikačný stav
//
// Reduce je builtin `_sum` nad poľom, preto majú obe hodnoty rovnakú dĺžku aj
// pri kauze bez sumy.

import { value } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (doc.type !== "case") return;

  var amount = value(doc.amount);
  var hasAmount = typeof amount === "number";

  // Suma bez zdroja sa nezverejní, takže sa ani nepočíta — inak by verejné
  // číslo tvrdilo viac, než čím sa dá podložiť.
  var sourced = doc.amount && doc.amount.sources && doc.amount.sources.length > 0;

  emit(doc.publish_state || "draft", [
    1,
    hasAmount && sourced ? amount : 0,
    hasAmount && sourced ? 1 : 0,
  ]);
}

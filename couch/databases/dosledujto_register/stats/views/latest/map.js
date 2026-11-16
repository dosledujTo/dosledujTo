// Posledný pohyb v kauze — „Naposledy sa pohlo" (handoff kap. 5.1, rozhodnutie
// vlastníka F): posledný priradený článok alebo udalosť, ktorá sa už stala.
//
//   ?group=true   → kauza = [epoch, "article"|"event", titulok, vydavateľ|kategória]
//
// Očakávané udalosti sa nepočítajú: termín v budúcnosti nie je pohyb.

import { epoch } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (doc.type === "article") {
    if (doc.status === "rejected") return;
    var at = epoch(doc.published_at);
    if (at === null) return;
    var cases = doc.case_ids || [];
    for (var i = 0; i < cases.length; i++) {
      if (cases[i]) emit(cases[i], [at, "article", doc.title || null, doc.publisher || null]);
    }
    return;
  }
  if (doc.type === "event" && doc.case_id && doc.kind === "past") {
    var when = epoch(doc.occurred_on);
    if (when !== null) emit(doc.case_id, [when, "event", doc.title || null, doc.category || null]);
  }
}

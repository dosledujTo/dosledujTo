// Články priradené ku kauze, osobe alebo subjektu — vzťah, nie hľadanie.
//
// Fulltext nad článkami je v Clouseau (`search/articles`), ale „ktoré články sú
// priradené k tomuto subjektu" je väzba: odpoveď musí byť presná a okamžite
// konzistentná hneď po uložení, nie až keď sa index doindexuje. A `org_id`
// v Lucene indexe nie je — jeho zmena znamená celý rebuild (`couchman.md`),
// zatiaľ čo view stojí prestavbu jedného view.
//
//   ?startkey=["org:018f…"]&endkey=["org:018f…",{}]&descending=false
//
// Druhý kľúč je dátum vydania ako epoch, aby sa dalo zoradiť od najnovšieho.

import { epoch } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (doc.type !== "article") return;

  var at = epoch(doc.published_at) || 0;
  var summary = {
    title: doc.title || null,
    publisher: doc.publisher || null,
    published_at: doc.published_at || null,
    kind: doc.kind || "media",
    status: doc.status || "candidate",
    url: doc.url || null,
    // Filter zdrojov podľa kauzy na profile osoby (handoff kap. 3.4) — bez
    // tohto by sa museli dočítať celé články.
    case_ids: doc.case_ids || [],
  };

  var groups = [doc.case_ids || [], doc.person_ids || [], doc.org_ids || []];
  for (var g = 0; g < groups.length; g++) {
    for (var i = 0; i < groups[g].length; i++) {
      if (groups[g][i]) emit([groups[g][i], at], summary);
    }
  }
}

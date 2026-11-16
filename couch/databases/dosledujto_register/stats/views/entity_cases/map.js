// Dvojice entita × kauza z rolí — „Mená v najviac kauzách" a počty ľudí a
// subjektov na karte kauzy (niť: bodky ľudia, štvorčeky subjekty).
//
//   ?group_level=2   → [entita, kauza] = počet rolí
//
// Ako výskyt sa počíta aj ukončená rola: aj oslobodený v kauze figuroval.
// Výskyt nie je vina — to hovorí web pri každom takom zozname.

export default function (doc) {
  if (doc.type !== "role" || !doc.case_id) return;
  var entity = doc.person_id || doc.org_id;
  if (!entity || !doc.sources || !doc.sources.length) return;
  emit([entity, doc.case_id], 1);
}

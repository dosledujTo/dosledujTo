// Články a úradné dokumenty ku kauze po dňoch a vydavateľoch — z toho sa
// počíta rebríček „O čom sa najviac píše", krivka za 24 mesiacov aj
// „Zabudnuté, ale nevyriešené" (handoff kap. 6.2, 6.3).
//
//   ?group_level=3   → [case_id, "YYYY-MM-DD", vydavateľ] = počet
//
// Deň, nie mesiac: obdobie „30 dní" sa na mesiace zaokrúhliť nedá. Riadkov je
// najviac toľko ako článkov, takže celý view sa dá prečítať jedným dotazom.
// Zamietnutý článok sa nepočíta — moderátor ho zamietol práve preto, že ku
// kauze nepatrí.

export default function (doc) {
  if (doc.type !== "article" || doc.status === "rejected") return;
  var day = typeof doc.published_at === "string" ? doc.published_at.slice(0, 10) : null;
  if (!day) return;
  var cases = doc.case_ids || [];
  for (var i = 0; i < cases.length; i++) {
    if (cases[i]) emit([cases[i], day, doc.publisher || ""], 1);
  }
}

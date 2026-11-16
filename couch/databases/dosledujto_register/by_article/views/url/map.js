// Deduplikácia článkov podľa kanonickej URL.
//
// Crawler vidí ten istý článok v každom behu feedu, a ten istý článok často aj
// pod viacerými adresami (utm parametre, skrátené odkazy, presmerovania). Kľúčom
// je kanonizovaná URL, ktorú vyrobí worker; `_search` index sa na to nepoužíva,
// lebo pri zápise potrebujeme presnú a okamžite konzistentnú odpoveď, nie
// výsledok z indexu, ktorý sa práve prestavuje.
//
//   ?key="https://www.aktuality.sk/clanok/xyz/"
//
// Druhý kľúč (`guid`) pokrýva prípad, keď médium článku zmení URL, ale nechá mu
// rovnaký identifikátor vo feede.

export default function (doc) {
  if (doc.type !== "article") return;

  var url = doc.canonical_url || doc.url;
  if (url) emit(url, { status: doc.status || "candidate", feed_id: doc.feed_id || null });

  if (doc.feed_guid && doc.feed_guid !== url) {
    emit(doc.feed_guid, { status: doc.status || "candidate", feed_id: doc.feed_id || null });
  }
}

// Koľko káuz nesie ktorý tag.
//
// Bez toho je číselník tagov zoznam slov, o ktorom nikto nevie, či sa používa:
// tag zapísaný pri kauze je obyčajný reťazec, takže sa dá premenovať iba
// vedome, keď je vidieť, čoho sa to týka.
//
//   ?group=true                   počty pre všetky tagy
//   ?key="doprava"&group=true     jeden tag

export default function (doc) {
  if (doc.type !== "case") return;
  if (Object.prototype.toString.call(doc.tags) !== "[object Array]") return;

  for (var i = 0; i < doc.tags.length; i++) {
    if (doc.tags[i]) emit(doc.tags[i], 1);
  }
}

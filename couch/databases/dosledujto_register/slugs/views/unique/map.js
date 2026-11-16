// Slug uniqueness check. CouchDB has no unique constraint, so this is the
// closest thing: with `?group=true` any row whose count is greater than one is
// a collision the write layer has to resolve before publishing.
//
//   ?key=["case","kauza-testovaci-most"]&group=true   → free before insert
//   ?group=true&reduce=true                           → audit the whole set

export default function (doc) {
  if (!doc.slug) return;
  if (doc.type !== "case" && doc.type !== "person" && doc.type !== "org") return;

  emit([doc.type, doc.slug], doc._id);
}

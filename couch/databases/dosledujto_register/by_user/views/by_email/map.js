// Vyhľadanie používateľa podľa e-mailu — prihlásenie a kontrola, či je adresa
// už zaregistrovaná. CouchDB nemá unique index, takže unikátnosť e-mailu drží
// zapisovacia vrstva touto kontrolou; kolízia sa dá odhaliť aj spätne
// (`?group=true` s reduce `_count`).
//
//   ?key="niekto@example.test"&include_docs=true

export default function (doc) {
  if (doc.type !== "user" || !doc.email) return;
  emit(String(doc.email).toLowerCase(), null);
}

Prerábame verejný web dosleduj.to na nový dizajn „Červená niť“ s prepojeniami a metrikami.

Zadanie je v `design_handoff_cervena_nit/README.md`, prototyp v `design_handoff_cervena_nit/navrh.html` (otvor v prehliadači, lišta hore prepína Titulka / Profil osoby / Logo, v hlavičke je tmavý režim).

Postup:
1. Prečítaj `CLAUDE.md`, `packages/web/README.md`, `packages/api/README.md`, `couch/README.md` a celé `design_handoff_cervena_nit/README.md`. Pozri si `navrh.html`.
2. Pred písaním kódu mi napíš plán pre míľnik 1 a zoznam vecí v zadaní, ktoré nesedia s tým, čo je v kóde (chýbajúce endpointy, iné názvy polí, kolízie s existujúcimi rozhodnutiami). Počkaj na moje OK.
3. Pracuj po míľnikoch z kapitoly 10 v poradí. Po každom spusti `npm test`, `npm run couch:validate` a pri zmenách v `couch/` aj `npm run couch:plan` a `npm run couch:fixtures`. Míľnik ukonči commitom a krátkym zhrnutím, čo je hotové a čo zostalo.
4. Rozhodnutia v kapitole 11 ber ako platné, kým ich nezmením. Keď narazíš na nové rozhodnutie, ktoré mení správanie pre používateľa alebo dátový model, opýtaj sa. Technické detaily rozhodni sám a zapíš do README balíka.

Neporušuj: plain JS + JSDoc (žiadny TypeScript), zápisy len cez `store.js`, žiadne Mango `_find`, žiadne N+1, údaj bez zdroja sa nezverejní, odvodené údaje vždy `derived` s popisom, testovacie dáta len fiktívne. Nepushuj bez môjho súhlasu.

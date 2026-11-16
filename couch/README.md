# Databázová štruktúra — `dosledujto_register`

Design dokumenty a testovacie dáta pre register káuz. Zdrojom pravdy je tento
strom, nie Fauxton — nasadzuje sa cez [`couchman`](../couchman.md).

## Prečo `dosledujto_register`

`backend-zadanie.md` §2 hovorí o jednej databáze `register`. Inštancia CouchDB je
môže byť zdieľaná s inými projektmi, preto prefix `dosledujto_`. Databáza sa
nemohla volať `dosleduj.to` — CouchDB v názve databázy nepovoľuje bodku.

## Príkazy

```bash
npm run couch:validate                 # offline kontrola, netreba databázu
npm run couch:plan                     # diff proti databáze, nič nezapisuje
npm run couch:push                     # nasadenie po potvrdení
npm run couch:fixtures                 # naliatie testovacích dát
npm run couch:generate                 # pregenerovanie objemových dát (7x-gen-*.json)
npx couchman push --env=local --create-db --yes   # prvé nasadenie na čistú inštanciu
npx couchman promote search_v2 search --env=local # … a prepnutie aliasu vyhľadávania
```

## Čo je nasadené

```
databases/dosledujto_register/
  search_v2/   _design/search_v2   3 Clouseau indexy: entities, articles, moderation
                                   (aplikácia ho volá logickým menom `search`, cez alias)
  by_case/     _design/by_case     children — role + event + proceeding jedným dotazom
  by_person/   _design/by_person   cases — kauzy osoby vrátane historických rolí
  by_target/   _design/by_target   subscriptions — odberatelia cieľa, pre notifikátor
  codelists/   _design/codelists   by_kind — číselníky; tag_usage (_count) — koľko káuz nesie tag
  by_article/  _design/by_article  url — deduplikácia; entity — články priradené ku kauze/osobe/subjektu
  proceedings/ _design/proceedings by_court (_count), by_file_number, by_entity, by_source
  slugs/       _design/slugs       unique (_count) — kontrola unikátnosti slugov
  stats/       _design/stats       coverage (_sum) — pokrytie údajov zdrojmi
  rules/       _design/rules       validate_doc_update
shared/
  normalize.js  deaccent / fold / tokenize (dodáva couchman)
  sourced.js    prístup k sourced hodnotám + epoch()
fixtures/dosledujto_register/       85 ručne písaných + ~3 860 generovaných testovacích dokumentov
fixtures/generate.js                generátor objemových dát (deterministický seed)
```

Mango (`_find`) sa nepoužíva. Zoznamy, filtre a vyhľadávanie idú cez `_search`,
bodové čítania cez `_id`, vzťahy a agregácie cez views (zadanie §2.3).

## Vyhľadávanie

Každé textové pole je indexované dvakrát — ako je napísané a *foldnuté* (bez
diakritiky, lowercase) v `<pole>_fold`. Clouseau nemá slovenský analyzer, takže
toto je jediné, čo zabezpečí, že „testovaci" nájde „Testovací". Pádové tvary
zostávajú na `name_variants`, nie na Lucene.

Analyzer je nastavený explicitne (`perfield`): identifikátory, stavy a fázy majú
`keyword`, texty `standard`. Dátumy sú indexované ako epoch number — string
nepodporuje ani rozsah, ani triedenie.

```bash
# fulltext naprieč kauzami, osobami a subjektmi
curl -sG "$DB/_design/search/_search/entities" \
  --data-urlencode 'q=text:testovaci'

# filtre, ktoré server skladá z whitelistu parametrov (klient Lucene query neposiela)
curl -sG "$DB/_design/search/_search/entities" \
  --data-urlencode 'q=type:case AND publish_state:published AND status:open AND amount:[100000000 TO 99999999999]' \
  --data-urlencode 'sort=["-amount<number>"]'

# fasety namiesto druhého dotazu na počty
curl -sG "$DB/_design/search/_search/entities" \
  --data-urlencode 'q=type:case AND publish_state:published' \
  --data-urlencode 'counts=["tag","phase"]' --data-urlencode 'limit=0'

# fronta moderátora
curl -sG "$DB/_design/search/_search/moderation" \
  --data-urlencode 'q=status:pending' --data-urlencode 'sort=["-created_at<number>"]'
```

Zmena indexovacej funkcie alebo analyzera znamená build indexu od nuly. Preto
je vyhľadávanie **verziované**: priečinok v strome sa volá `search_v2` (ďalší
bude `search_v3`) a aplikácia sa pýta logickým menom `search`. Skutočné meno si
prečíta z aliasového dokumentu `couchman:aliases` (`shared/src/couch.js`,
`resolveDdoc`, s 30 s cache). Bez aliasu platí logické meno a štart API zlyhá
s hláškou, ktorý alias treba prepnúť.

```bash
npm run couch:push                                  # vytvorí _design/search_vN, starý zostáva
npx couchman warm --ddoc=search_vN --env=local      # počká na build Lucene
npx couchman promote search_vN search --env=local   # prepne alias, bez reštartu API
npx couchman push --prune --env=local               # neskôr: zmaže starú verziu
```

Kým sa starý dizajn dokument nezmaže, `couch:plan` hlási jedno čakajúce mazanie
(`-1`) — to je zámer, nie chyba. Starý index slúži, kým sa nový stavia.

V2 pridala k `entities` druh kauzy: `case_kind` (viachodnotové, filter
`?case_kind=`), `kind_main` (hlavný druh, faseta), `has_kind` (`true|false`, pracovný zoznam
káuz bez druhu), `kind_list` a — len ak má
zdroj — `has_impact`, `impact_value`, `impact_unit` na kartu nefinančnej kauzy.
Druh kauzy nie je `kind`, to pole patrí druhu subjektu (strana, firma, inštitúcia).

## Väzby: čo je kde uložené

Kto s kým súvisí, nie je na jednom mieste, a je to zámer — každá väzba je uložená
tam, kde vzniká tvrdenie:

| Väzba | Kde je uložená | Ako sa číta |
| --- | --- | --- |
| entita v kauze a jej rola | `role.case_id` + `person_id`/`org_id` | `by_case/children`, `by_person/cases` |
| článok o kauze, osobe, subjekte | `article.case_ids`, `person_ids`, `org_ids` | `by_article/entity` |
| konanie proti entite | `proceeding.person_ids`, `org_ids` | `proceedings/by_entity` |
| konanie sa opiera o dokument | `proceeding.sources` | `proceedings/by_source` |
| osoba ↔ subjekt (členstvo, štatutár, …) | `link.from_id`/`to_id` + `kind` | `by_person/links` |

Väzby na entity idú cez **views, nie cez Clouseau**: odpoveď musí byť presná
a platná hneď po zápise, nie až keď sa index doindexuje. Fulltext nad článkami
zostáva v `search/articles`; `org_id` v ňom nie je, lebo zmena indexovacej funkcie
znamená celý rebuild Lucene (`couchman.md`), zatiaľ čo view stojí prestavbu
jedného view.

## Denormalizácia, s ktorou treba počítať

Lucene nevie join. `case` preto nesie `person_ids[]` a `party_ids[]`, aby sa dalo
filtrovať kauzy podľa osoby a podľa politickej strany. Tieto polia **udržiava
zapisovacia vrstva** v `packages/shared` pri každej zmene `role` a `link` — nie
sú v dátovom modeli zadania §2.2, ale bez nich sa filter zo zadania §4.1 nedá
postaviť.

## Čo view `stats/coverage` nevie

Počíta dokumenty, sourced polia, koľko z nich má zdroj, koľko je odvodených a
koľko sporných. **Nevie** povedať, koľko údajov stojí na *úradnom* zdroji —
`kind` je na dokumente `article` a map funkcia vidí vždy len jeden dokument.
Tento pomer (metrika zo zadania §9) sa musí dopočítať v API rozpustením `sources`
na `article` dokumenty.

## `validate_doc_update`

Zapisovať by mala len vrstva v `packages/shared`. „Malo by sa" ale nie je
invariant — worker, `curl` počas incidentu aj nedokončená migrácia siahajú na tú
istú databázu. Čo nesmie nastať, je vynútené v `rules/validate_doc_update.js`:

- `type` je známy a `_id` má tvar `<type>:<uuid7>`; typ sa nedá zmeniť,
- **publikovaný dokument nesmie mať sourced pole bez zdroja** — kvôli tomuto
  pravidlu ten súbor existuje (produktové zadanie §4.6),
- `role`, `link`, `event`, `proceeding` majú vždy neprázdne `sources[]`,
- **rola viaže ku kauze osobu alebo subjekt** (`person_id` alebo `org_id`), práve
  jedno z dvoch: aj firma môže byť v kauze obvinená, ale rola, ktorá by hovorila
  o oboch naraz, nehovorí o nikom,
- podnet bez `source_urls` sa neprijme,
- odvodený údaj musí opísať postup odvodenia (`derivation`) — je to naše
  tvrdenie, nie prevzatá citácia,
- `revision` je append-only, `session` nesmie obsahovať surový token,
- položka číselníka (`codelist`) má `code` a `name`, **kód sa nikdy nemení** (je
  to kľúč, na ktorý sa odkazuje z dokumentov) a pri číselníkoch viazaných na
  enum — `event_category`, `link_type` — musí byť kód z toho enumu; číselník im
  drží slovenský názov, nie zoznam hodnôt,
- enumy (`phase`, `role`, `kind`, `status`, …) podľa zadania §2.2,
- **fázy konania** sú `investigation, charges, indictment, trial, appeal,
  convicted, acquitted, halted, lapsed`. Pôvodné `final` sa rozdelilo na
  odsúdenie a oslobodenie (dva opačné konce, metrika ich musí rozlíšiť) a
  pribudlo `lapsed` — rozhodnutie vlastníka z 15. 11. 2026,
- **zverejnená kauza musí mať druh** (`kind`, sourced, neprázdny zoznam kódov
  `public_money | investigation_interference | abuse_of_power |
  elections_party_finance | conflict_of_interest | other`, prvý je hlavný). Koncept
  smie mať zoznam prázdny,
- `impact` má hodnotu `{ value: číslo, unit, note? }`, `recovered_amount` je
  nezáporné celé číslo v centoch,
- číselník `phase` má povinný `bucket` (segment metriky „Peniaze v kauzách":
  `none | investigation | charge | trial | convicted | acquitted | discontinued |
  lapsed`) — mapovanie fáza → segment je v dátach, nie v kóde, aby ho vedel
  upraviť moderátor; kauza bez fázy patrí do `none`,
- `event.proceeding_id`, ak je, je id konania (že patrí tej istej kauze, overuje
  API — validácia nečíta iné dokumenty).

**Migrácia na produkcii (míľnik 2).** Existujúci dokument s fázou `final` sa po
nasadení nedá upraviť, kým mu moderátor nevyberie `convicted` alebo `acquitted`
— automaticky sa to rozhodnúť nedá, sú to opačné výsledky. Zverejnená kauza bez
`kind` sa rovnako nedá upraviť, kým druh nedostane (so zdrojom). Zoznam na
dorobenie:

```bash
curl -sG "$DB/_design/search_v2/_search/entities" --data-urlencode 'q=type:case AND phase:final'
curl -s "$DB/_design/proceedings/_view/by_court?reduce=false" | grep '"phase":"final"'
# kauzy bez druhu
curl -sG "$DB/_design/search_v2/_search/entities" \
  --data-urlencode 'q=type:case AND has_kind:false'
```

A pred štartom novej verzie API treba prepnúť alias: `couchman push`, `warm
--ddoc=search_v2`, `promote search_v2 search`. Bez toho API odmietne štart a
povie prečo.

Čo takto vynútiť nejde: že ku každému zápisu vznikla `revision` (validácia vidí
jeden dokument, nie dávku) a že `sources` naozaj ukazujú na existujúci `article`
(vo validácii sa nedajú čítať iné dokumenty). Toto ostáva na zapisovacej vrstve.

Vyskúšanie:

```bash
curl -s -X PUT "$DB/case:0192a1b0-7c05-7000-8000-0000000000ff" -H "Content-Type: application/json" \
  -d '{"type":"case","created_at":"2026-01-01","updated_at":"2026-01-01","created_by":"u","updated_by":"u","title":"T","publish_state":"published","summary":{"value":"x","sources":[]}}'
# {"error":"forbidden","reason":"cannot publish … field `summary` has no source…"}
```

## Testovacie dáta

Fixtures sú **vymyslené**. Osoby, firmy, súdy aj médiá v nich neexistujú
(Testovací, Skúšobná, TestBuild, Okresný súd Testovice, Denník Skúška, domény
`*.example`). Je to zámer: produkt eviduje trestné statusy skutočných ľudí, a
takéto tvrdenie nepatrí do vývojárskeho seedu. Jediné reálne dáta sú štyri
MVP feedy v `00-feeds.json` — to je konfigurácia, nie tvrdenie o niekom (URL
overené 7. 8. 2026, všetky vracajú 200).

Dátová sada pokrýva cesty, na ktorých sa dá pomýliť:

| Súbor | Čo demonštruje |
| --- | --- |
| `20-cases.json` | publikovaná kauza s kompletným zdrojovaním; **sporná suma** (`disputed`) — dva zdroje, dve čísla, systém medzi nimi nerozhoduje; **draft** založený matcherom, bez jediného zdroja |
| `30-roles.json` | zmena statusu ako *nový* dokument — `suspect` uzavretý `valid_to`, `indicted` otvorený; oslobodenie rovnako viditeľné ako obžaloba |
| `31-events.json` | časová os dozadu aj **dopredu** (`kind: expected`, pojednávanie 15. 9. 2026) |
| `33-links.json` | `derived: true` s popisom odvodenia — hranica medzi citovaním a vlastným tvrdením |
| `40-articles.json` | médiá aj úradný dokument (`kind: official`), plné texty pre matching a fulltext, jeden nespárovaný `candidate` |
| `50-suggestions.json` | podnet používateľa, návrh bota s `confidence`, prijatý podnet, návrh novej kauzy bez `target.id` |
| `51-revisions.json` | audit s JSON Patch diffom a dôvodom |
| `05-codelists.json` | oba druhy číselníka naraz: voľné (súdy, tagy — presne tie, ktoré nesú konania a kauzy vo fixtures) a viazané na enum (kategórie udalostí, typy prepojení, fázy so segmentom metriky, druhy káuz) |

`60-users.json` obsahuje troch používateľov len kvôli referenčnej integrite
(`created_by`, `subscription.user_id`). Majú `password_hash: "PLACEHOLDER-NO-LOGIN"`
a `status: "blocked"` — do fixtures nepatria heslá ani ich hashe. Prvý skutočný
admin sa podľa zadania §7 zakladá ručne, mimo tohto stromu.

### Generované dáta (`7x-gen-*.json`)

Dizajn „Červená niť" potrebuje objem: krivky článkov za 24 mesiacov, rebríček
„najviac sa píše", zabudnuté kauzy, Sieť do dvoch krokov s orezaním na 60
uzlov. Ručne sa to písať nedá, preto `fixtures/generate.js`:

- 50 káuz (9 nefinančných zo všetkých druhov; všetkých 8 segmentov metriky;
  4 sporné sumy; 4 zabudnuté — otvorené, ≥ 20 článkov, rok ticho; 2 s
  pojednávaním do 30 dní; pri časti odsúdených káuz je jeden z obvinených
  oslobodený), 320 osôb, 126 subjektov, ~870 prepojení, ~1 980 článkov
  v rokoch 2019–2026,
- štyri „uzlové" osoby s desiatkami firiem — Sieť do dvoch krokov u nich
  presiahne 60 uzlov,
- **deterministický**: pevný seed a pevný referenčný dátum `REF` (15. 11. 2026),
  takže výstup sa dá commitnúť a diff má zmysel. Keď dáta zostarnú (budúce
  termíny sa stanú minulými), posuň `REF` a pregeneruj,
- IČO sa negeneruje — vymyslené osemciferné číslo môže patriť skutočnej firme.

`test/fixtures-generated.test.js` overuje nad súbormi (bez databázy) všetko
vyššie plus to, že každý zdroj existuje, žiadna rola nekončí pred začiatkom a
`person_ids` kauzy sedia s rolami. Prvé nahratie cez tunel trvá niekoľko minút
(couchman zapisuje dokument po dokumente).

Fixture nikdy neprepíše dokument, ktorý niekto upravil ručne — `couchman` si
pamätá hash naposledy nahranej verzie a nesúlad iba ohlási.

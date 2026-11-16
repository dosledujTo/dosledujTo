# REST API — register káuz

Node.js 22+, ESM, Express 5, zod, pino, nano. **Bez TypeScriptu** (odchýlka od
`backend-zadanie.md` §1 na požiadanie); typy sú v JSDoc, takže editor aj `tsc
--checkJs` s nimi vedia pracovať bez build kroku.

```bash
npm run api          # http://127.0.0.1:3000  (konfiguráciu číta z .env)
npm test             # vitest + supertest proti bežiacej CouchDB
```

API sa **nespustí**, kým nie je dostupná CouchDB, Clouseau a všetky design
dokumenty. Prázdne výsledky vyhľadávania vyzerajú ako „taká kauza neexistuje" —
to je odpoveď, ktorú tento produkt nesmie dať omylom.

## Štruktúra

```
packages/shared/src     dátová vrstva — nikto nepíše do CouchDB mimo nej
  config.js             env cez zod, fail fast pri štarte
  couch.js              jediné miesto, ktoré volá nano
  store.js              zápis + revízia; publishDoc kontroluje zdroje
  queries.js            map/reduce views (vzťahy, agregácie)
  search.js             _search + bookmark → next_cursor
  lucene.js             escapovanie a skladanie query
  sourced.js            vzor sourced value
  projection.js         čo smie von verejným API
  schemas.js            zod schémy požiadaviek
  sessions.js           session v CouchDB, v DB len hash tokenu
  jsonpatch.js          diff pre audit + apply pre revert
packages/api/src
  app.js  server.js     Express aplikácia a štart
  middleware/           auth, csrf, ratelimit, captcha, validate, errors
  routes/public/        verejné endpointy
  routes/admin/         moderátorské a adminské endpointy
  lib/                  hydratácia zdrojov, denormalizácia väzieb
```

`worker` (crawler, matcher, notifikátor — zadanie §8) zatiaľ neexistuje. API s
ním komunikuje výhradne cez databázu, takže sa dá doplniť bez zásahu sem.

## Konvencie

- Prefix `/api`, routy anglicky, obsah a chybové hlášky slovensky.
- Chyby: `{ "error": { "code", "message", "details" } }`, kódy `VALIDATION_FAILED`
  (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
  `CONFLICT` (409), `RATE_LIMITED` (429).
- Stránkovanie kurzorom: `?limit=20&cursor=<bookmark>` → `{ items, next_cursor, total }`.
- Sumy v centoch ako integer, dátumy ISO 8601.
- **Klient nikdy neposiela Lucene query.** Filtre sú whitelist parametrov, ktoré
  server skladá a escapuje.
- CSRF: `GET /api/auth/csrf` vydá token do cookie aj do tela; každá non-GET
  požiadavka ho musí poslať v hlavičke `x-csrf-token`.
- Cookie `sid` je `HttpOnly; SameSite=Lax; Path=/`, first-party. CORS sa
  nekonfiguruje — frontend a API sú na rovnakej doméne.

## Endpointy

### Verejné

| Metóda | Cesta | Poznámka |
| --- | --- | --- |
| GET | `/api/health` | stav API, CouchDB a Clouseau |
| GET | `/api/search` | `?q=&type=case\|person\|org\|article` |
| GET | `/api/cases` | `?status=&phase=&case_kind=&party=&person_id=&tag=&amount_min=&amount_max=&from=&to=&sort=` + fasety (`kind_main` = hlavný druh) |
| GET | `/api/stats` | stav registra + `money` (8 segmentov, `derived`), `non_money`, `top_entities`, `official_share` |
| GET | `/api/cases/top` | `?period=30d\|12m\|all&limit=` — skóre, články, médiá, trend, `spark[24]` |
| GET | `/api/cases/forgotten` | `?limit=` — prahy `FORGOTTEN_MIN_ARTICLES`, `FORGOTTEN_SILENCE_DAYS` |
| GET | `/api/cases/latest` | `?limit=` — posledný pohyb (článok/udalosť) + `correction` |
| GET | `/api/cases/:id` | kauza + role, udalosti, konania, súvisiace kauzy, **mapa zdrojov** |
| GET | `/api/cases/:id/timeline` | `?kind=past\|expected` |
| GET | `/api/cases/:id/persons` | osoby vrátane historických rolí |
| GET | `/api/{cases,persons,orgs}/:id/articles` | zdroje po stránkach: `?page=&per_page=(≤50)&type=official\|media&case=<slug\|id>&sort=desc\|asc` → `{ items, total, page, per_page, pages, facets }`; položka má stabilné `no` a `supports[]` |
| GET | `/api/{cases,persons,orgs}/:id/graph` | `?depth=1\|2&active=1&derived=0&cases_only=1&events=1` → `{ nodes, edges, truncated, sources, events?, insights? }`, max 60 uzlov; `insights` = prekrytia (odvodené) |
| GET | `/api/persons` | `?q=` alebo `?party=` / `?case_id=&role=` |
| GET | `/api/persons/:id`, `/api/orgs/:id` | profil + prepojenia + `counts` (kauzy · firmy a strany · ľudia v okolí · zdroje) + `source_nos` |
| GET | `/api/persons/:id/cases` | kauzy s rolou v každej |
| GET | `/api/orgs` `/api/orgs/:id` | `?kind=party` — zoznam nie je v zadaní, ale filter káuz podľa strany ho potrebuje |
| POST | `/api/cases/:id/suggestions` | aj neprihlásený |
| POST | `/api/persons/:id/suggestions`, `/api/orgs/:id/suggestions` | |
| POST | `/api/suggestions` | návrh novej kauzy (`target.id: null`) |
| GET | `/api/suggestions/mine` | |
| POST | `/api/auth/register` `/login` `/logout`, GET `/api/auth/csrf` | |
| GET/PATCH | `/api/profile` | |
| GET/POST/DELETE | `/api/subscriptions` | |
| GET | `/api/notifications`, POST `/api/notifications/:id/read` | |

### Administratívne (`requireRole('moderator')`, označené `(admin)`)

`GET /api/admin/summary` · `GET /api/admin/suggestions[/:id]` ·
`POST /api/admin/suggestions/:id/accept|reject` ·
`GET/PATCH/POST /api/admin/articles[/:id]` ·
`POST /api/admin/cases` · `GET/PATCH /api/admin/cases/:id` ·
`POST /api/admin/cases/:id/publish|hide (admin)|roles|events|proceedings` ·
`POST/PATCH /api/admin/persons[/:id]` · `POST /api/admin/persons/merge (admin)` ·
`POST/PATCH /api/admin/orgs[/:id]` ·
`POST /api/admin/links` · `PATCH/DELETE /api/admin/links/:id` ·
`GET /api/admin/revisions` · `POST /api/admin/revisions/:id/revert (admin)` ·
`GET /api/admin/codelists` · `POST /api/admin/codelists (admin)` ·
`PATCH /api/admin/codelists/:id (admin)` ·
`GET/PATCH /api/admin/users[/:id] (admin)` ·
`GET /api/admin/feeds (admin)` · `POST /api/admin/feeds/:id/run`

## Rozhodnutia, ktoré stoja za vysvetlenie

**Zdroj patrí k údaju, nie k dokumentu.** `GET /api/cases/:id` vracia okrem
kauzy aj mapu `sources` so všetkými citovanými článkami — jedným hromadným
čítaním. Bez nej by stránka kauzy stála jednu požiadavku na každú poznámku pod
čiarou. Pole bez zdroja sa vo verejnej odpovedi **nevyskytne vôbec**; „nemáme
nič" a „máme niečo nezdrojované" musia zvonku vyzerať rovnako.

**Prijatie podnetu nepridá zdroj.** Podnet nesie URL, nie `article` id. URL sa
stane zdrojom až keď ju niekto stiahne, datuje a priradí vydavateľa. Prijatá
hodnota preto zdedí zdroje, ktoré už boli overené, a kým sa nový článok
nezaloží, pole sa nedá zverejniť. Je to zámer, nie medzera.

**Revert je prehratie histórie, nie inverzný patch.** JSON Patch nezaznamenáva,
čo prepísal. Reťaz revízií ale začína vznikom dokumentu, takže stav pred
ľubovoľnou zmenou sa dá zrekonštruovať prehratím všetkých starších diffov.
Samotný revert je nová revízia — audit, ktorý sa dá pretočiť, nie je audit.

**Revízie sa nepíšu pre `session`, `notification` a `subscription`.** Zadanie
§2.2 hovorí „pri každom zápise"; revízia pri každom prihlásení a prečítanom
upozornení by pochovala redakčnú históriu, kvôli ktorej log existuje. Zápis ide
cez rovnakú vrstvu, len sa neaudituje.

**Hash hesla sa do revízie nedostane.** Zmena hesla je v audite viditeľná ako
`[secret:<12 hex>]` — mení sa, keď sa mení heslo, a neprezrádza nič.

**`case.person_ids` a `case.party_ids` prepočítava API.** Lucene nevie join,
takže filter káuz podľa osoby a podľa politickej strany potrebuje denormalizáciu
(viď `couch/README.md`). Prepočet beží po zmene roly a po zmene prepojenia, v
`lib/denormalise.js`.

**Rola viaže ku kauze osobu alebo subjekt.** `POST /api/admin/cases/:id/roles`
berie `person_id` **alebo** `org_id`, práve jedno z dvoch (inak 422, a rovnako to
stráži `validate_doc_update`). Firma stíhaná v kauze bola dovtedy pripojiteľná
len nepriamo — cez členstvo svojich ľudí — a to je iná vec než obvinenie. Profil
subjektu preto vracia oboje osobitne: `cases` (priama rola) a `org_cases` (kauzy
odvodené z členstva).

**Väzby sa čítajú z views, nie z Clouseau.** `GET /api/admin/persons/:id` aj
`/orgs/:id` vracia `articles` a `proceedings` z map/reduce views — priradenie
musí byť vidieť hneď po uložení, nie až po doindexovaní. Detail článku k tomu
pridáva `proceedings`: konania, ktoré sa oň opierajú, aby moderátor to isté
rozhodnutie nepripájal druhýkrát.

**Číselník je dvoch druhov, nie jedného.** `court` a `case_tag` si obsah určujú
samy — hodnota v dokumente je názov súdu, resp. kód tagu, obyčajný reťazec ako
doteraz; číselník mu dáva jedno miesto, kde vzniká, a tým aj možnosť filtrovať.
`event_category` a `link_type` sú viazané na enum vo `validate_doc_update`:
pridať do nich hodnotu nemá zmysel, lebo databáza by taký dokument odmietla,
takže číselník im drží iba slovenský názov ku kódu a poradie v ponuke. `POST`
preto odmietne kód mimo enumu (422) a kód sa nikdy nemení — je to kľúč.

**Položka číselníka sa nemaže, deaktivuje sa** — a názov súdu, ktorý je vedený
v konaniach, sa nedá ani premenovať (422 s počtom konaní), lebo v konaní je
zapísaná hodnota, nie odkaz. Správna cesta je založiť nový súd a starý
deaktivovať: existujúce konania tak zostanú čitateľné a nový názov platí odteraz.
Rovnaký rozdiel ako medzi ukončením a zmazaním role.

**Rate limit je v pamäti procesu.** Redis v stacku nie je a CouchDB je zlý
nástroj na počítadlo, ktoré sa mení pri každej požiadavke. Pri viacerých
inštanciách API prestanú byť limity globálne — vtedy to musí ísť do zdieľaného
úložiska.

**Captcha je rozhranie s dvoma implementáciami**, ako `Mailer` v zadaní §8.3. Bez
`TURNSTILE_SECRET` beží povoľná implementácia a API to pri štarte nahlási; v
produkcii sa bez tajomstva nespustí vôbec.

**Zdroje a graf (handoff „Červená niť" kap. 7.1–7.2) žijú v
`shared/src/connections.js`.** Dve veci, ktoré sa ľahko pokazia:

- `no` zdroja je poradie v **celom nefiltrovanom** zozname entity (úradné prvé,
  potom od najnovšieho, pri zhode `_id`). Filter, triedenie ani stránka ho
  nemenia a graf vracia to isté číslo v `source_nos`. Zdroje osoby a subjektu
  sú priradené články **plus** články citované v ich rolách a prepojeniach
  (rozhodnutie vlastníka 15. 11. 2026). Zamietnutý článok vypadne, len ak ho
  nič necituje.
- Graf ide cez view `graph/edges` kľúčované len id entity, takže krok grafu je
  **jeden** dotaz s `keys` bez ohľadu na počet uzlov; uzly sa dočítajú jedným
  `_all_docs`. Test `connections.test.js` počíta dotazy do CouchDB. Hrana
  osoba ↔ osoba vzniká len zo skutočného `link`; nezverejnené uzly vypadnú aj
  s hranami. Pri viac ako 60 uzloch sa nechajú tie z prvého kroku, potom podľa
  počtu spoločných káuz so stredom, a odpoveď to povie v `truncated`.

## Prvý admin

Registrácia cez API vytvára **vždy** len `role: user` a žiadna cesta v API
nevyrobí admina. Prvý účet zakladá skript, ktorý beží mimo API — musí ho
spustiť niekto s prístupom na server:

```bash
npm run admin:create -- --email=ty@example.sk --role=superadmin
```

Heslo sa pýta interaktívne, bez vypisovania na obrazovku, aby neskončilo
v histórii shellu (alebo cez `ADMIN_PASSWORD`, ak to volá iný skript).
V kontajneri:

```bash
docker compose exec -it pm2-api-admin npm run admin:create -- --email=ty@example.sk --role=superadmin
```

Skript odmietne e-mail, ktorý už existuje, aj databázu bez design dokumentov,
a v audite je vidieť, že účet nevznikol registráciou (`system:create-admin`).
Ďalšie roly už prideľuje admin cez `PATCH /api/admin/users/:id`.

Roly sú kumulatívne: `superadmin ⊃ admin ⊃ moderator ⊃ user`. Prvá vec, ktorú
`superadmin` otvára navyše, je **správa admin účtov**: `PATCH
/api/admin/users/:id` upravuje profil (`display_name`), rolu a stav účtu
(`active | blocked`) a rozhoduje sa v ňom podľa roly volajúceho —

- `superadmin` upraví ktorýkoľvek účet vrátane admin a superadmin účtov,
- `admin` upraví moderátorov a bežných používateľov, ale nie účet iného admina
  (403) a neprideľuje rolu vyššiu, než má sám (403),
- vlastný účet cez tento endpoint neprejde — na profil je `PATCH /api/profile`;
  inak by si admin vedel odobrať rolu alebo deaktivovať sám seba.

Deaktivovaný účet (`status: "blocked"`) sa neprihlási a `attachUser` mu zruší
prebiehajúcu session. Ktoré ďalšie akcie majú byť výhradne superadminove
(mazanie kauzy, revert revízie, feedy) je rozhodnutie zo zoznamu
v `admin-zadanie.md` §12.

## Testy

`npm test` — 38 testov: escapovanie vstupu do Lucene query, diff a prehratie
revízií (jednotkové), a integračné proti reálnej CouchDB s Clouseau: autorizácia,
validácia sourced polí pri zverejňovaní, zápis revízií, konflikt na `_rev`,
prijatie a zamietnutie podnetu.

Testy si vytvárajú vlastné dokumenty a po sebe upratujú, ale bežia proti
**rovnakej databáze** ako vývoj. Zadanie §9 chce testcontainers s CouchDB +
Clouseau; to je zatiaľ nedoplnené a je to najbližší nedostatok, ktorý stojí za
odstránenie.

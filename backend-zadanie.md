# Zadanie pre backend: Register káuz

Nadväzuje na `kauzy-produktove-zadanie.md`. Pokrýva MVP (kapitola 7 produktového zadania) a pripravuje miesto pre fázu 2.

## 1. Stack a procesy

- **Node.js 22 LTS**, ESM, TypeScript.
- **Express 5**, validácia cez **zod**, logovanie **pino**.
- **CouchDB 3.4 s Clouseau** (Lucene search plugin, `_search` cez Dreyfus), klient **nano**.
- Session store v CouchDB (viď 7).

Clouseau je samostatný JVM proces bežiaci vedľa CouchDB, so zdieľaným Erlang cookie. V Dockeri buď hotový image s predinštalovaným Clouseau, alebo vlastný build nad `apache/couchdb:3.4` + OpenJDK 8. Bez neho `_search` vráti chybu — `api` to musí kontrolovať pri štarte a spadnúť, nie tíško degradovať na prázdne výsledky.

Dve samostatne spustiteľné aplikácie nad zdieľanou knižnicou:

```
/packages
  /shared     dátový model, zod schémy, CouchDB prístup, design dokumenty
  /api        Express, verejné + admin API
  /worker     crawlery, parsery, matching, notifikácie
```

`api` a `worker` sa nasadzujú a škálujú nezávisle. Komunikujú **cez databázu**, nie priamo — worker zapisuje návrhy a číta `_changes`. Žiadna message queue v MVP.

## 2. Dátový model

Jedna databáza `register`. Každý dokument má `type`, `_id` v tvare `<type>:<uuid7>`, `created_at`, `updated_at`, `created_by`, `updated_by`.

### 2.1 Sourced value — nosný vzor

Produktové zadanie 4.6 hovorí, že zdroj patrí ku **každému údaju**, nie k dokumentu. Preto každé zdrojovateľné pole nie je skalár, ale objekt:

```json
"amount": {
  "value": 12500000,
  "unit": "EUR",
  "sources": ["article:018f...", "article:018a..."],
  "derived": false,
  "derivation": null,
  "disputed": [
    { "value": 9000000, "sources": ["article:0190..."] }
  ],
  "asserted_at": "2025-03-11"
}
```

- `sources` — pole ID dokumentov typu `article`. **Prázdne pole = údaj sa nezverejní** (validácia pri publikovaní).
- `derived: true` + `derivation` (textový popis postupu) — pre údaje odvodené z registrov, kde tvrdenie je naše (zadanie 5.10).
- `disputed` — alternatívne hodnoty pri rozpore zdrojov. API ich vracia, nerozhoduje medzi nimi.
- Ak jeden zo zdrojov je `kind: "official"`, `value` má byť z neho (zadanie 4.6: úradný dokument má prednosť).

Zdrojovateľné polia: `summary`, `status`, `amount`, rola osoby, dátum udalosti, prepojenie. Nezdrojovateľné (technické): `slug`, `tags`, `created_at`.

### 2.2 Typy dokumentov

**`case`** — kauza
```
title, slug, summary(sourced), status(sourced: open|closed),
phase(sourced: investigation|charges|indictment|trial|appeal|final|halted|acquitted),
amount(sourced), started_on, closed_on, tags[],
related_case_ids[](sourced), publish_state: draft|published|hidden
```

**`person`** — osoba
```
full_name, name_variants[], slug, birth_year, short_bio(sourced),
publish_state
```
`name_variants` je kritické pre matching (pády, prechyľovanie, diakritika, iniciály z policajných správ).

**`org`** — subjekt: `kind: party|company|institution`, `ico`, `name`, `name_variants[]`.

**`role`** — väzba osoba ↔ kauza. Samostatný dokument, lebo rola má vlastný zdroj a vlastnú platnosť v čase.
```
case_id, person_id,
role: suspect|accused|indicted|convicted|acquitted|witness|victim|
      investigator|prosecutor|judge|other,
sources[], valid_from, valid_to, note
```
Zmena statusu = **nový** `role` dokument s `valid_from`, starý dostane `valid_to`. História sa neprepisuje — zadanie 6 vyžaduje, aby oslobodenie bolo vidieť rovnako viditeľne ako obvinenie.

**`link`** — väzba osoba ↔ osoba / osoba ↔ org / org ↔ org.
```
from_id, to_id, kind: member|statutory|owner|ubo|family|business|other,
valid_from, valid_to, sources[], derived, derivation
```

**`event`** — položka časovej osi.
```
case_id, occurred_on, kind: past|expected, category: charge|hearing|verdict|
appeal|seizure|other, title, description, sources[], person_ids[]
```
`kind: expected` pokrýva „časovú os dopredu". V MVP zadáva moderátor ručne; vo fáze 2 z InfoSúdu.

**`proceeding`** — súdne konanie: `case_id, court, file_number (spisová značka), phase, decisions[], sources[]`. Spisová značka je jediný praktický kľúč na spárovanie anonymizovaného rozhodnutia (zadanie 5.10).

**`article`** — zdroj. Napriek názvu pokrýva aj úradné dokumenty.
```
kind: media|official, url, canonical_url, archive_url, title, publisher,
published_at, fetched_at, author, excerpt, content_hash,
status: candidate|processed|linked|rejected,
case_ids[], person_ids[], feed_id
```
- **Plný text sa uchováva natrvalo** — v `_attachments` (gzip `text/plain`) a v poli `body` pre search index. Potrebujeme ho na matching, na fulltext a na porovnanie, keď médium článok zmení alebo stiahne.
- **Cez API sa plný text nikdy nevracia.** Verejne ide von `excerpt` (max ~300 znakov), titulok, vydavateľ, dátum a odkaz. Zadanie 10: preberáme fakty a odkazujeme, nekopírujeme texty. Moderátor text vidí v admin rozhraní ako pracovný podklad, nie ako publikovateľný obsah.
- Pri opakovanom stiahnutí toho istého URL s iným `content_hash` sa uloží nová verzia textu a založí `suggestion` typu „zdroj sa zmenil" — to je odpoveď na otvorenú otázku zo zadania 11 (čo s údajom, ktorý médium neskôr opraví).
- `archive_url` — kópia v archive.org, aby údaj zostal dohľadateľný (zadanie 4.6).

**`suggestion`** — podnet na zmenu. Jeden typ pre ľudské aj automatické návrhy.
```
origin: user|bot, author_id|null, submitter_email|null,
target: { type: case|person|org, id, path|null },
      // path: "amount" = podnet ku konkrétnemu údaju
      // path: null     = podnet k celej kauze/osobe
proposed_value, current_value_snapshot, source_urls[], comment,
status: pending|accepted|rejected|needs_info,
reviewed_by, reviewed_at, review_note, confidence  // len pre bot
```
- Podnet **bez** `source_urls` sa neprijíma (validácia, HTTP 422).
- Podnet sa vždy viaže na konkrétnu **kauzu alebo osobu** (`target.id`), buď k jednému údaju (`path`), alebo k entite ako celku. Vo formulári to znamená, že používateľ podáva podnet z konkrétnej stránky, nie do prázdna.
- Výnimka: návrh na **novú** kauzu alebo osobu má `target.id: null`, povinný `comment` a `source_urls`, a ide do rovnakej fronty.

**`revision`** — audit. CouchDB `_rev` na to nestačí, compaction ho zmaže.
```
target_type, target_id, target_rev_before, target_rev_after,
diff (JSON Patch), actor_id, actor_role, at, suggestion_id|null, reason
```
Zapisuje sa **pri každom zápise** cez jedinú vrstvu v `shared` — nikde inde sa do DB nepíše priamo.

**`user`** — `email, password_hash, display_name, role: user|moderator|admin, status: active|blocked, created_at, last_login_at, notification_prefs`.

**`session`** — `user_id, expires_at, ip_hash, user_agent`. TTL job maže staré.

**`subscription`** — `user_id, target_type: case|person|org, target_id, frequency: instant|daily|weekly, level: all|significant`.

**`notification`** — `user_id, subscription_id, event_ids[], state: pending|sent|read, sent_at`.

**`feed`** — sledovaný zdroj: `name, kind: rss|sitemap|html, url, publisher, enabled, crawl_interval_min, last_run_at, last_etag, robots_ok, paywall`.

### 2.3 Indexy a views

**Mango (`_find`) sa nepoužíva.** Zoznamy, filtre a vyhľadávanie idú cez search indexy (Clouseau/Lucene), bodové čítania cez `_id`, vzťahy a agregácie cez map/reduce views.

Search indexy (`_design/search/indexes/...`), indexovacie funkcie v JS:
- `entities` — spoločný index pre `case`, `person`, `org`: `type`, `title` / `full_name`, `name_variants`, `slug`, `tags`, `status`, `phase`, `amount` (number, facet), `started_on` a `updated_at` (epoch number, sort), `party_ids`, `person_ids`, `publish_state`. Jedna query tak obslúži `/api/search` aj filtrovanie na `/api/cases`.
- `articles` — `title`, `body` (plný text), `publisher`, `kind`, `published_at`, `status`, `case_ids`, `person_ids`.
- `moderation` — `suggestion`: `status`, `origin`, `target_type`, `created_at`, `confidence`. Fronta moderátora je search query.

Pravidlá pre indexovacie funkcie:
- Bežia v JS sandboxe pri každom zápise. Drž ich jednoduché — výnimka v indexovacej funkcii dokument z indexu tíško vynechá.
- Zmena indexovacej funkcie znamená build indexu od nuly. Verzionuj názov design dokumentu (`_design/search_v2`) a prepni ho v konfigurácii až po dobehnutí buildu.
- Dátumy indexuj ako epoch number, nie string, inak nefunguje rozsah ani triedenie. `store: true` len tam, kde hodnotu naozaj čítame z výsledku.

Map/reduce views (na to, čo Lucene nevie):
- `by_case/children` — `role`, `event`, `proceeding` pre kauzu jedným dotazom (`startkey`/`endkey`, `include_docs`)
- `by_person/cases` — kauzy podľa osoby vrátane rolí
- `by_target/subscriptions` — odberatelia daného cieľa, pre notifikátor
- `slugs/unique` — kontrola unikátnosti slugov
- `stats/coverage` — podiel údajov so zdrojom a s úradným zdrojom (metriky, zadanie 9)

Design dokumenty sú v `shared` ako súbory a nasadzujú sa migračným skriptom, nie ručne cez Fauxton.

## 3. Vyhľadávanie a filtre

Všetko cez `_search`, napr. `/register/_design/search/_search/entities?q=...&sort=...&limit=&bookmark=`.

- Filtre z API sa skladajú **na serveri** do Lucene query: `type:case AND publish_state:published AND status:open AND amount:[1000000 TO 50000000]`.
- Klient nikdy neposiela Lucene query. Voľný text sa escapuje (`+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /`), rozdelí na tokeny a poskladá; ostatné filtre sú whitelist parametrov.
- **Diakritika**: v indexovacej funkcii ukladaj aj normalizovanú kópiu (NFD, bez diakritiky, lowercase) do samostatného poľa a hľadaj v oboch. Analyzer to sám nespraví.
- **Analyzer** nastav explicitne. Slovenský stemmer v Clouseau nie je; najbližšie je `standard` nad normalizovaným poľom. Pádové tvary preto ostávajú na `name_variants`, nie na Lucene.
- **Triedenie**: `sort: ["-amount<number>"]`, `["-updated_at<number>"]`.
- **Stránkovanie**: `bookmark` z odpovede sa mapuje na `next_cursor` v API. `limit` max 200.
- **Fasety** (`counts`, `ranges`) použi na počty pri filtroch — ušetria druhý dotaz.
- `include_docs=true` len tam, kde treba celý dokument; inak čítaj `store: true` polia priamo z indexu.

Fulltext v telách článkov je vďaka Clouseau k dispozícii od začiatku (index `articles`, pole `body`). Externý search engine v pláne nie je.

S čím počítať: Clouseau žerie 1–2 GB RAM navyše, prvý build indexu nad väčším objemom článkov trvá, a `_search` nevie join — vzťahy sa dočítavajú z views.

## 4. API — konvencie

- Prefix `/api`. Verejné pod `/api/...`, administratívne pod `/api/admin/...` v tej istej Express aplikácii, oddelené `requireRole('moderator')` middlewarom. Samostatný port nemá v tejto fáze zmysel; pri nasadení sa `/api/admin` dá obmedziť na reverse proxy úrovni.
- Názvoslovie routov je **anglické** (`/cases`, `/persons`, `/orgs`, `/articles`). Slovenčina zostáva v UI a v obsahu, nie v API.
- Paginácia **cursor-based** cez `bookmark` z `_search`: `?limit=20&cursor=<bookmark>`. Odpoveď: `{ items: [], next_cursor: string|null, total: number|null }`. `total` dopĺňaj len tam, kde ho vieme dať lacno (`_search` ho vracia ako `total_rows`).
- Klient **nikdy** neposiela Lucene query. Filtre sú whitelist parametrov, ktoré server skladá do query (viď 3).
- Chyby: `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [...] } }`. Kódy: `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409, CouchDB rev konflikt), `RATE_LIMITED` (429).
- Dátumy ISO 8601, sumy v centoch ako integer.
- Verejné GET endpointy vracajú len `publish_state: published` a len údaje s neprázdnym `sources`.

## 5. API — verejné

```
GET    /api/health                       stav api + couchdb
GET    /api/search?q=&type=&limit=&cursor=
                                         type: case|person|org|article

GET    /api/cases                        ?status=&phase=&party=&person_id=
                                         &amount_min=&amount_max=&from=&to=
                                         &tag=&sort=updated|amount|started
                                         &limit=&cursor=
GET    /api/cases/:id                    kauza + vnorené role, events,
                                         proceedings, súvisiace kauzy;
                                         každý sourced údaj so zdrojmi
GET    /api/cases/:id/articles           ?kind=media|official&limit=&cursor=
                                         zoradené podľa published_at
GET    /api/cases/:id/persons            osoby + ich aktuálne aj historické role
GET    /api/cases/:id/timeline           ?kind=past|expected

GET    /api/persons                      ?party=&role=&case_id=&q=&limit=&cursor=
GET    /api/persons/:id                  profil + prepojenia (link)
GET    /api/persons/:id/cases            kauzy s rolou v každej
GET    /api/persons/:id/articles

GET    /api/orgs/:id                     strana/firma — potrebné pre filter
                                         podľa politickej strany

POST   /api/cases/:id/suggestions        podnet ku kauze (aj neprihlásený)
POST   /api/persons/:id/suggestions      podnet k osobe
POST   /api/suggestions                  všeobecný / návrh novej kauzy
GET    /api/suggestions/mine             prihlásený: stav vlastných podnetov

POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/csrf                    vydá CSRF token
GET    /api/profile
PATCH  /api/profile                      display_name, notification_prefs, heslo

GET    /api/subscriptions
POST   /api/subscriptions                { target_type, target_id, frequency, level }
DELETE /api/subscriptions/:id
GET    /api/notifications                ?state=&limit=&cursor=
POST   /api/notifications/:id/read
```

`GET /api/cases/:id` musí ísť jedným dotazom na view `by_case/children`, nie N+1 dotazmi na role/event/proceeding.

Všetky tri `POST .../suggestions` idú cez rovnaký handler a rovnakú validáciu: povinné `source_urls`, povinný captcha token, rate limit. Líšia sa len tým, čo predvyplnia do `target`.

## 6. API — admin

Všetko vyžaduje rolu `moderator`, s výnimkou označených (`admin`).

```
GET    /api/admin/summary                počty vo fronte, metriky

GET    /api/admin/suggestions            ?status=&origin=&target_type=&limit=&cursor=
GET    /api/admin/suggestions/:id
POST   /api/admin/suggestions/:id/accept { edited_value?, note? }
POST   /api/admin/suggestions/:id/reject { reason }

GET    /api/admin/articles               ?status=&feed_id=&from=&to=&q=
GET    /api/admin/articles/:id           vrátane extrahovaného textu
PATCH  /api/admin/articles/:id           priradenie ku kauzám/osobám, kind, reject
POST   /api/admin/articles                ručné pridanie zdroja (úradný dokument)

POST   /api/admin/cases
GET    /api/admin/cases/:id              vrátane draft a hidden
PATCH  /api/admin/cases/:id              { patch, sources, reason } — povinný dôvod
POST   /api/admin/cases/:id/publish
POST   /api/admin/cases/:id/hide         { reason }  (admin)
POST   /api/admin/cases/:id/roles        vytvorenie/ukončenie role
POST   /api/admin/cases/:id/events
POST   /api/admin/cases/:id/proceedings

POST   /api/admin/persons
PATCH  /api/admin/persons/:id
POST   /api/admin/persons/merge          { keep_id, merge_id }  (admin)
POST   /api/admin/links

GET    /api/admin/revisions              ?target_id=&actor_id=&from=&to=
POST   /api/admin/revisions/:id/revert   (admin)

GET    /api/admin/users                  ?role=&status=  (admin)
PATCH  /api/admin/users/:id              zmena role, blokovanie  (admin)

GET    /api/admin/feeds                  (admin)
POST   /api/admin/feeds/:id/run          manuálne spustenie crawlu
```

`merge` osôb je nutný — crawler bude vytvárať duplicity pri variantoch mien.

## 7. Autentifikácia a autorizácia

- Heslo: **argon2id** (`@node-rs/argon2`). Nikdy bcrypt s default cost.
- Session: náhodných 32 bajtov, cookie `sid`, `HttpOnly; Secure; SameSite=Lax; Path=/`. V DB sa ukladá **hash** tokenu, nie token.
- Frontend aj backend bežia na **rovnakej doméne** (API za reverse proxy pod `/api`). Cookie je teda first-party: žiadne CORS, žiadne `SameSite=None`, žiadna doména v `Set-Cookie`.
- TTL 30 dní, rolling refresh max raz za hodinu (inak zbytočný zápis pri každom requeste — CouchDB nie je Redis).
- CSRF: double-submit token pre všetky non-GET požiadavky.
- Rate limit: login 5/15 min na IP+email, register 3/h na IP, podnety 10/h na IP.
- **Captcha na podnetoch**: Cloudflare Turnstile. Token sa overuje na serveri (siteverify) pred zápisom, chýbajúci alebo neplatný = 422. Platí aj pre prihlásených, aby existovala jedna cesta a jedna validácia.
- Roly kumulatívne: `admin ⊃ moderator ⊃ user`.
- **Prvý admin sa zakladá ručne** — dokument `user:...` sa vloží priamo do CouchDB (Fauxton alebo curl). V `shared` je skript `npm run hash-password`, ktorý vygeneruje argon2id hash do dokumentu. Registrácia cez API vytvára **vždy** len `role: user`; povýšenie robí admin cez `PATCH /api/admin/users/:id`. API nemá žiadnu cestu, ktorá by admina vyrobila sama.
- E-mail sa neoveruje v MVP, ale schéma s tým počíta (`email_verified_at`) — notifikácie bez overenia sú spam vektor.

## 8. Worker

Samostatný proces, `node-cron` scheduler, tri nezávislé úlohy.

### 8.1 Crawler

Pre každý `feed` s `enabled: true`:
1. Kontrola `robots.txt` (cache 24 h). Ak zakazuje, feed sa preskočí a zaloguje.
2. Fetch RSS/sitemap s `If-None-Match` / `If-Modified-Since`.
3. Nové URL → fetch článku, rešpektovať `Retry-After`, max 1 req/s na doménu, vlastný User-Agent s kontaktom.
4. Extrakcia cez `@mozilla/readability` + `linkedom`. Metadáta z JSON-LD / OpenGraph.
5. Deduplikácia cez `canonical_url` a `content_hash`.
6. Uloženie ako `article` so `status: candidate`.
7. Uloženie archívnej kópie (archive.org save API), best-effort.

Paywall: uloží sa metadáta a `paywall: true`, obsah sa nespracúva. Ktoré médiá to sú, treba overiť pred implementáciou (produktové zadanie, otvorené otázky).

MVP feedy: Aktuality.sk, Denník N, SME, Postoj.

### 8.2 Matcher

Nad článkami so `status: candidate`:
1. Normalizácia textu (diakritika, lowercase, lematizácia mien je mimo rozsah MVP — stačí zoznam `name_variants` + slovenské pádové koncovky).
2. Zhoda na osoby a kauzy (mená, aliasy, spisové značky, názvy firiem, IČO).
3. Ak zhoda → `suggestion` s `origin: bot`, návrhom väzby článku na kauzu, prípadne nových `event` alebo zmeny `phase`.
4. Ak sa objaví meno bez záznamu, alebo článok bez zhody s vysokou hustotou signálov (mená + suma + „obvinenie"), založí sa `case` alebo `person` v `publish_state: draft` + `suggestion` na spracovanie.
5. **Nič sa nezverejní bez moderátora.** Worker nemá právo zapisovať do publikovaných dokumentov, len vytvárať `suggestion` a `draft`.

Presnosť extrakcie súm a dátumov v MVP nechaj nízko: navrhni kandidáta, nech ho moderátor potvrdí. Metrika „podiel návrhov schválených bez úpravy" (zadanie 9) povie, kedy sa dá pritvrdiť.

### 8.3 Notifikátor

Číta `_changes` feed s uloženým `since` sekvenčným číslom (perzistentne, nie v pamäti). Pri zmene publikovaného `case`/`event`/`role` nájde `subscription` na daný cieľ a vytvorí `notification`. Odosielanie dávkovo podľa `frequency`. „Významná zmena" = `phase`, `status`, nový `event` s kategóriou `charge|verdict|appeal`; ostatné = `all`.

Odosielanie ide cez rozhranie `Mailer` s jednou metódou. V MVP je zapojený `LogMailer` (zapíše do logu, `notification` označí ako `sent`). Konkrétny provider sa doplní ako druhá implementácia bez zásahu do zvyšku — `notification` dokumenty vznikajú nezávisle od toho, či sa má práve čím poslať.

## 9. Nefunkčné požiadavky

- **Konfigurácia** cez env, validovaná zod pri štarte. Fail fast.
- **Migrácie**: verzionované skripty pre design dokumenty a indexy, `migration_state` dokument.
- **Testy**: vitest + supertest, CouchDB **s Clouseau** v Dockeri (testcontainers) — bez neho sa search indexy neotestujú. Povinné pokrytie: validácia sourced polí, zápis revízií, autorizácia, prijatie/zamietnutie podnetu, escapovanie vstupu do Lucene query.
- **Konflikty**: CouchDB je master-master aj v jednom uzle. Každý PATCH ide s `_rev` od klienta; nesúlad = 409 s aktuálnym stavom, nie tichý prepis.
- **Zálohy**: denný `couchdb-dump` + replikácia do zálohovej inštancie.
- **Bezpečnosť**: helmet, limit veľkosti requestu, žiadny `eval` v map ani index funkciách nad používateľským vstupom. CORS sa nekonfiguruje — rovnaká doména, cudzí pôvod nemá byť povolený.
- **Logy**: štruktúrované, request ID, bez PII v produkčných logoch (IP len hashovaná).

## 10. Čo v backende MVP nie je

Grafová databáza pre prepojenia, napojenie na CRZ/ÚVO/Obchodný register/InfoSúd, automatické párovanie anonymizovaných rozhodnutí, verejné API pre tretie strany, GraphQL, overovanie e-mailovej adresy.

## 11. Zostáva otvorené

1. **E-mailový provider** — dorieši sa neskôr, backend je naň pripravený cez `Mailer` (8.3). Do vtedy sa notifikácie tvoria, ale neodosielajú.
2. **Retencia plných textov** — text uchovávame natrvalo, ale ak sa článok stiahne alebo médium požiada o odstránenie, treba mať rozhodnutý postup. Technicky je to zmazanie `_attachments` pri zachovaní metadát a `archive_url`.
3. **Veľkosť Clouseau indexu** — pri desiatkach tisíc článkov s plným textom treba sledovať RAM a čas prvého buildu. Nie je to blokujúce pre MVP, ale ovplyvní to voľbu servera.

# Worker — crawler, matcher, notifikátor

Samostatný proces vedľa API. **Komunikuje výhradne cez databázu** (zadanie §1):
zapisuje `article` a `suggestion`, číta `_changes`. Žiadna message queue, žiadne
priame volanie API.

Hotový je **krok 1**: čítačka feedov.

```bash
npm run worker:crawl -- --dry-run --limit=3    # nič nezapíše, len ukáže
npm run worker:crawl                            # všetky zapnuté feedy
npm run worker:crawl -- --feed=feed:0192… --limit=5
```

## Krok 1 — čítačka feedov (hotové)

Prečíta RSS/Atom feedy a uloží nové články ako `status: candidate`. **Nič viac.**
Nesťahuje telá článkov, neextrahuje text, nič nepriraďuje ku kauzám — z feedu
berie len to, čo médium samo syndikuje: titulok, odkaz, dátum, autora, perex.

```
packages/worker/src
  crawl.js            job: feed → nové články
  bin/crawl.js        jednorazový beh z CLI
  lib/http.js         slušné sťahovanie (UA, 1 req/s na doménu, Retry-After, podmienený GET)
  lib/robots.js       robots.txt: parser a vyhodnotenie
  lib/feed.js         RSS 2.0 / RSS 1.0 / Atom → jeden tvar položky
  lib/url.js          kanonizácia URL (identita článku)
```

Zápis ide cez `shared/store.js` ako všetko ostatné, s aktérom
`worker:crawler` / `role: bot` — v audite je vidieť, že článok nezaložil človek.

### Čo sa overilo v prevádzke

Beh proti štyrom MVP médiám (7. 8. 2026):

| Feed | URL | Výsledok |
| --- | --- | --- |
| Aktuality.sk | `/rss/` | 15 položiek, bez ETag — deduplikuje sa cez URL |
| Denník N | `/feed/` | 10 položiek, rešpektuje `If-None-Match` → 304 |
| SME | `/rss` | 20 položiek, **agresívny rate limit** (viď nižšie) |
| Postoj | `/rss` | 10 položiek, rešpektuje podmienený GET → 304 |

Tri veci, ktoré zmenili návrh:

**SME odpovedá na predvolený User-Agent stránkou „Request Blocked" so stavom
200.** Nie 403 — dvestovkou s HTML. Bez kontroly `content-type` by crawler
takúto odpoveď rozparsoval ako feed bez položiek a tváril sa, že je všetko v
poriadku. Preto je neočakávaný content-type chyba feedu, nie prázdny feed.

**SME má na `/rss` limit, ktorý sa počíta v hodinách, nie v minútach.** Zistené
v prevádzke, keď feed osem behov po sebe skončil na 403: `robots.txt` z tej istej
domény odpovedá 200, ale `/rss` vráti 429 aj pri odstupe tridsiatich sekúnd, a to
bez `Retry-After`. Blokovanie je **na IP adresu, nie na User-Agent** — prehliadačový
UA dostane to isté 429, takže sa to nedá (a nemá) obísť prezliekaním robota.

Z toho vyplynuli tri veci v kóde, každá dôležitejšia než tá predošlá:

1. **429 a 403 nie sú chyba feedu, ale odpoveď média.** `politeFetch` pre ne
   hádže `BlockedError` a doména dostane pokoj (`blockedUntil`) — v rámci behu
   aj naprieč behmi, cez `feed.blocked_until`. Feed sa dovtedy preskočí a
   `consecutive_failures` sa **nezvyšuje**: feed nie je pokazený, len ho teraz
   nedostaneme. V administrácii sa to ukazuje ako „odmieta crawler" so
   začiatkom ďalšieho pokusu, nie ako červená chyba.
2. **Opakovanie sa predlžuje, nie skracuje.** Bez `Retry-After` je odstup pol
   hodiny a s každým ďalším odmietnutím sa zdvojnásobuje (`blocked_count`), po
   šesť hodín. Skúšať to každých tridsať minút znova je presne to správanie,
   ktorým sa z limitu stane trvalé blokovanie.
3. **robots.txt sa pamätá aj medzi behmi** (`feed.robots_checked_at`,
   `robots_rules`, 24 hodín). Každé spustenie crawlera je nový proces, takže
   dovtedy každý beh poslal na doménu dve požiadavky v odstupe sekundy — a to je
   presne vzor, na ktorý médiá s limitom reagujú.

Ak SME nebude prechádzať ani takto, ďalšou možnosťou je ich sitemapa alebo
dohoda s médiom; prezliekanie robota do prehliadača nie.

**Traja zo štyroch sú za paywallom** (Denník N, SME, Postoj). Vo feede je len
perex, čo pre krok 1 stačí — ale krok 2 (plný text pre matching) sa pri nich
nedá spraviť sťahovaním. Buď sa bude matchovať z titulku a perexu, alebo bude
treba dohodu s médiom. Toto je otvorená otázka z produktového zadania §11 a
treba ju rozhodnúť pred krokom 2.

robots.txt ani jedného zo štyroch nezakazuje nášho robota (Denník N zakazuje len
`*preview=true*`). SME a Postoj používajú `Content-Signal`; SME má
`ai-train=no, ai-input=no`. Na indexovanie a citovanie to nie je zákaz, ale je
to signál, ktorý treba brať do úvahy pri matcheri.

### Pravidlá, ktoré crawler dodržiava

- Vlastný User-Agent s kontaktnou adresou (`CRAWLER_USER_AGENT`). Médium, ktoré
  chce, aby sme prestali, musí mať komu napísať.
- Najviac **jedna požiadavka za sekundu na doménu**, sekvenčne cez feedy.
- `Retry-After` sa rešpektuje; 429 a 503 sú „skús neskôr", nie „neexistuje" —
  a keď médium nepovie kedy, čaká sa pol hodiny, nie dve sekundy.
- Podmienený GET cez `If-None-Match` / `If-Modified-Since` z `feed.last_etag`.
- robots.txt sa kontroluje pre feed **aj pre každý odkaz z neho** — feed smie
  odkázať do sekcie, ktorú robots zakazuje.
- Nedostupný robots.txt = povolené (tak to robia vyhľadávače). Zakázaný feed sa
  preskočí a zaloguje, nie potichu.

### Deduplikácia

Kľúčom je kanonizovaná URL: bez `utm_*`, `fbclid` a spol., bez fragmentu, s
usporiadanými parametrami a bez koncovej lomky. Odpovedá na ňu view
`_design/by_article/_view/url`, nie search index — pri zápise potrebujeme presnú
a okamžite konzistentnú odpoveď, nie výsledok z indexu, ktorý sa práve prestavuje.
Druhým kľúčom je `feed_guid` pre prípad, že médium článku zmení adresu.

### Stav behu

`last_run_at`, `last_etag`, `last_modified`, `last_error`, `consecutive_failures`,
`blocked_until`, `blocked_count`, `robots_checked_at`, `robots_rules`
a `robots_ok` sa píšu na dokument feedu **bez revízie** (`updateDoc({ audit: false })`).
Nie je to redakčná zmena a revízia po každom behu by pochovala tie, ktoré ňou sú.

Dôsledok, s ktorým treba počítať: feedy sú fixtures, takže po prvom behu ich
`npm run couch:fixtures` už neprepíše a ohlási konflikt. Je to správne správanie —
stav crawlu sa nemá resetovať nasadením.

## Úradné zdroje — čo sa dá a čo nie

```bash
npm run worker:datasets -- "sudne pojednavania"          # čo je v katalógu
npm run worker:datasets -- "pojednávaní" --check         # a dá sa to stiahnuť?
```

`lib/opendata.js` je klient Národného katalógu otvorených dát
(`data.slovensko.sk`). SPARQL endpoint je `https://data.slovensko.sk/api/sparql`,
`robots.txt` katalógu je `Allow: /`. Dopyt sa skladá na serveri a hľadaný výraz
sa escapuje do SPARQL literálu — rovnaký problém a rovnaké riešenie ako pri
Lucene v API.

### Čo robots.txt zakazuje

| Zdroj | Stav |
| --- | --- |
| `data.slovensko.sk` (katalóg) | `Allow: /` — **povolené** |
| `obcan.justice.sk/opendata` | nezakázané — **povolené** |
| `obcan.justice.sk/infosud` | **`Disallow`** — InfoSúd je pre robotov zatvorený |
| `www.justice.gov.sk` | povolené okrem `/wp-admin/` a `/Stranky/SuborStiahnut.aspx` |
| `orsr.sk` | **`Disallow: /vypis.asp?`, `/hladaj_osoba.asp?`, `/zbl.asp?`** — výpis firmy aj hľadanie osoby |

InfoSúd je podľa produktového zadania §5.2 „jediný spoľahlivý zdroj pre časovú
os dopredu" — a zároveň je to presne to, čo robots.txt zakazuje. Katalóg
otvorených dát je legálna cesta k tým istým dátam.

### Prekážka: distribúcie MS SR sú mŕtve

V katalógu sú oba správne datasety:

- **Zoznam pojednávaní … v trestnej agende** — `data.gov.sk/set/ecf4e9fe-db11-451d-b615-c6da24257502`
- Zoznam pojednávaní … v civilnej agende — `data.gov.sk/set/ad726a0f-a4f2-47dd-a5b8-ba8e0870ecc1`

Ich strojovo čitateľné distribúcie však neexistujú (overené `--check`, 8. 8. 2026):

```
MŔTVE XML         http://data.justice.sk/TrestPoj.xml        404
MŔTVE SCHEMA_XML  http://data.justice.sk/trestne.xsd.xml     404
MŔTVE XML         http://data.justice.sk/civilPoj.xml        404
OK    HTML        justice.gov.sk/…/trestne-pojednavania/     200, ale obsah sa načítava JS
```

Index na `data.justice.sk` hlási, že datasety sa presunuli na
`obcan.justice.sk/opendata`; tá stránka má nadpis „Datasety" a prázdny zoznam.
Resource URL v štýle Liferay, ktorý katalóg uvádza pri datasete „Súdy"
(`?p_p_resource_id=reg-sudy_xml`), vracia tiež 404. Na `api.justice.gov.sk` beží
API, ale slúži len číselníky a spätnú väzbu; endpoint pre pojednávania som
nenašiel a `swagger-ui` je 403.

**Ingest pojednávaní preto nemá z čoho čítať.** Ďalší krok nie je kód, ale
nahlásiť rozbitú distribúciu — katalóg má na to komentáre pri datasete
(`/datasety/:id/komentare`), MS SR kontakt `tlacove@justice.sk` a Service Desk.
Kým sa to nespraví, jediná funkčná cesta k časovej osi dopredu je ručné zadanie
moderátorom (`POST /api/admin/cases/:id/events` s `kind: expected`), presne ako
to predpokladá zadanie pre MVP.

Keď súbor ožije, ingest je krátky: `distributionsOf()` vráti URL, `politeFetch`
ho stiahne, parser XML → `event` a spárovanie na `proceeding.file_number`
(spisová značka) podľa zadania §5.10.

## Ďalšie kroky (nehotové)

**Krok 2 — sťahovanie a extrakcia textu.** Pre nepaywallované články stiahnuť
stránku, extrahovať text cez `@mozilla/readability` + `linkedom`, metadáta z
JSON-LD/OpenGraph, uložiť `body` a `content_hash`, archívnu kópiu na archive.org
(best-effort). Pri zmene `content_hash` na tej istej URL založiť podnet „zdroj sa
zmenil" — odpoveď na otvorenú otázku zo zadania §11 (čo s údajom, ktorý médium
opraví). Blokuje to rozhodnutie o paywalloch.

**Krok 3 — matcher.** Nad článkami so `status: candidate`: normalizácia cez
`couch/shared/normalize.js` (tá istá, akou sa plní index aj skladá query),
zhoda na `name_variants`, spisové značky, IČO a názvy firiem. Pri zhode
`suggestion` s `origin: bot` a `confidence`; pri mene bez záznamu koncept v
`publish_state: draft`. Worker nemá právo zapisovať do publikovaných dokumentov —
`validate_doc_update` už dnes vyžaduje, aby bot podnet mal číselnú `confidence`.

**Krok 4 — notifikátor.** `_changes` s perzistentným `since`, odberatelia cez
`by_target/subscriptions`, `notification` dokumenty, dávkovanie podľa
`frequency`. Odosielanie cez rozhranie `Mailer` s implementáciou `LogMailer` —
notifikácie vznikajú nezávisle od toho, či je čím posielať.

**Plánovač.** Kým je crawler jednorazový príkaz, spúšťa sa ručne alebo z cronu.
`node-cron` a trvalo bežiaci proces prídu s krokom 3, spolu s uzamknutím behu
(dve inštancie workera by ten istý feed čítali dvakrát).

## Konfigurácia

```
CRAWLER_USER_AGENT     predvolene "dosledujto-bot/0.1 (+https://dosleduj.to; kontakt@dosleduj.to)"
CRAWL_MIN_INTERVAL_MS  1000  — minimálny odstup požiadaviek na doménu
CRAWL_TIMEOUT_MS       15000
CRAWL_MAX_ITEMS        50    — strop položiek z jedného feedu na jeden beh
```

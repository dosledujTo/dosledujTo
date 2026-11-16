# Verejný web — dosleduj.to

React so **server-side renderingom**, dáta výhradne cez REST API. Dizajn podľa
`design_handoff_cervena_nit/` („Červená niť") so svetlým a tmavým režimom.
Predchádzajúci handoff `design_handoff_dosleduj_redesign/` („Classical") je
**prekonaný** — ostáva v repozitári len ako história.

```bash
npm run web:build     # klientský balík + SSR balík
npm run api           # Express ich servíruje na http://127.0.0.1:3000/
```

## Ako to beží

Server nájde rout, zavolá jeho `load`, vykreslí **ten istý strom komponentov**,
ktorý potom beží v prehliadači, a priloží dáta do stránky. Klient sa naň
pripojí (`hydrateRoot`), pri prvom zobrazení nič nedoťahuje a ďalšiu navigáciu
už rieši sám.

```
src/
  api.js            fetch wrapper — na serveri absolútna adresa, v prehliadači relatívna + medzipamäť
  routes.jsx        tabuľka routov: path + Component + load + meta
  App.jsx           hlavička, pätička, prepínanie stránok, matchRoute
  entry-server.jsx  renderToString + StaticRouter
  entry-client.jsx  hydrateRoot + BrowserRouter
  ssr.js            Express strana: načítaj dáta, vykresli, pošli HTML
  theme.jsx         svetlý/tmavý režim (jediný klientský stav)
  format.js         sumy, dátumy, popisy rolí — zdieľané oboma stranami
  styles.css        dizajnové tokeny a komponenty
  pages/            Home, Cases, Case, Persons, Person, Orgs, Org, Search, NotFound
```

**Dáta chodia cez API aj na serveri**, hoci by si ich mohol vziať priamo
z databázy a ušetriť skok po localhoste. Je to zámer: API je jediná zmluva.
Keby server čítal inak než klient, stránka by sa po prvej client-side navigácii
mohla zmeniť bez toho, aby sa zmenili dáta — a taká chyba sa hľadá veľmi ťažko.

**Navigácia nesťahuje, čo stránka už má.** Každá záložka a filter má vlastnú
adresu a celý `load` beží pri každej navigácii znova — prepnutie záložky kauzy
by tak znova stiahlo detail kauzy a prepnutie obdobia na titulke všetkých šesť
blokov. `api.js` preto v prehliadači drží odpovede 2 minúty a súbežné rovnaké
volania zlúči; server pri vykreslení zaznamená svoje volania (`AsyncLocalStorage`
v `ssr.js`) a pošle ich ako `window.__API__`, takže ani prvá navigácia nezačína
od nuly. Na serveri sa nekešuje nič. GET formuláre filtrov sú `GetForm` —
bez JS obyčajný formulár, s JS navigácia v routeri bez načítania stránky
(`test/web-api-cache.test.jsx`).

## Čo si to vyžiadalo od API

Handoff potrebuje čísla a termíny, ktoré verejné API nemalo:

- `GET /api/stats` — stav registra: počty a **súčet súm, ktoré majú zdroj**.
- `GET /api/events/upcoming` — časová os dopredu naprieč kauzami.
- `GET /api/cases/:idOrSlug` a `/api/persons/:idOrSlug` prijímajú aj slug —
  verejné adresy sú `/kauza/kauza-testovaci-most`, nie identifikátory. To isté
  odvtedy platí pre `/api/orgs/:idOrSlug`.
- `GET /api/orgs/:id/cases` — a vracia **dva oddelené zoznamy**: `items` sú
  kauzy, v ktorých má subjekt vlastnú rolu (tvrdenie o ňom, so zdrojom),
  `via_members` sú kauzy, ktoré sa strany týkajú cez jej ľudí (odvodená
  súvislosť). Zliať ich do jedného zoznamu by z členstva urobilo obvinenie.
- `GET /api/orgs/:id/articles` — zdroje, ktoré o subjekte hovoria. Ide cez view,
  nie cez Clouseau: `org_id` v indexe článkov nie je, lebo jeho zmena znamená
  celý rebuild Lucene.

## Sekcia Subjekty

Firmy, strany a inštitúcie majú vlastný zoznam (`/subjekty`) a profil
(`/subjekt/:slug`) — dovtedy sa na ne dalo dostať len cez vyhľadávanie a odkazy
z profilu osoby viedli na neexistujúcu stránku. Profil odpovedá na otázku, ktorú
si nad jednou kauzou nepoloží nikto: *kde všade ešte tento subjekt figuruje*.

Blok „Kauzy cez ľudí" sa zobrazí, len keď taká väzba existuje, a hovorí priamo,
že **to nie je tvrdenie o subjekte**. Pri politickej strane je to jediná väzba,
ktorú dnes register vie odvodiť sám (z členstva), a bez tej vety by sa čítala
rovnako ako obvinenie.

## Dizajn

Systém „Červená niť" (`design_handoff_cervena_nit/README.md`, prototyp
`navrh.html`). Grotesk **Bricolage Grotesque** na nadpisy, veľké čísla a logo,
**Source Sans 3** na text, **Geist Mono** na dátumy, sumy, štítky a čísla
zdrojov. Ostré rohy (`--radius: 2px`), žiadne tiene — štruktúru nesú linky
a 2px rámik pri zvýraznených blokoch.

Farby nie sú estetika, ale obsah: **červená** (`--accent`) je vyhradená pre
väzby ku kauzám, odsúdenie, sporné údaje, odkazy na zdroje a „nové";
**zelená** (`--ok`) len pre oslobodenie a vrátené peniaze.

### Písma

Self-hostované a **zúžené** na znaky, ktoré register naozaj použije: latinka,
slovenská a česká diakritika, nemecké prehlásky (názvy firiem), interpunkcia
vrátane „ ", symboly € § © a šípky trendu. Žiadne volanie na Google — okrem
rýchlosti to znamená, že návštevníka registra káuz nikto tretí nesleduje.

```bash
pip install "fonttools[woff]"
# zdrojové variabilné TTF z github.com/google/fonts (ofl/bricolagegrotesque,
# ofl/sourcesans3, ofl/geistmono) do jedného priečinka, potom:
python3 packages/web/scripts/subset-fonts.py <priečinok>
```

Zdrojom sú TTF z repozitára google/fonts, nie CSS API Google Fonts — to
s moderným User-Agentom vracia **rozdelené** subsety (latin, latin-ext)
a z písma by vypadli znaky z iného slice (á je v `latin`, č v `latin-ext`).

Bricolage zostáva **variabilná v osi `opsz`** (optical size: 60px nadpis
a 22px titulok karty majú každý svoj tvar z jedného súboru), preto je jej
súbor najväčší (63 kB). Source Sans 3 a Geist Mono sú statické rezy. Spolu
119 kB; predchádzajúce pätkové písma mali 61 kB.

Podmnožina sa robí **pred** inštancovaním variabilného písma — opačné poradie
padá vo fontTools 4.6x na lenivo načítanej tabuľke `gvar`.

### Logo a ikony

`components/Logo.jsx` — wordmark s niťou medzi dvoma špendlíkmi. Text je
**krivka**, nie `<text>`: logo nečaká na webfont a favicon, apple-touch-icon aj
OG obrázok (ktoré prehliadač ani sociálne siete s webfontom nevykreslia)
vyzerajú rovnako ako hlavička. Krivky aj obrázky generuje:

```bash
python3 packages/web/scripts/logo.py <priečinok so zdrojovými TTF>   # potrebuje rsvg-convert
```

`og:image` musí byť absolútna adresa a skladá sa z `PUBLIC_URL`, **nie**
z hlavičky Host: stránky sa cachujú ako `public` a podvrhnutý Host by sa
dostal do cache. Bez `PUBLIC_URL` sa `og:image` nevypíše.

### Tmavý režim

Jediný kus klientského stavu. Voľba sa drží v `localStorage`
(`dosleduj-theme`) a číta ju inline skript v `<head>` ešte pred prvým
paintom, inak by bliklo biele pozadie. Keď nie je nič uložené, riadi sa
`prefers-color-scheme` — a to aj **bez JavaScriptu**: tmavé tokeny sú v CSS
dvakrát, pod `[data-theme="dark"]` aj pod media query. Pätička je tmavá
v oboch režimoch; tokeny sa v nej prepíšu lokálne, takže logo v nej funguje
bez zvláštnej verzie.

### Prezumpcia neviny má tvar

`RoleTag` dáva každému stavu konania iný **tvar**, nielen farbu — podozrivý
prerušovaný rámik, obvinený červený rámik, obžalovaný rámik s podkladom,
odsúdený plnú červenú, oslobodený zelený rámik s podkladom. Ostatné roly
(svedok, poškodený, …) sú neutrálne. Ukončená rola zostáva na stránke, len
stlmená a s obdobím za sebou.

### Čo z produktového zadania nesie dizajn, nie náhoda

**Sporná suma** má na detaile vlastnú bunku so štítkom „SPORNÉ" a vlastným
zdrojom. Systém medzi číslami nerozhoduje a nepriemeruje ich (§4.6).

**Zdroj pri každom údaji**: pod hodnotou je červený odkaz v Geist Mono,
podčiarknutý. Pole bez zdroja API nevráti, takže sa nevykreslí vôbec.

**Časová os dopredu** má na titulke vlastnú sekciu, ktorá sa skryje, keď nie sú
známe žiadne termíny.

## Testy

`test/web-ssr.test.jsx` — vykreslenie na serveri, sporná suma, čiara „dnes",
poradie zdrojov, escapovanie cudzieho textu. React escapuje sám, ale titulok
stiahnutého článku je tu najpravdepodobnejšia cesta útoku, takže sa to overuje.

## Redizajn „Červená niť" — stav a rozhodnutia

Práca ide po míľnikoch z kap. 10 handoffu. **Hotový je míľnik 1 (identita):**
tokeny, písma, logo, favicon a OG obrázok, hlavička, tmavá pätička, tmavý režim
bez bliknutia aj bez JavaScriptu, `RoleTag` s tvarmi a `SourceRef`. Existujúce
stránky sú len prestylované, ich obsah a dáta sú zatiaľ pôvodné.

**Hotový je aj míľnik 2 (dáta a model):** `case.kind` (druh, viac kódov, prvý
hlavný, pri zverejnení povinný), `case.impact` a `case.recovered_amount`, nové
fázy (`convicted`, `acquitted`, `lapsed` namiesto `final`), číselníky `phase`
(so segmentom metriky `bucket`) a `case_kind`, `event.proceeding_id`, filter
`/api/cases?case_kind=` a faseta `kind_main`, vyhľadávanie ako `search_v2` za
aliasom a generátor objemových testovacích dát. Detaily sú v
`couch/README.md`. Web tieto polia zatiaľ len prenáša, zobrazovať ich začne
v míľnikoch 4 a 5.

**Hotový je míľnik 3 (prepojenia):** profil osoby aj subjektu má štyri záložky
s vlastnou adresou, renderované na serveri — `/osoba/:slug` (Mapa),
`/v-case`, `/siet`, `/zdroje` (rovnako pod `/subjekt/:slug`). Spoločný
komponent je `pages/Profile.jsx`, routy skladá `profileRoutes` v `routes.jsx`.

- **Mapa** (`components/ConnectionMap.jsx`) je SVG s deterministickým
  rozložením; pod 820 px ju nahradí zoznam s rovnakými údajmi. Viac rolí
  v jednej kauze = jeden uzol s aktuálnou rolou. Subjekt má vlastné roly
  plnou čiarou a kauzy „cez svojich ľudí" bodkovanou, s vysvetlením slovom.
- **V čase** (`components/TimeChart.jsx`) — pozície pruhov a udalostí sú
  percentá spočítané na serveri; pod 820 px sa graf posúva vodorovne
  a popisy riadkov zostávajú prilepené.
- **Sieť** (`components/Network.jsx`) — rozloženie počíta `d3-force` v
  prehliadači (300 krokov naraz, bez animácie, takže `prefers-reduced-motion`
  netreba riešiť zvlášť); ťahanie, posun, zoom kolieskom aj tlačidlami.
  Server vždy vykreslí zoznam uzlov podľa vzdialenosti — bez JS aj ako
  textová alternatíva. Filtre sú v URL (`?platne=1&bez-odvodenych=1&len-kauzy=1`).
- **Zdroje** (`components/SourcesTab.jsx`) — 20 na stranu, `?strana=`,
  `?typ=urad|media`, `?kauza=<slug>`, `?zoradit=najnovsie|najstarsie`. Číslo
  `[n]` je z API a stabilné; `sourceHref` z neho spočíta stranu a kotvu, takže
  `[25]` v Mape vedie na `zdroje?strana=2#zdroj-25`.

Odchýlka od handoffu (kap. 8): Mapa, V čase a Sieť majú `role="group"`
s `aria-label`, nie `role="img"`. Obsahujú odkazy na profily a zdroje a
`role="img"` by ich čítačkám obrazovky schoval.

Zatiaľ chýba „Prekrytie" pod grafom V čase (kap. 3.2) — handoff ho pre
míľnik 3 nevyžaduje.

**Hotový je míľnik 4 (kauza):** `/kauza/:slug` (Prehľad), `/prepojenia`
(Mapa okolo kauzy: ľudia a subjekty podľa rolí, súvisiace kauzy cez spoločných
ľudí) a `/zdroje`. Opravy z kap. 5.2:

- „Najbližší termín" sa číta z tých istých udalostí ako časová os
  (`expected`, dátum ≥ dnes). Očakávaný termín, ktorý uplynul, má štítok
  „termín uplynul, výsledok zatiaľ nepoznáme" a za najbližší sa nepovažuje.
  Čiara „dnes" je na osi vždy, aj keď sú všetky udalosti minulé.
- Ľudia v kauze: jedna položka na osobu (`groupRoles`), aktuálna rola
  navrchu, ukončené pod ňou. Nový blok „Subjekty v kauze" z rolí s `org_id`.
- Kauza bez sumy ukáže dopad, bez dopadu druh — nikdy „0 €". Sporná suma má
  všetky verzie vedľa seba a vetu, že register nevyberá.
- `[n]` pri údajoch je číslo zo záložky Zdroje (API vracia `source_nos`).
- Pracovná poznámka moderátora pri role (`note`) z verejného API vypadla.
- Neexistujúca kauza alebo osoba vracala 500 (`meta` pôvodnej routy siahala
  na dáta, ktoré neboli); teraz 404 so stránkou „nenájdené".

„Poslať podnet" zostáva neaktívne, kým v míľniku 6 nepribudne `/podnet`.

**Hotový je míľnik 5 (titulka a metriky):** sekcie v poradí podľa kap. 5.1 —
úvod so stavom registra, Peniaze v kauzách (`components/home.jsx`,
`MoneyBlock`), Čo sa chystá (so súdom z konania), Naposledy sa pohlo (karty
s niťou, pohybom a „oprava"), O čom sa najviac píše (`?obdobie=30-dni|12-mesiacov|celkovo`,
krivka `Spark`), Zabudnuté, ale nevyriešené, Najväčšie sumy a Mená v najviac
kauzách. Pravidlá výpočtu sú v `packages/shared/src/metrics.js` (s testami)
a vypísané na `/ako-pocitame`. CTA „Sleduj" sa nezobrazuje (rozhodnutie D).
API: rozšírené `/api/stats`, nové `/api/cases/top`, `/forgotten`, `/latest`;
agregácie idú cez view `stats/cases|outcomes|articles_by_case_day|entity_cases|latest`.

**Hotový je míľnik 6 (zoznamy, kalendár, podnet):**

- `/kauzy` má filter Druh (`?druh=`), triedenie „najviac sa píše"
  (`?sort=najviac-pise`, rebríček za 12 mesiacov) a „len zabudnuté"
  (`?zabudnute=1`). Pri triedení podľa sumy sú kauzy bez sumy na konci pod
  oddeľovačom. Odchýlka: zoznam ostáva stránkovaný kurzorom („Ďalšie →"), nie
  číslami strán — Clouseau `_search` vracia záložku (bookmark), skok na
  n-tú stranu nevie. `Pager` s číslami je v Zdrojoch a v kalendári.
- `/kalendar` — budúce udalosti podľa mesiacov, filter súdu (zo súdneho
  konania, `event.proceeding_id`) a kauzy, 30 na stranu. API
  `/api/events/calendar`. V hlavičke je „Čo sa chystá".
- `/podnet` (`?kauza=` / `?osoba=`, bez parametra návrh novej kauzy) —
  zdroj povinný, Turnstile, CSRF; bez JS sa formulár neodošle a stránka to
  povie. Verejný kľúč Turnstile je `TURNSTILE_SITE_KEY` (API
  `/api/public-config`); CSP povoľuje `challenges.cloudflare.com`. Pätička aj
  „Poslať podnet" na kauze naň vedú.

**Hotový je míľnik 7 (upratanie):** `test/web-a11y.test.js` overuje kontrast
textových tokenov v oboch režimoch (všetky ≥ 4,5 : 1; akcent na pozadí vo
svetlom režime má 4,6, nie 5, ako odhadoval handoff — AA to spĺňa),
`:focus-visible` 2px akcentom a to, že sa obrys nikde nevypína bez náhrady
(vyhľadávacie polia ho majú na celom kontajneri, uzly Siete hrubý rámik).
Opravený skrytý fokus na odkazoch `[n]` v Mape. Testy z kap. 9 sú v
`test/metrics.test.js`, `connections.test.js`, `fixtures-generated.test.js`,
`model-v2.test.js` a `web-{profile,case,home,lists,a11y}.test.jsx`.

Po míľniku 7 pribudlo **„Prekrytie" pod V čase** (kap. 3.2): API pri
`/graph?events=1` vracia `insights[]` — obdobie väzby osoby na firmu sa
prekrýva s udalosťou kauzy, v ktorej má tá firma vlastnú rolu. Je to náš
odvodený údaj, takže ide von s `derivation` a oboma zdrojmi a web ho tak
označí (`shared/src/connections.js`, `overlaps`). Budúce udalosti sa
nepočítajú. A **podnet z profilu**: osoba aj subjekt majú „Poslať podnet",
pre subjekt pribudlo API `/api/orgs/:id/suggestions` a `/podnet?subjekt=`.

Otvorené zostáva stránkovanie `/kauzy` číslami strán (Clouseau vie len
záložku) a CTA „Sleduj" (čaká na prihlásenie na webe, rozhodnutie D).

Navigácia ešte nemá „Čo sa chystá" a pätička nemá odkaz na podnet: `/kalendar`
a `/podnet` pribudnú v míľniku 6 a dovtedy web nesľubuje nič, čo neexistuje.

Rozhodnutia vlastníka k otázkam, v ktorých handoff nesedel s kódom
(15. 11. 2026):

- **Fázy:** `final` sa rozdelí na `convicted` a `acquitted`, pribudne `lapsed`
  (premlčané alebo odložené); kauza bez fázy patrí do segmentu `none`.
- **Kalendár:** udalosť dostane `proceeding_id`, aby sa dala filtrovať podľa súdu.
- **Termín po dátume:** `expected` udalosť, ktorej dátum už prešiel, sa
  zobrazí ako „termín uplynul, výsledok zatiaľ nepoznáme".
- **Sledovanie:** web zatiaľ nemá prihlásenie ani registráciu, takže CTA
  „Sleduj" a tlačidlá „Sledovať" sa nezobrazia.
- **Zdroje osoby a subjektu:** články priradené cez `person_ids`/`org_ids`
  **plus** články citované v ich rolách a väzbách.
- **Naposledy sa pohlo:** posledná zverejnená udalosť alebo priradený článok;
  ak verejný údaj kauzy neskôr zmenila revízia, ukáže sa aj tá, označená
  „oprava".

## Čo tu zatiaľ nie je

Registrácia a sledovanie káuz a formulár na podnet (API naň je aj s captchou).
Tlačidlo „Poslať podnet" na stránke kauzy je zatiaľ neaktívne — nesľubuje nič,
čo neexistuje.

# Handoff: Dosleduj.to — redizajn „Červená niť“ + prepojenia + metriky

Nahrádza `design_handoff_dosleduj_redesign/` („Classical“). Ten priečinok nemaž, len ho v `packages/web/README.md` označ ako prekonaný.

## 0. Ako s týmto pracovať

- **`navrh.html`** je klikateľný prototyp. Otvor ho v prehliadači. Lišta hore prepína medzi titulkou, profilom osoby a logom, tlačidlo v hlavičke prepína tmavý režim. Farby, písmo, rozostupy a stavy sú finálne. Dáta v ňom sú vymyslené.
- Prototyp **nie je kód na skopírovanie**. Prerobí sa v `packages/web` (React + SSR) podľa jeho konvencií: `routes.jsx` s `load` a `meta`, dáta len cez REST API, `styles.css` s tokenmi.
- Pravidlá z `CLAUDE.md` platia bez výnimky:
  - plain JS s JSDoc, žiadny TypeScript,
  - všetky zápisy cez `store.js`,
  - žiadne Mango `_find`, len Clouseau a views,
  - žiadne N+1,
  - testovacie dáta len fiktívne,
  - údaj bez zdroja sa nezverejní.
- Pracuj po míľnikoch z kapitoly 10. Po každom: `npm test`, `npm run couch:validate`, `npm run couch:fixtures`. Pri zmenách v `couch/` aj `npm run couch:plan`.

## 1. Prečo

Doterajší „novinový“ vzhľad je pekný, ale nepomáha s hlavnou pridanou hodnotou registra. Tou je **vidieť súvislosti**: človek ↔ firmy a strany ↔ kauzy, a ako sa to vyvíjalo v čase. Nový smer je modernejší, výraznejší a postavený okolo prepojení. Zároveň pridáva metriky, ktoré ukazujú, ako kauzy reálne dopadajú.

**Ciele**
1. Prepojenia osoby, subjektu a kauzy v štyroch pohľadoch: Mapa, V čase, Sieť, Zdroje.
2. Nová vizuálna identita a logo „Červená niť“ so svetlým a tmavým režimom.
3. Nová titulka s metrikami: peniaze podľa stavu konania, o čom sa najviac píše, zabudnuté kauzy.
4. Podpora káuz, ktoré nie sú o peniazoch (zneužitie moci, zásah do vyšetrovania…).

**Čo sa nesmie stať**, aj keby to technicky fungovalo:
- Graf alebo metrika vyzerá ako obvinenie. Výskyt v kauze nie je vina a rola musí byť vždy čitateľná.
- Čiara alebo číslo bez zdroja na jeden klik.
- Odvodený údaj, ktorý vyzerá rovnako ako prevzatý.
- Oslobodenie, zastavenie alebo premlčanie je menej viditeľné ako obvinenie.
- Nefinančná kauza je v rebríčkoch podhodnotená len preto, že nemá sumu.

**Mimo rozsahu:** admin (`packages/admin`) okrem jedného nového poľa (kap. 7.3), mobilná aplikácia, platené funkcie.

## 2. Vizuálna identita

### 2.1 Tokeny (`packages/web/src/styles.css`, celý `:root` nahradiť)

| Token | Svetlý | Tmavý | Použitie |
|---|---|---|---|
| `--bg` | `#f4f3f1` | `#121110` | podklad stránky |
| `--surface` | `#ffffff` | `#1b1918` | panely, karty, inputy |
| `--ink` | `#151312` | `#f1ede9` | text, primárne plochy |
| `--muted` | `#69625c` | `#a39b94` | sekundárny text |
| `--line` | `#e2ddd8` | `#2f2b28` | linky, rámiky |
| `--accent` | `#d5231b` | `#ff4a40` | červená niť: väzby ku kauzám, dôležité stavy, odkazy na zdroje |
| `--accent-soft` | `#fbe1df` | `#3b1715` | podfarbenie akcentu |
| `--org` | `#151312` | `#e9e4df` | väzby na firmy a strany |
| `--org-soft` | `#ebe7e3` | `#2a2624` | podklad pruhov a štítkov |
| `--ok` / `--ok-soft` | `#11643a` / `#e3f4ea` | `#6fd49c` / `#14301f` | oslobodenie, vrátené peniaze |
| `--radius` | `2px` | | ostré rohy, žiadne zaoblené karty |

Pravidlá pre farby:
- **Červená je vyhradená** pre väzby ku kauzám, odsúdenie, sporné údaje, odkazy na zdroje a „nové“ upozornenia. Nie je dekorácia.
- **Zelená len pre oslobodenie a vrátené peniaze.**
- Bez tieňov. Štruktúru nesú linky a 2px rámik pri zvýraznených blokoch (vyhľadávanie, sledovanie).

**Tmavý režim:**
- Stav drží `data-theme` na `<html>`. Bez uloženej voľby sa riadi `prefers-color-scheme`.
- Voľba sa ukladá do `localStorage` pod `dosleduj-theme` a číta ju inline skript v `<head>` ešte pred prvým vykreslením, aby stránka neblikla.
- Existujúci `theme.jsx` uprav, nepíš nový.
- Pätička je tmavá v oboch režimoch.

### 2.2 Písma (self-host, podmnožina znakov ako dnes v `public/fonts.css`)

- **Bricolage Grotesque** 700 a 800: nadpisy, veľké čísla, logo. Optical size zapnutý.
- **Source Sans 3** 400 a 600: text.
- **Geist Mono** 400, 500 a 600: dátumy, sumy v tabuľkách, štítky, kickery, čísla zdrojov.

Postup podmnožiny je v `packages/web/README.md`. Zopakuj ho, Newsreader a Source Serif 4 odstráň. Všetky čísla v stĺpcoch dostanú `font-variant-numeric: tabular-nums`, bežný text nie.

### 2.3 Logo

- **Wordmark:** „dosleduj.to“ v Bricolage 800, pod ním červená krivka (niť) so špendlíkmi na oboch koncoch. Presné SVG je v `navrh.html`, sekcia Logo.
- Urob komponent `components/Logo.jsx`. Text musí mať `fill: var(--ink)`, niť `stroke` a `fill: var(--accent)`, aby fungoval v oboch režimoch.
- **Ikona a favicon:** „d“ s niťou na tmavom štvorci (`#151312`). Vygeneruj `favicon.svg`, `apple-touch-icon.png` 180×180 a `og-image.png` 1200×630 s wordmarkom na tmavom podklade.

### 2.4 Komponenty (`components/`)

- **`RoleTag`:** každý stav prezumpcie neviny má iný tvar, nielen farbu.

  | Stav | Tvar |
  |---|---|
  | podozrivý | prerušovaný sivý rámik |
  | obvinený | červený rámik |
  | obžalovaný | červený rámik + svetločervený podklad |
  | odsúdený | plná červená |
  | oslobodený | zelený rámik + zelený podklad |
  | svedok, poškodený, vyšetrovateľ, sudca | neutrálny rámik |

  Ukončená rola má 55 % priehľadnosť a za ňou obdobie.
- **`SourceRef`:** `[n]` v Geist Mono, akcent, podčiarknuté. Odkazuje na položku v záložke Zdroje. Pri odvodenom údaji pridaj štítok „odvodené“ a tooltip s textom `derivation`.
- **`Thread`:** mini niť na karte kauzy. Bodky = ľudia, štvorčeky = subjekty, za nimi počet. Max 8 tvarov, potom „+n“.
- **`Spark`:** SVG krivka článkov za 24 mesiacov, výplň plochy a zvýraznený posledný bod.
- **`Pager`:** stránkovanie, ktoré sa dá použiť všade (← 1 2 3 … n →, `aria-current="page"`). Generuje odkazy `?strana=n`, takže funguje aj bez JS.
- **`Seg`:** segmentový prepínač. Je to zoznam odkazov s query parametrom, nie klientský stav.

### 2.5 Hlavička a pätička

- **Hlavička:** logo, navigácia (Kauzy, Ľudia, Firmy a strany, Čo sa chystá), vyhľadávanie, prepínač režimu.
  - Aktívna položka má `aria-current="page"` a 2px červenú linku pod sebou.
  - „Firmy a strany“ je nový názov pre dnešné „Subjekty“. Adresy `/subjekty` a `/subjekt/:slug` zostávajú.
  - „Čo sa chystá“ je nová stránka `/kalendar` (kap. 5.6).
- **Pätička** (tmavá): logo a poslanie, Pravidlá, Oprava s funkčným odkazom na formulár podnetu. Dnes vedie na `/kauzy` alebo `#`, to je chyba.

## 3. Prepojenia: štyri pohľady

Rovnaké pohľady má profil osoby (`/osoba/:slug`) aj subjektu (`/subjekt/:slug`). Kauza (`/kauza/:slug`) dostane Mapu a Zdroje.

**Každá záložka má vlastnú adresu a renderuje sa na serveri.** Dá sa na ňu poslať odkaz a funguje aj bez JS:

```
/osoba/:slug              → Mapa (predvolená)
/osoba/:slug/v-case
/osoba/:slug/siet
/osoba/:slug/zdroje?strana=2&typ=urad|media&kauza=<slug>&zoradit=najnovsie|najstarsie
```

To isté platí pod `/subjekt/:slug/…`. Pod `/kauza/:slug/…` sú len `prepojenia` a `zdroje`. Do `routes.jsx` pridaj routy s `load`, ktorý volá len to API, ktoré záložka potrebuje.

**Hlava profilu:** meno, krátky životopis so zdrojom, štyri počítadlá (kauzy · firmy a strany · ľudia v okolí · zdroje) a pod nimi lišta záložiek s malým údajom („1 krok“, „2016–2027“, „2 kroky“, počet zdrojov).

### 3.1 Mapa (1 krok)

- SVG renderované na serveri. Tri stĺpce: vľavo firmy a strany, v strede subjekt (tmavý blok), vpravo kauzy. Pod nimi pás „Ľudia v okolí“ (cez spoločnú firmu alebo kauzu, max 8, potom „+n ďalších“ s odkazom na Sieť).
- **Čiary:**
  - na firmy a strany farbou `--org`, na kauzy `--accent`,
  - plná = platí, 35 % priehľadnosť = ukončené, čiarkovaná = `derived: true`.
- Pri každej čiare je rola, obdobie (`3/2019–1/2024`, `od 2018`) a `SourceRef`.
- Uzol kauzy ukazuje sumu alebo dopad (kap. 4), stav a fázu a aktuálny `RoleTag` osoby so zdrojom.
- Pri viacerých rolách v jednej kauze (podozrivý → obžalovaný) je na mape **jeden uzol** s aktuálnou rolou a pod ňou ukončené roly. Celý vývoj ukazuje záložka V čase. Dnešná duplicita na stránke kauzy, kde je osoba v dvoch riadkoch, sa rieši rovnako.
- Klik na uzol vedie na jeho profil. Uzly sú `<a>` v SVG, dostupné z klávesnice a so stavom pre `:focus-visible`.
- **Pod 820 px** sa mapa nahradí zoznamom v troch blokoch (Firmy a strany / Kauzy / Ľudia v okolí). Riadok má rovnaké údaje ako čiara na mape.
- Rozloženie je deterministické, žiadna simulácia. Max 8 uzlov na stĺpec, potom „+n“. Poradie: platné pred ukončenými, potom podľa dátumu.

### 3.2 V čase

- Mriežka: vľavo popis riadku (názov, rola, `SourceRef`), vpravo časová os. Rozsah je od najstaršieho `valid_from` po dnešok plus 1 rok, zaokrúhlený na celé roky. Na osi sú popisky každé 2 roky.
- Riadok pre každú firmu, stranu a kauzu.
  - Pruh = obdobie väzby. Tmavý pre subjekty, červený pre roly v kauze.
  - Ukončená väzba je priehľadnejšia, odvodená čiarkovaná, otvorená väzba končí šípkou na čiare „dnes“.
- **Udalosti** sú kosoštvorce s popisom (obvinenie, obžaloba, rozsudok…). Budúce majú prerušovaný červený rámik.
- Zvislá **červená čiara „DNES“** cez všetky riadky. Na dnešnom webe čiara chýba, hoci ju text spomína.
- **Prekrytie** (rámik pod grafom) ukáž, len ak sú splnené obe podmienky:
  1. obdobie väzby osoby na firmu (`link`) sa prekrýva s udalosťou kauzy, v ktorej tá firma má vlastnú rolu,
  2. oba údaje majú zdroj.

  Text je vždy označený „odvodený údaj“, s oboma `SourceRef`. Je to naše tvrdenie (README §5.10), preto ho počítaj v API a vráť aj s `derivation` textom. Ak sa to v prvom kroku nestihne, vynechaj ho. Nie je povinné pre míľnik 3.
- Pod 820 px je graf vodorovne posúvateľný (`overflow-x: auto` na kontajneri) a ľavý stĺpec zostane prilepený (`position: sticky`).

### 3.3 Sieť (2 kroky)

- Uzly: osoba = kruh, firma alebo strana = štvorec, kauza = kosoštvorec. Tie isté tvary sú v legende aj v logu.
- **Server** vráti uzly a hrany (kap. 7.1). **Klient** spočíta rozloženie cez `d3-force`. Je to jediná nová závislosť, stačí samotný balík `d3-force`, nie celé d3. Bez JS sa vykreslí server-side zoznam uzlov zoskupený podľa vzdialenosti.
- Ťahanie, zoom (koliesko a pinch), klik otvorí profil, hover zvýrazní susedov.
- Filtre ako `Seg`, uložené v URL: len platné väzby, skryť odvodené, len kauzy.
- Limit 60 uzlov. Pri prekročení sa zobrazia najdôležitejšie (podľa počtu spoločných káuz) a hláška „Zobrazených 60 z 143. Zúž filter.“
- Pri `prefers-reduced-motion` spočítaj rozloženie dopredu bez animácie.

### 3.4 Zdroje

- Zoznam všetkých článkov a úradných dokumentov k osobe, subjektu alebo kauze.
  - Riadok: číslo, titulok (odkaz von, `rel="noopener noreferrer nofollow"`), médium alebo úrad, dátum, štítok „úradný dokument“, odkaz na archív, ak existuje.
  - Pod tým čipy s údajmi, ktoré zdroj podopiera (napríklad „konateľ TestBuild 2019–2024“). Čipy sa skladajú z polí, v ktorých `sources[]` je id tohto článku.
- Filtre: typ (všetky / úradné / médiá), kauza, zoradenie. Stránkovanie **20 na stranu** cez `Pager`.
- Číslo `[n]` v Mape a V čase sa musí zhodovať s poradím v záložke Zdroje pri predvolenom triedení. Rieš to stabilným číslovaním v API (kap. 7.2), nie na klientovi.
- Opraviť: zdroj, ktorý s kauzou nesúvisí (na stránke Testovací most je dnes zdroj 03 o dotáciách), je chyba vo fixtures alebo v `by_case`. Over a oprav.

## 4. Kauzy, ktoré nie sú o peniazoch

Dnes model ráta len so sumou. Pribudne:

- **`case.kind`** (sourced value, číselník `case_kind`): `public_money`, `investigation_interference` (zásah do vyšetrovania), `abuse_of_power` (zneužitie právomoci), `elections_party_finance` (voľby a financovanie strán), `conflict_of_interest` (konflikt záujmov), `other`. Kauza môže mať viac druhov. Prvý je hlavný.
- **`case.impact`** (sourced value, voliteľné): krátky merateľný dopad pre kauzy bez sumy, napr. `{ value: 6, unit: "odvolaných vyšetrovateľov", note: "2 zrušené obvinenia politikov" }`. Má zdroj ako každý iný údaj.
- **Zobrazenie:**
  - na karte, v Mape aj v hlave kauzy je namiesto sumy veľké číslo dopadu s jednotkou,
  - kauza bez sumy aj dopadu ukáže len druh, nikdy „0 €“,
  - karta nefinančnej kauzy má hornú linku v `--accent`, finančná v `--ink`,
  - štítok druhu je v Geist Mono, verzálkami.
- **Zoznam `/kauzy`:** nový filter „Druh“. Triedenie podľa sumy dáva nefinančné kauzy na koniec s oddeľovačom „Kauzy bez sumy“, nie medzi nuly.
- `validate_doc_update` a fixtures: `kind` je pri zverejnenej kauze povinný a má zdroj. `impact` sa zverejní len so zdrojom.

## 5. Stránky

### 5.1 Titulka `/`

Poradie sekcií podľa `navrh.html`:

1. **Úvod:**
   - Vľavo kicker, nadpis „Kauzy nezmiznú, keď o nich médiá prestanú písať.“, perex, veľké vyhľadávanie s 2px rámikom a „Skús:“ s tromi odkazmi na reálne záznamy.
   - Vpravo „Stav registra“: kauzy, ľudia, firmy a strany, zdroje, suma spolu, z toho v uzavretých kauzách, a pruh „X % údajov podložených aj úradným dokumentom“. Ten je z `source_coverage` alebo z nového podielu úradných zdrojov, pozri 7.4.
2. **Peniaze v kauzách** (kap. 6).
3. **Čo sa chystá:** 4 najbližšie udalosti z `/api/events/upcoming`. Dátum, prerušovaný kosoštvorec, udalosť, kauza a súd, „o N dní“. Sekcia sa skryje, ak nie sú budúce udalosti.
4. **Naposledy sa pohlo:** 3 karty káuz podľa poslednej zmeny.
   - Karta: `RoleTag` fázy, štítok druhu, názov, perex, `Thread`, suma alebo dopad, štítok „sporné“ alebo „uzavretá“.
   - Riadok zmeny: „pred 2 dňami · nový termín pojednávania (InfoSúd)“. Pochádza z poslednej `revision` alebo nového článku, ktorá zmenila verejný údaj kauzy.
5. **O čom sa najviac píše** (kap. 6.2).
6. **Zabudnuté, ale nevyriešené** (kap. 6.3).
7. **Najväčšie sumy** (stĺpcový graf, top 5) a **Mená v najviac kauzách** (top 4 osoby a subjekty s počtom káuz). Pod druhým zoznamom je vždy veta „Výskyt v kauze nie je vina…“.
8. **Sleduj kauzu, osobu alebo firmu:** CTA na registráciu a sledovanie. Napoj ho na existujúce `subscriptions`. Ak neprihlásený používateľ nemá kam ísť, CTA vedie na prihlásenie.
9. Pätička.

### 5.2 Kauza `/kauza/:slug`

Zachovať obsah, prestylovať a opraviť:
- **Hlava:** štítky (fáza, druh, témy), H1, perex, vpravo „Najbližší termín“ a počítadlá.
- **Opraviť:** „Najbližší termín“ dnes píše, že žiadny nie je, hoci v časovej osi je budúce pojednávanie. Čítaj z rovnakého zdroja ako časová os (`event.expected` s dátumom ≥ dnes).
- **Kľúčové údaje:** suma alebo dopad. Pri spornej sume sú obe verzie vedľa seba, každá so zdrojom, so štítkom „sporné“ a vetou, že zdroje sa rozchádzajú. Register nevyberá, ktorá verzia platí.
- **Časová os** „Čo sa dialo a čo sa chystá“ s viditeľnou čiarou „DNES“.
- **Opraviť:** z časovej osi odstrániť internú poznámku „produktové zadanie §4.1“. Interné texty nesmú ísť do verejného renderu.
- **Ľudia v kauze:** jedna položka na osobu, vývoj rolí pod ňou.
- **Subjekty v kauze:** nový blok. Firmy a inštitúcie, ktoré sú dnes len v perexe (TestBuild), musia mať záznam a odkaz.
- Záložky **Prepojenia** (Mapa okolo kauzy: ľudia a subjekty podľa rolí, súvisiace kauzy cez spoločných ľudí) a **Zdroje**.
- **Opraviť:** „Niečo tu nesedí? → Poslať podnet“ vedie na formulár podnetu predvyplnený pre túto kauzu.

### 5.3 Osoba `/osoba/:slug` a subjekt `/subjekt/:slug`

- Hlava profilu podľa kap. 3 a štyri záložky.
- Subjekt navyše oddeľuje „vlastnú rolu v kauze“ od „súvisí cez svojich ľudí“, ako dnes rieši `items` a `via_members`. V Mape sú to dva rôzne štýly čiar a pod Mapou legenda s vysvetlením.

### 5.4 Zoznamy `/kauzy`, `/osoby`, `/subjekty`, `/hladat`

- Nové karty a riadky v štýle titulky.
- Filtre ako `Seg` a selecty. Všetko v URL, stránkovanie cez `Pager`.
- `/kauzy` dostane navyše filter Druh, triedenie „najviac sa píše“ a prepínač „len zabudnuté“.

### 5.5 Podnet `/podnet`

Ak formulár na verejnom webe neexistuje, dorob ho: polia `target`, text a povinný odkaz na zdroj, Turnstile, POST na existujúce `/api/.../suggestions`. Po odoslaní potvrdenie s číslom podnetu.

### 5.6 Kalendár `/kalendar`

Všetky budúce udalosti z `/api/events/upcoming`, zoskupené podľa mesiaca, filter podľa súdu a kauzy, stránkovanie.

## 6. Metriky

### 6.1 Peniaze v kauzách (titulka, a na `/kauzy` rovnaký blok podľa filtra)

- **Hore 4 čísla:** spolu (počet káuz so sumou), v riešení, uzavreté, vrátené alebo zaistené (zelené, % zo sumy spolu).
- **Pod nimi jeden vodorovný pruh** cez celú šírku, zložený z 8 segmentov, a značka „hranica otvorené / uzavreté“.
  - V riešení, čím ďalej v konaní, tým tmavší odtieň `--ink` (18 / 38 / 62 / 100 %):
    - bez trestného konania (len médiá, kontrola NKÚ alebo ÚVO),
    - vyšetrovanie (stíhanie vo veci),
    - obvinenie,
    - obžaloba a súd.
  - Uzavreté:
    - právoplatné odsúdenie (`--accent`),
    - oslobodenie (`--ok`),
    - zastavené alebo zrušené (§ 363), husté šrafovanie,
    - premlčané alebo odložené, riedke šrafovanie.
- **Dva stĺpce riadkov** (V riešení / Uzavreté): značka, názov, vysvetlivka, mini pruh, suma, % zo spolu a počet káuz.
- **Pod tým čiarkovaný box „N káuz nie je o peniazoch“** s čipmi druhov a počtami. Odkazujú na `/kauzy?druh=…`. Tieto kauzy sa do grafu peňazí nezapočítavajú.
- **Pravidlá výpočtu** (sú moje rozhodnutia, vypíš ich pod blokom a na `/ako-pocitame`):
  1. Suma kauzy je najvyššia suma, ktorá má zdroj. Pri spornej sume sa ráta tá vyššia, ale na stránke kauzy sú vidieť všetky verzie.
  2. Kauza sa zaradí podľa najďalšej fázy, ktorú dosiahla.
  3. Ak má viac obvinených s rôznym koncom, kauza ide do stavu, ktorý sa týka najväčšej časti sumy. Ak sa to nedá určiť, do najzávažnejšieho uzavretého výsledku v poradí odsúdenie > oslobodenie > zastavené > premlčané. Zaznač to ako `derived` s textom postupu.
  4. „Vrátené alebo zaistené“ je súčet nového poľa `case.recovered_amount` (sourced value, centy). Bez zdroja sa nezapočíta.
- **Mapovanie fáza → segment** patrí do číselníka (`codelist` kind `phase`, nové pole `bucket`), nie do kódu, aby ho vedel moderátor upraviť.

### 6.2 O čom sa najviac píše

- Rebríček 5 káuz za obdobie. Prepínač 30 dní / 12 mesiacov / celkovo cez `?obdobie=`.
- **Skóre** = počet článkov a úradných dokumentov za obdobie × (počet rôznych vydavateľov / počet článkov)^0,5. Tak kauzu nevytiahne jedno médium, ktoré o nej píše každý deň. Vzorec je moje rozhodnutie, drž ho v jednej funkcii v `shared/` s testom.
- Riadok:
  - poradie (veľké červené číslo),
  - názov, druh a stav,
  - `Spark` za 24 mesiacov,
  - „N článkov · M médií · ▲ +x %“, kde x je zmena oproti predchádzajúcemu obdobiu rovnakej dĺžky.
- Rovnaké triedenie je dostupné na `/kauzy?zoradit=najviac-pise`.

### 6.3 Zabudnuté, ale nevyriešené

- Kauza je otvorená (nie je v uzavretom segmente) a má aspoň 20 článkov celkovo (konfigurovateľné v `.env`, `FORGOTTEN_MIN_ARTICLES`). Za posledných 12 mesiacov k nej nevyšiel žiadny článok (`FORGOTTEN_SILENCE_DAYS=365`). Udalosti zo súdu sa nerátajú, ráta sa len mediálne ticho.
- Karta:
  - šedá krivka (`Spark` v `--muted`),
  - „Posledný článok pred N mesiacmi“ červenou,
  - „412 článkov v rokoch 2021–2023“,
  - tlačidlo „Sledovať“.
- Titulka ukáže 3 kauzy, zoznam `/kauzy?zabudnute=1`.

## 7. API a dáta

Dnešný stav: `packages/api/src/routes/public/*`, `shared/src/queries.js`, views v `couch/databases/dosledujto_register/`. Nové endpointy píš podľa `packages/api/README.md` (zod schémy, slug alebo id, žiadne N+1).

### 7.1 Graf

`GET /api/persons/:idOrSlug/graph?depth=1|2&active=1&derived=0&cases_only=1`, rovnako pre `/api/orgs/…` a `/api/cases/…`.

```json
{
  "nodes": [{ "id": "person:…", "type": "person|org|case", "slug": "…", "label": "…",
              "meta": { "amount": 1250000000, "impact": null, "status": "open", "phase": "indictment", "kind": ["public_money"] },
              "distance": 1 }],
  "edges": [{ "id": "link:…|role:…", "from": "…", "to": "…", "kind": "statutory|member|role", "role": "indicted",
              "valid_from": "2019-03-01", "valid_to": "2024-01-31", "derived": true, "derivation": "…",
              "sources": ["article:…"], "source_nos": [4] }],
  "truncated": { "shown": 60, "total": 143 },
  "sources": { "article:…": { "no": 4, "title": "…", "publisher": "…", "published_at": "…", "url": "…", "official": true } }
}
```

- Hrany sú len zverejnené `link` a `role` so zdrojom.
- Pri hĺbke 2 načítaj dávkovo: kľúče z prvého kroku → jedno `by_person/links` a jedno `by_case/children` s `keys`, potom `_all_docs` s `keys`.
- Hrana osoba ↔ osoba vzniká len zo skutočného `link`. Spoločná kauza alebo firma sa **nekreslí ako priama hrana** medzi ľuďmi, ide vždy cez uzol kauzy alebo firmy. Inak by graf tvrdil vzťah, ktorý nikto nepotvrdil.
- Prekrytie (3.2) vráť v `insights[]` s `derivation` a oboma zdrojmi.

### 7.2 Zdroje so stránkovaním

Rozšír `GET /api/{persons|orgs|cases}/:id/articles`:
- parametre `page`, `per_page` (max 50), `type=official|media`, `case`, `sort=desc|asc`,
- odpoveď `{ items, total, page, per_page }`,
- každá položka má `no` a `supports[]` (popisy polí, ktoré podopiera).

`no` je stabilné: poradie podľa (úradný dokument prvý, potom `published_at` zostupne, potom `_id`) **nad celým nefiltrovaným zoznamom**. Rovnaké `no` sa vracia v grafe.

### 7.3 Model

| Pole | Typ | Poznámka |
|---|---|---|
| `case.kind` | sourced value, pole kódov `case_kind` | povinné pri zverejnení |
| `case.impact` | sourced value `{ value, unit, note }` | voliteľné |
| `case.recovered_amount` | sourced value, centy | voliteľné |
| `codelist(kind=phase).bucket` | `none|investigation|charge|trial|convicted|acquitted|discontinued|lapsed` | mapovanie pre metriku |
| `codelist(kind=case_kind)` | nový číselník | 6 hodnôt z kap. 4 |

- Uprav `validate_doc_update`, schémy v `shared/`, fixtures a admin editor kauzy (tri nové polia cez existujúci editor sourced value, nič viac).
- Zmena indexu `search` (nový filter druh) znamená **rebuild Lucene**: nasadiť ako `search_v2`, `warm`, `promote` (couchman.md).

### 7.4 Štatistiky

Rozšír `GET /api/stats`:

```json
{
  "cases": 50, "cases_with_amount": 42, "persons": 318, "orgs": 127, "sources": 1946,
  "amount": 41260000000, "amount_closed": 12320000000, "recovered": 980000000,
  "official_share": 0.61,
  "money": { "buckets": [{ "bucket": "investigation", "group": "open", "amount": 9600000000, "cases": 9 }, "…"] },
  "non_money": [{ "kind": "investigation_interference", "cases": 3 }, "…"]
}
```

Nové endpointy:
- `GET /api/cases/top?period=30d|12m|all&limit=5` vráti kauzy so `score`, `articles`, `publishers`, `trend`, `spark[24]`,
- `GET /api/cases/forgotten?limit=3`,
- `GET /api/cases/:id/latest-change` (alebo pole `latest_change` v liste káuz).

Agregácie (články na kauzu po mesiacoch, počet vydavateľov) rieš novým view `stats/articles_by_case_month` s `_count`. Nepočítaj ich na každý request z celého zoznamu článkov.

### 7.5 Testovacie dáta (fixtures)

Dogeneruj fiktívne dáta, aby sa dalo dizajnovať. Konvencia mien zostáva: Testovací, Skúšobná, Vzorová, Pokusný, Modelový, Príkladná, domény `*.example`.

- **≥ 50 káuz**:
  - ≥ 8 nefinančných, pokryť všetky druhy,
  - pokryť všetky bucket-y z 6.1,
  - ≥ 3 sporné sumy,
  - ≥ 3 zabudnuté,
  - 2 s budúcimi udalosťami v najbližších 30 dňoch.
- **≥ 300 osôb a ≥ 120 subjektov** a dosť `link`, aby Sieť do 2 krokov mala pri niektorých osobách viac ako 60 uzlov (test orezania).
- **≥ 1 900 článkov** rozložených v rokoch 2019–2026, aby krivky a „najviac sa píše“ dávali zmysel. Generuj ich skriptom (`couch/fixtures/generate.js`, deterministický seed). Ručne písané zostanú len prvé fixtures.
- Všetko musí prejsť `validate_doc_update` (`npm run couch:fixtures`).

## 8. Prístupnosť a responzivita

- Zlomy 900 px (dva stĺpce → jeden) a 640 px (riadky zdrojov, kalendár). Bočný okraj min. 16 px, telo stránky sa nikdy neposúva do strany. Do strany sa posúva len graf V čase a Sieť vo vlastnom kontajneri.
- `:focus-visible` = 2px `--accent`, odsadenie 2px, všade. Všetky interaktívne prvky v SVG sú `<a>` s `aria-label`.
- Kontrast textu min. 4,5:1 v oboch režimoch. Over `--muted` na `--bg` aj `--surface`. Akcent na texte je OK (svetlý režim ≥ 5:1).
- Grafy majú textovú alternatívu: `role="img"` s `aria-label` a zoznam pod 820 px. Krivky `Spark` sú `aria-hidden`, lebo čísla sú vedľa.
- `prefers-reduced-motion`: žiadne prechody ani animácia siete.

## 9. Testy

- **Unit:**
  - skóre „najviac sa píše“,
  - pravidlá zaradenia do bucket-ov (vrátane viacerých obvinených a spornej sumy),
  - podmienka „zabudnuté“,
  - stabilné `no` zdrojov,
  - orezanie siete na 60.
- **Integrácia** (supertest proti lokálnej CouchDB): `/graph` hĺbka 1 a 2 bez N+1 (počet requestov do Couch v teste), `/articles` so stránkovaním a filtrami, `/stats` súčty sedia (súčet bucket-ov = `amount`), `/cases/top`, `/cases/forgotten`.
- **Web SSR** (rozšíriť `test/web-*.test.jsx`):
  - každá záložka sa vykreslí na serveri bez JS,
  - `?strana=2` vráti správny výrez,
  - tmavý režim nastaví `data-theme` pred prvým vykreslením,
  - nefinančná kauza nikde neukáže „0 €“,
  - stránka kauzy neukáže „žiadny termín“, ak existuje budúca udalosť,
  - interné poznámky sa nerenderujú.

## 10. Míľniky (poradie práce)

1. **Identita:** tokeny, písma, `Logo`, favicon a OG obrázok, hlavička, pätička, tmavý režim bez blikania. Existujúce stránky len prestylovať.
2. **Dáta a model:** `case.kind`, `impact`, `recovered_amount`, `phase.bucket`, `validate_doc_update`, generátor fixtures, `search_v2`.
3. **Prepojenia:** `/graph`, stránkované `/articles`, routy záložiek, Mapa, V čase, Zdroje na osobe a subjekte. Potom Sieť (`d3-force`).
4. **Kauza:** prestylovanie a opravy z 5.2, záložky Prepojenia a Zdroje, ľudia a subjekty v kauze.
5. **Titulka a metriky:** `/stats` rozšírenie, `/cases/top`, `/cases/forgotten`, všetky sekcie 5.1, stránka `/ako-pocitame`.
6. **Zoznamy, kalendár, podnet:** 5.4–5.6.
7. **Upratanie:** prístupnosť (kap. 8), responzivita, testy (kap. 9), aktualizácia `packages/web/README.md` a `CLAUDE.md`.

Každý míľnik je samostatný commit (alebo séria commitov), po ktorom `npm test` prejde a web beží. Nepushuj bez súhlasu vlastníka.

## 11. Rozhodnutia, ktoré som urobil za vlastníka (over)

- Záložky majú vlastné URL a renderujú sa na serveri (dá sa poslať odkaz na Zdroje strana 2).
- Sporná suma sa do metriky ráta vyššou hodnotou.
- Kauza s viacerými obvinenými sa zaradí podľa časti sumy, inak podľa poradia odsúdenie > oslobodenie > zastavené > premlčané.
- Vzorec skóre „najviac sa píše“ (kap. 6.2) a prahy „zabudnutej“ kauzy (20 článkov, 365 dní ticha).
- Spoločná kauza alebo firma sa v Sieti nekreslí ako priama hrana osoba ↔ osoba.
- Jediná nová frontend závislosť je `d3-force`.
- „Subjekty“ sa v navigácii premenúvajú na „Firmy a strany“, adresy zostávajú.

# Zadanie pre admin zónu: Register káuz

Nadväzuje na `README.md` (produktové zadanie) a `backend-zadanie.md`. Popisuje **administračné
rozhranie** — obrazovky, správanie, roly a vizuálny jazyk. Verejný frontend nie je súčasťou tohto
zadania.

Toto zadanie je o UX a rozhraní. Konkrétne endpointy sú v `backend-zadanie.md` §6; kde admin
potrebuje niečo, čo backend zatiaľ nemá, je to zhrnuté v kapitole 12 — nie ako návrh API, ale ako
zoznam vecí, ktoré treba doriešiť.

## 1. Stack a spôsob nasadenia

- Samostatný balík `packages/admin`. **SPA, nie server-rendered** — backend zostáva čisté REST API.
- **Vite + React**, plain JavaScript s JSDoc typmi, rovnako ako zvyšok repozitára. Bez TypeScriptu.
- **AdminLTE 4** (Bootstrap 5, bez jQuery). Z AdminLTE berieme layout, sidebar a CSS. Interaktívne
  komponenty (modály, dropdowny, taby) sú React nad Bootstrap triedami, nie AdminLTE JS.
- Build vyprodukuje statické súbory, ktoré Express servíruje pod `/admin/*` z **rovnakej domény** ako
  API. Session cookie tak zostáva first-party, žiadne CORS (`backend-zadanie.md` §7).
- Router s `basename: "/admin"`, fallback na `index.html` pre client-side routy.
- UI je **po slovensky**. Identifikátory v kóde, cesty a názvy polí anglicky — rovnaký rez ako v
  zvyšku projektu.
- Žiadny state-management framework navyše. Server state cez TanStack Query (cache, invalidácia,
  optimistické updaty), lokálny stav formulárov v komponentoch.

Prihlásenie: samostatná stránka `/admin/login`, session cookie, CSRF token pre všetky non-GET.
Používateľ s rolou `user` sa do admina neprihlási — dostane hlášku, že jeho účet nemá prístup do
administrácie, a odkaz späť na verejnú časť. Vypršanie session počas práce nesmie zhodiť rozpracovaný
formulár: zobrazí sa modál s prihlásením, po ňom sa akcia zopakuje.

## 2. Roly a viditeľnosť

Štyri roly, kumulatívne: `superadmin ⊃ admin ⊃ moderator ⊃ user`.

**superadmin** — všetko. Navyše výhradne: správa admin používateľov a ich rolí, mazanie kauzy,
revert revízie, správa feedov, mazanie účtu registrovaného používateľa.

**admin** — všetky kauzy bez obmedzenia. Zakladá kauzy (moderátor nie). Prideľuje a odoberá
moderátorov ku kauzám a schvaľuje ich žiadosti o moderovanie. Vidí všetky podnety. Spravuje
číselníky, osoby, subjekty, prepojenia a registrovaných používateľov.

**moderator** — vidí **všetky** kauzy, ale len ako čítanie. Edituje výhradne kauzy, ku ktorým je
priradený. Pri cudzej kauze má na detaile tlačidlo **„Požiadať o moderovanie"**; žiadosť schvaľuje
admin. Moderátor môže mať priradených ľubovoľne veľa káuz a jedna kauza môže mať viac moderátorov.
Vo fronte podnetov vidí len podnety k svojim kauzám. Články vidí a spracúva **všetky** bez ohľadu na
priradenie — fronta článkov je spoločná a nedá sa rozdeliť skôr, než sa článok priradí ku kauze.

Čo moderátor nesmie: zakladať a mazať kauzy, publikovať kauzu, meniť roly, spravovať číselníky,
používateľov ani feedy, riešiť podnety na novú kauzu (`target.id: null` — tie idú do frontu adminov).

**Zásada zobrazovania práv:** akcia, na ktorú používateľ nemá právo, sa **nezobrazuje**, nie
zobrazuje neaktívna. Výnimka je detail cudzej kauzy u moderátora — tam je stav „čítanie" viditeľný
zámerne, pruhom nad obsahom s vysvetlením a tlačidlom na žiadosť. Rozdiel je zámerný: neaktívne
tlačidlo, ktoré nikdy nezaktívni, je šum; tu vieme, ako sa právo získa.

## 3. Layout a navigácia

Klasický AdminLTE rez: fixný sidebar vľavo (zbaliteľný na ikony), horný pruh, obsah.

Sidebar, v tomto poradí:

- **Prehľad** — dashboard
- **Kauzy** — s badge počtu mojich káuz s nespracovaným pohybom
- **Podnety** — badge počtu `pending` v mojom rozsahu
- **Články** — badge počtu `candidate`
- **Osoby** a **Subjekty** (strany, firmy, inštitúcie)
- **Číselníky** — súdy, tagy, kategórie udalostí, typy prepojení
- **Používatelia** — registrovaní (admin+)
- **Administrátori** — admin účty a roly (superadmin)
- **Feedy** (superadmin)
- **Revízie** — audit log (admin+)

Badge ukazujú **prácu, ktorá čaká na mňa**, nie celkové počty. Moderátorovi teda badge podnetov
počíta len jeho kauzy. Nulový počet znamená žiadny badge, nie nulu.

Horný pruh: globálne vyhľadávanie (kauzy, osoby, subjekty, články — jedno pole, výsledky zoskupené
podľa typu, klávesnicou ovládateľné), meno prihláseného s rolou, odhlásenie.

Drobečková navigácia je povinná všade hlbšie než prvá úroveň — z detailu role sa musí dať jedným
klikom vrátiť na kauzu.

## 4. Prehľad (dashboard)

Nie sklad grafov. Štyri bloky, v poradí naliehavosti:

1. **Čaká na mňa** — podnety `pending`, články `candidate`, moje kauzy bez pohybu viac ako 60 dní,
   a u admina žiadosti moderátorov o priradenie. Každá položka je odkaz do príslušnej fronty.
2. **Posledný pohyb** — čo sa v systéme udialo za posledných 7 dní: publikované zmeny, nové kauzy,
   prijaté podnety. Moderátorovi zúžené na jeho kauzy, s prepínačom „všetko".
3. **Kvalita dát** — metriky z `README.md` §9: podiel údajov s funkčným zdrojom (cieľ 100 %), podiel
   údajov s úradným zdrojom, podiel botích návrhov schválených bez úpravy, priemerný čas od udalosti
   po záznam. Čísla s trendom oproti minulému mesiacu, bez grafov.
4. **Rozsah** — počet publikovaných káuz, konceptov, osôb, článkov.

Podiel údajov bez zdroja nie je metrika ako každá iná — ak nie je 100 %, blok sa zvýrazní ako chyba.
Je to jediný ukazovateľ, ktorý smie kričať.

## 5. Kauzy

### 5.1 Zoznam

Filtre v pruhu nad zoznamom, nie v bočnom paneli: stav, fáza, publikačný stav (koncept / publikovaná
/ skrytá), politická strana, osoba, rozsah sumy, obdobie, tag, moderátor. Prepínač **„Len moje
kauzy" / „Všetky"** je najdôležitejší filter a stojí vľavo, oddelený.

Stav filtrov sa drží v URL, aby sa dal odkaz na filtrovaný zoznam poslať kolegovi.

Riadok kauzy: názov, štítok fázy, publikačný stav, suma, počet osôb, počet zdrojov, dátum poslednej
zmeny, avatary priradených moderátorov. Riadok konceptu je vizuálne odlíšený — koncepty zakladá
worker automaticky a je ich veľa; nesmú sa strácať medzi publikovanými.

Hromadné akcie: pridať tag, priradiť moderátora, skryť (admin+). Zakladanie novej kauzy je vpravo
hore, len pre admina.

### 5.2 Detail kauzy

Hlavička: názov, fáza, stav, publikačný stav, suma, priradení moderátori, tlačidlá **Publikovať /
Skryť** (admin+) a **Požiadať o moderovanie** (moderátor pri cudzej kauze).

Obsah v taboch, každý tab má vlastnú URL:

- **Prehľad** — popis, stav, fáza, suma, tagy, súvisiace kauzy. Všetko cez editor zdrojovanej hodnoty
  (§6).
- **Ľudia a role** — zoznam osôb v kauze s rolou a platnosťou v čase. Zmena role nikdy neprepisuje
  starú: formulár sa volá **„Zmeniť rolu"** a jasne hovorí, že doterajšia rola sa uzavrie k dátumu a
  zostane v histórii. Zobrazenie má prepínač „aktuálne role" / „celá história". Toto je miesto, kde
  je prezumpcia neviny najviditeľnejšia — role sa renderujú farebne odlíšené (§10).
- **Časová os** — udalosti minulé a očakávané, v jednom vertikálnom prúde, oddelené čiarou „dnes".
  Očakávané udalosti sú vizuálne rozlíšené (prerušovaný okraj). Pridanie udalosti inline, nie v
  samostatnej obrazovke.
- **Konania** — súdne konania: súd (z číselníka), spisová značka, fáza, rozhodnutia. Spisová značka
  je zvýraznená a kopírovateľná jedným klikom — je to jediný praktický kľúč na spárovanie
  anonymizovaného rozhodnutia (`README.md` §5.10).
- **Zdroje** — články a úradné dokumenty priradené ku kauze, zoradené podľa dátumu vydania, s
  filtrom médium / úradný dokument. Tlačidlo **Pridať úradný dokument** (ručné zadanie zdroja).
  Odtiaľ sa dá zdroj odpojiť, ale nie zmazať.
- **Prepojenia** — prepojenia osôb a subjektov naviazané na túto kauzu.
- **Podnety** — podnety k tejto kauze, s počtom čakajúcich.
- **História** — revízie tejto kauzy: kto, kedy, čo, prečo, na základe akého podnetu.

Pri každom uložení je **povinný dôvod zmeny**. Nie voliteľné pole na konci formulára — dialóg pri
uložení s jednou vetou. Bez neho sa neuloží.

### 5.3 Priradenie moderátorov

Na detaile kauzy blok s priradenými moderátormi. Admin pridáva a odoberá. Žiadosti o moderovanie sa
zbierajú do frontu na dashboarde admina a schvaľujú sa jedným klikom; pri zamietnutí je dôvod
povinný a žiadateľ ho uvidí.

## 6. Editor zdrojovanej hodnoty — nosný komponent

Toto je najdôležitejší kus rozhrania. Ak bude ťažkopádny, moderátori budú obchádzať pravidlá alebo
prestanú prispievať.

Každé publikovateľné pole je objekt `{ value, sources[], derived, derivation, disputed[],
asserted_at }` (`CLAUDE.md`, rozhodnutie 1). V rozhraní vyzerá jednotne, nech ide o text, sumu, stav
či dátum:

- **Hodnota** hore, vo vstupe primeranom typu.
- **Zdroje** pod ňou ako čipy: názov média a dátum, odkaz otvára originál v novom okne. Zdroj sa
  pridáva vyhľadaním medzi už uloženými článkami, nie vpisovaním URL — tým sa zabráni duplicitám.
  Ak zdroj v systéme nie je, tlačidlo **Pridať zdroj** ho v modáli založí a rovno pripojí.
- **Pole bez zdroja je vizuálne rozbité.** Červený okraj, ikona a text „bez zdroja — nezverejní sa".
  Nie tichá validácia až pri uložení. Používateľ musí vidieť problém v momente, keď vznikne.
- **Rozpor** — tlačidlo „Zdroje sa rozchádzajú" pridá alternatívnu hodnotu s vlastnými zdrojmi.
  Zobrazí sa pod hlavnou hodnotou ako rovnocenná, nie ako poznámka. Rozhranie nikde nenúti vybrať
  jednu; systém nerozhoduje (`README.md` §4.6).
- **Odvodený údaj** — prepínač „toto sme odvodili sami", ktorý sprístupní povinné pole s popisom
  postupu. Zapnutý prepínač zmení vzhľad celého poľa, aby bolo na prvý pohľad vidieť, že tvrdenie je
  naše, nie prevzaté. Text pri prepínači: „Odvodené údaje sú naše tvrdenie, nie citácia. Popíš, ako
  si k hodnote došiel."
- Ak je medzi zdrojmi úradný dokument a hodnota nezodpovedá jemu, zobrazí sa nevtieravé upozornenie —
  úradný dokument má prednosť pri rozpore.

Pri publikovaní kauzy sa zobrazí kontrolný zoznam polí bez zdroja. Kým nie je prázdny, tlačidlo
Publikovať nefunguje a hovorí prečo. To isté pravidlo vynucuje aj `validate_doc_update` v databáze —
rozhranie ho má vysvetliť skôr, než na neho používateľ narazí ako na chybu servera.

## 7. Články

### 7.1 Fronta

Karty stavu hore ako filtre: **Nespracované** (`candidate`), **Spracované**, **Priradené**,
**Zamietnuté**. Predvolene otvorené nespracované, zoradené od najnovších.

Ďalšie filtre: médium, obdobie, typ (médium / úradný dokument), text, „bez priradenia ku kauze",
„paywall". Riadok: titulok, vydavateľ, dátum, štítky priradených káuz a osôb, indikátor paywallu.

### 7.2 Detail článku — spracovanie

Dvojstĺpec. Vľavo text článku ako pracovný podklad, vpravo priraďovanie. Nad textom trvalé
upozornenie: **plný text je interný podklad, verejné API ho nikdy nevracia** — do produktu ide len
titulok, vydavateľ, dátum, odkaz a krátky výňatok (`backend-zadanie.md` §2.2).

Pravý stĺpec:

- **Zistenia z parsovania** — mená, sumy, dátumy, spisové značky, ktoré matcher našiel, každé s
  mierou istoty a s tlačidlami *Potvrdiť / Upraviť / Zamietnuť*. Potvrdené zistenie sa premietne do
  návrhu zmeny kauzy. Zistenie, ktoré nemá záznam v systéme (nové meno, nová firma), ponúka
  založenie osoby alebo subjektu.
- **Priradenie ku kauzám** — vyhľadávanie s návrhmi od matchera navrchu. Ak žiadna kauza nesedí,
  tlačidlo **Založiť kauzu z tohto článku** (admin) alebo **Navrhnúť novú kauzu** (moderátor).
- **Priradenie k osobám**.
- **Typ zdroja** — médium / úradný dokument.
- **Zamietnuť** s dôvodom — článok sa nezmaže, len vypadne z frontu.

Klávesové skratky sú tu povinné: potvrdiť, ďalší, zamietnuť. Fronta má desiatky položiek denne a
myšou je to neúnosné.

**Poznámka k realite:** matcher zatiaľ neexistuje, worker vie len stiahnuť články ako `candidate`
(`CLAUDE.md`). Obrazovky navrhni podľa cieľového stavu; blok „Zistenia z parsovania" musí korektne
zvládnuť stav, keď zistenia nie sú — nie prázdny rámik, ale text vysvetľujúci, že článok sa priraďuje
ručne. Ručné priradenie musí fungovať samo o sebe, bez ohľadu na matcher.

### 7.3 Zmenený zdroj

Ak sa článok na tom istom URL zmení (`content_hash`), vznikne podnet typu „zdroj sa zmenil".
V rozhraní sa zobrazí ako **porovnanie starej a novej verzie textu** so zvýraznenými rozdielmi a so
zoznamom údajov, ktoré sa o tento článok opierajú. Moderátor rozhodne, či treba údaje upraviť. Toto
je odpoveď na otvorenú otázku z `README.md` §11 a nesmie skončiť ako obyčajný riadok vo fronte.

## 8. Podnety

Fronta s filtrami: stav, pôvod (človek / bot), typ cieľa, obdobie, miera istoty pri botích návrhoch.
Moderátorovi predfiltrované na jeho kauzy, bez možnosti prepnúť na cudzie. Adminovi všetko vrátane
podnetov na novú kauzu, ktoré tvoria vlastnú kartu.

Detail podnetu je **porovnanie**: vľavo súčasná hodnota, vpravo navrhovaná, rozdiel zvýraznený.
Pod tým zdroje priložené k podnetu — ako odkazy na overenie, otvárané v novom okne. Komentár
zadávateľa. Pri botom návrhu miera istoty a článok, z ktorého návrh vznikol.

Tri akcie: **Prijať**, **Prijať s úpravou** (otvorí hodnotu na editáciu pred uložením), **Zamietnuť**
s povinným dôvodom. Štvrtá, **Vyžiadať doplnenie**, posunie podnet do stavu `needs_info` a zadávateľ
ju uvidí vo svojich podnetoch.

Rozhranie musí byť zjavné v jednej veci: **prijatie podnetu automaticky nepripája zdroj k údaju.**
Zdroje z podnetu treba pripojiť vedome, v editore hodnoty. Formulácia pri tlačidle to má povedať
priamo, inak vzniknú publikované údaje s prázdnym `sources`.

## 9. Ostatné obrazovky

**Osoby.** Zoznam s vyhľadávaním, filtrom podľa strany a role. Detail: mená a varianty (kritické pre
matching — pády, prechyľovanie, iniciály z policajných správ), rok narodenia, krátky popis so
zdrojom, kauzy s rolami, prepojenia, články. Akcia **Zlúčiť osoby** (admin): vyhľadá sa duplicita,
zobrazí sa porovnanie oboch záznamov vedľa seba a explicitne to, čo sa presunie a čo zanikne.
Zlúčenie je nevratné a musí to povedať.

**Subjekty.** To isté pre strany, firmy a inštitúcie, s IČO a variantmi názvu.

**Prepojenia.** Zakladanie a ukončovanie väzieb osoba ↔ osoba / osoba ↔ subjekt / subjekt ↔ subjekt,
s typom, platnosťou v čase, zdrojmi a príznakom odvodenia. Zoznam s filtrom podľa typu a osoby.
Vizualizácia siete nie je súčasťou tejto verzie (`README.md` §8).

**Číselníky.** Jedna obrazovka s prepínačom oblastí: súdy, tagy káuz, kategórie udalostí, typy
prepojení. Súdy sú prioritné — dnes je súd voľný text v konaní a bez číselníka sa nedá filtrovať ani
spoľahlivo vykazovať. Položka číselníka nesie názov, skratku, prípadne nadradenú položku, a **nedá sa
zmazať, ak je použitá** — len deaktivovať. Pri každej položke je vidieť počet použití.

**Registrovaní používatelia.** Zoznam: e-mail, prezývka, dátum registrácie, počet sledovaných káuz,
súhlas s marketingovými oznámeniami, stav účtu. E-maily sa zobrazujú celé — admin s nimi pracuje pri
riešení sťažností — ale nekopírujú sa hromadne a v zozname nie je export.

Detail: sledované kauzy, každá so zvoleným režimom oznámení. Režimy sú dva:
**a) pri každej zmene kauzy** a **b) len v týždennom súhrne**. Admin režim vidí, nemení — je to
voľba používateľa.
Akcie: blokovať účet, odblokovať, zmazať účet (superadmin, s upozornením na nevratnosť a s
poznámkou, že revízie ostávajú, lebo tvoria audit).

**Administrátori.** Zoznam admin účtov, ich rola, posledné prihlásenie, počet moderovaných káuz.
Zmena role, blokovanie, založenie účtu. Len superadmin. Nikto si nemôže znížiť ani zvýšiť vlastnú
rolu a posledný superadmin sa nedá odstrániť — rozhranie to má vysvetliť, nie len zlyhať.

**Feedy.** Zoznam sledovaných zdrojov: názov, typ, URL, interval, posledný beh, počet nových článkov,
stav robots.txt, príznak paywallu, zapnutie/vypnutie, manuálne spustenie. Pri chybe posledného behu
je viditeľná chybová hláška, nie len červená bodka. Len superadmin.

**Revízie.** Audit log naprieč systémom: filtre podľa cieľa, autora, obdobia a typu zmeny. Riadok
rozbaliteľný na rozdiel. Vrátenie zmeny je akcia superadmina, s potvrdením a povinným dôvodom.

## 10. Vizuálny jazyk

Základ je AdminLTE, ale tri veci sú produktové rozhodnutia, nie štýlovanie:

**Role a prezumpcia neviny.** `suspect | accused | indicted | convicted | acquitted` sú odlišné stavy
a musia sa renderovať odlišne — vlastný štítok, vlastná farba, vlastné slovo. Nikdy nie spoločný
červený štítok „trestné". Oslobodenie má rovnakú vizuálnu váhu ako obvinenie, nie menšiu; v histórii
rolí sa nezmenšuje ani neskrýva.

**Stav zdrojovania.** Tri stavy, rozoznateľné bez čítania: údaj so zdrojom (neutrálny), údaj bez
zdroja (červený, s vysvetlením), údaj odvodený nami (odlíšený vlastnou farbou a ikonou). Toto je
vizuálny slovník, ktorý sa používa všade rovnako — v editore, v zozname, v podnete, v histórii.

**Publikačný stav.** Koncept, publikované a skryté musia byť rozoznateľné v zozname aj na detaile.
Práca v koncepte má mať trvale viditeľný pruh, aby nikto needitoval nepublikovanú kauzu v domnení, že
je vonku.

Prázdne stavy sú výzva na akciu, nie oznam. „Zatiaľ žiadne podnety" je slabé; „Fronta je prázdna —
podnety sa objavia, keď niekto pošle opravu" hovorí, čo sa deje. Chybové stavy hovoria, čo sa stalo a
čo s tým, a neospravedlňujú sa.

Konflikt verzií (`409`, dvaja moderátori na tej istej kauze) nie je technická chyba — je to bežná
situácia. Rozhranie ukáže, čo sa medzitým zmenilo a kto to zmenil, a ponúkne prevzatie cudzej zmeny
alebo návrat k formuláru. Nikdy nesmie ticho prepísať ani zahodiť rozpracované.

Prístupnosť ako podlaha, nie ako nadstavba: viditeľný fokus, ovládateľnosť klávesnicou vo frontách,
kontrast, stavy nesignalizované len farbou (vždy aj slovom alebo ikonou).

## 11. Poradie implementácie

1. Skelet: layout, sidebar, prihlásenie, roly, ochrana routov, prázdne obrazovky.
2. Kauzy — zoznam a detail v režime čítania.
3. **Editor zdrojovanej hodnoty.** Bez neho sa nedá editovať nič a všetko ostatné na ňom stojí.
4. Editácia kauzy: prehľad, role, časová os, konania, s povinným dôvodom a revíziami.
5. Články — fronta a ručné priradenie ku kauze a osobám.
6. Podnety — fronta a rozhodovanie.
7. Osoby, subjekty, prepojenia, zlúčenie.
8. Priraďovanie moderátorov a žiadosti o moderovanie.
9. Číselníky, registrovaní používatelia, administrátori, feedy, revízie.
10. Dashboard s metrikami — až keď je čo merať.

Bloky „Zistenia z parsovania" a porovnanie zmeneného zdroja sa dopĺňajú, keď bude matcher.

## 12. Čo z toho vyplýva pre backend

Nie návrh API, len zoznam vecí, ktoré admin potrebuje a dnes neexistujú. Treba ich rozhodnúť pred
implementáciou príslušných obrazoviek:

- **Rola `superadmin`** — dnes sú tri roly (`backend-zadanie.md` §7).
- **Priradenie moderátora ku kauze** — väzba používateľ ↔ kauza, v oboch smeroch M:N.
- **Žiadosť o moderovanie** — stav, schválenie, zamietnutie s dôvodom.
- **Číselník súdov** — dnes je `court` v konaní voľný text. Nový typ dokumentu, migrácia fixtures,
  index. To isté pre tagy a kategórie, ak sa majú spravovať.
- **Súhlas s marketingovými oznámeniami** — nové pole na používateľovi.
- **Režimy oznámení** — produkt sa zúžil na *pri každej zmene* a *týždenný súhrn*. Model má dnes
  `frequency: instant|daily|weekly` a `level: all|significant`; treba rozhodnúť, či sa zúži schéma,
  alebo len ponuka v UI.
- **Metriky pre dashboard** — čo `stats/coverage` nevie spočítať, treba doplniť.
- **Počty pre badge** — jeden lacný dotaz na prácu čakajúcu na prihláseného, nie počítanie na klientovi.
- **Mazanie kauzy a mazanie účtu** — dnes existuje len skrytie; treba doriešiť vzťah k revíziám.

## 13. Čo v prvej verzii admina nie je

Vizualizácia siete prepojení, hromadný import, export dát, prispôsobiteľné dashboardy, notifikácie v
rozhraní, komentáre a interná diskusia medzi moderátormi, mobilná verzia (rozhranie je responzívne,
ale je určené na prácu na počítači), viacjazyčnosť.

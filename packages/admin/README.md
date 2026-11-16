# Admin zóna — Register káuz

Vite + React 19, plain JavaScript s JSDoc, AdminLTE 4 (Bootstrap 5, bez jQuery),
TanStack Query. Bez TypeScriptu, bez ďalšieho state-management frameworku.

```bash
npm run admin:build      # statické súbory do packages/admin/dist
npm run api              # Express ich servíruje na http://127.0.0.1:3000/admin
npm run admin:dev        # Vite dev server na :5173, /api ide proxy na :3000
```

Build sa servíruje pod `/admin/*` z **rovnakej domény** ako API — session cookie
zostáva first-party a CORS sa nikde nekonfiguruje. Ak build neexistuje, `/admin`
vráti 503 s vetou, čo spustiť; prázdna 404 by vyzerala ako chyba servera.

## Štruktúra

```
src/
  api/client.js      jediné miesto, ktoré volá API: CSRF, jednotná chyba, 409
  api/queries.js     TanStack Query hooky a invalidácia
  auth.jsx           prihlásenie, roly, ochrana routov, modál pri vypršaní session
  theme.jsx          svetlý a tmavý režim (`data-bs-theme`) a jeho prepínač
  permissions.js     kto koho smie spravovať v sekcii účtov (zrkadlo backendu)
  codelist.jsx       čítanie číselníka vo formulároch (ponuka, názov ku kódu)
  assign.jsx         priraďovanie: kauzy, osoby, subjekty, články, konania
  layout.jsx         sidebar s badge, horný pruh s globálnym hľadaním, drobečky
  ui.jsx             vizuálny slovník: role, publikačný stav, stav zdrojovania
  sourced.jsx        editor zdrojovanej hodnoty — nosný komponent
  pages/             Dashboard, Cases, CaseDetail, Articles, Suggestions,
                     Entities, Codelists, Operations
```

## Čo je hotové

Podľa poradia v §11 zadania: skelet a roly (1), zoznam a detail kauzy (2),
**editor zdrojovanej hodnoty** (3), editácia kauzy s povinným dôvodom a
revíziami (4), fronta článkov s ručným priradením (5), fronta podnetov a
rozhodovanie (6), osoby a subjekty ako čítanie (7), feedy, používatelia a
revízie (9), dashboard s metrikami kvality (10).

### Editor zdrojovanej hodnoty

Nosný komponent (§6) — má vlastné testy, lebo ak prestane kričať pri poli bez
zdroja, produkt stratí to jediné pravidlo, na ktorom stojí.

- Hodnota hore, **zdroje hneď pod ňou** ako čipy s vydavateľom a dátumom;
  úradný dokument má vlastnú farbu a značku `§`.
- Zdroj sa pridáva **vyhľadaním medzi uloženými článkami**, nie vpisovaním URL —
  tým sa zabráni duplicitám. Ak chýba, dá sa v tom istom modáli založiť.
- **Pole bez zdroja je vizuálne rozbité** hneď, ako taký stav vznikne: červený
  okraj, štítok a veta „bez zdroja — nezverejní sa“. Nie tichá validácia pri
  uložení.
- Rozpor pridá alternatívnu hodnotu s vlastnými zdrojmi, zobrazenú ako
  rovnocennú. Rozhranie nikde nenúti vybrať jednu.
- Prepínač „toto sme odvodili sami“ sprístupní povinný popis postupu a zmení
  vzhľad celého poľa — na prvý pohľad je vidieť, že tvrdenie je naše.
- Pred publikovaním sa vypíšu polia bez zdroja a tlačidlo Publikovať nefunguje.
  To isté pravidlo vynucuje `validate_doc_update`; rozhranie ho má vysvetliť
  skôr, než naň používateľ narazí ako na chybu servera.

### Ďalšie rozhodnutia zo zadania, ktoré sú v kóde vidieť

**Zmena role neprepisuje históriu.** Formulár sa volá „Pridať alebo zmeniť rolu“
a keď má osoba v kauze otvorenú rolu, ponúkne jej uzavretie k dátumu s vetou, že
zostane v histórii. Oslobodenie má rovnakú vizuálnu váhu ako obvinenie.

**Povinný dôvod zmeny** je dialóg pri uložení, nie pole na konci formulára.

**Konflikt verzií (409)** je bežná situácia, nie chyba: dialóg ukáže, kto a kedy
zmenil, a ponúkne prevzatie cudzej verzie alebo návrat k formuláru. Rozpracované
sa nikdy nezahodí ani ticho neprepíše.

**Vypršaná session** nezhodí formulár — otvorí sa modál s heslom nad obrazovkou.

**Priraďovať sa dá z oboch strán a všade rovnako.** Tú istú väzbu vypĺňa
moderátor raz z článku, inokedy z profilu osoby či subjektu — bloky v
`assign.jsx` sú preto spoločné a obrazovka im len povie, čoho sa väzba týka.
Všade to znamená našepkávač, nie rozbaľovací zoznam, a všade sa dá záznam, ktorý
v registri ešte nie je, **založiť rovno z našepkávača**: odchod na inú obrazovku
by znamenal stratiť rozrobené priradenie. Nový záznam vzniká ako koncept.

**Priradiť je lacné, odpojiť sa pýta dôvod.** Pripojenie sa dá odklikať späť;
odpojenie je rozhodnutie, že tam väzba nepatrí, a to patrí do auditu. Preto sa
priradenie ukladá hneď, nie tlačidlom „Uložiť" na konci — jeden dôvod na päť
rôznych rozhodnutí nie je dôvod.

**Rola je to, čím entita v kauze je.** Priradenie článku k osobe znamená „článok
o nej hovorí"; čím je v kauze, povie rola — a tá sa dá založiť priamo z článku,
ktorý je jej zdrojom. Rovnako pre subjekt: aj firma môže byť v kauze obvinená.
Pri prepojení osoba ↔ subjekt hrá tú istú úlohu typ prepojenia (člen, štatutár,
vlastník, konečný užívateľ výhod).

**Tmavý režim sa nastaví pred prvým vykreslením.** Bootstrap 5.3 prepína tému
atribútom `data-bs-theme` na `<html>`; nastavuje ho inline skript v
`index.html`, nie React — inak by na tmavom režime pri každom načítaní bliklo
biele pozadie. Kým si moderátor nevybral, administrácia sa riadi systémom, a to
aj keď ho prepne za behu; vlastná voľba systém prebije a dá sa vrátiť späť
(tlačidlo ⟳ voľbu zabudne, neprepne natvrdo na svetlý). Utility s natvrdo
pomenovanou farbou (`text-bg-light`, `table-light`) sa v tmavom režime mapujú na
role z témy — svetlý štítok na tmavom pozadí je čitateľný, ale kričí viac než
údaj, ktorý nesie.

**Číselník ponúka, neblokuje.** Formulár konania berie súdy z číselníka, ale
súd, ktorý v ňom ešte nie je, sa dá napísať ručne — a na obrazovke Číselníky je
potom vidieť, že v konaniach je zapísaný súd mimo číselníka. Rovnako sa nikdy
nezahodí hodnota, ktorá už v dokumente je: deaktivovaná alebo neznáma položka
zostane v ponuke označená, inak by otvorenie formulára ticho prepísalo údaj,
ktorý nikto meniť nechcel.

**Účty spravuje ten, kto na ne má.** Superadmin upraví profil, rolu aj stav
*všetkých* účtov vrátane administrátorov; administrátor moderátorov a bežných
používateľov, ale nie iný admin účet. Rolu vyššiu, než má sám, neprideľuje nikto
a vlastný účet sa upravuje cez `/profil` — inak by si admin vedel odobrať rolu
alebo vypnúť sám seba. Pravidlo je v `permissions.js` len na to, aby sa akcia
nezobrazila; rozhoduje `PATCH /api/admin/users/:id` (skryté tlačidlo nie je
oprávnenie).

**Účet sa nezakazuje, vypína sa.** V dátach je stav `active | blocked`, v
rozhraní **aktívny / neaktívny** a tlačidlo je „Aktivovať“ / „Deaktivovať“.
Deaktivovaný účet sa neprihlási (`attachUser` mu zruší session), ale zostáva aj
s históriou zmien — je to prevádzkový úkon, nie trest.

**Práva sa nezobrazujú neaktívne.** Sidebar aj akcie filtruje rola; položka, na
ktorú používateľ nemá právo, tam jednoducho nie je.

**Badge ukazujú prácu, ktorá čaká**, nie celkové počty. Nula = žiadny badge.

## Čo chýba a prečo

Tieto veci nie sú odložené z lenivosti — bez rozhodnutia v backende (§12
zadania) by boli len atrapou:

| Chýba | Blokuje to |
| --- | --- |
| Žiadosť o moderovanie a jej schválenie | tlačidlo „Požiadať o moderovanie“ pri cudzej kauze, fronta žiadostí u admina |
| Dotaz na revízie podľa obdobia | blok „Posledný pohyb“ na dashboarde |
| Metrika „kauzy bez pohybu 60+ dní“ a podiel úradných zdrojov | dve dlaždice na dashboarde |
| Endpoint pre `needs_info` | štvrtá akcia pri podnete |
| Obrazovka zlúčenia osôb, editácia subjektu | API existuje, obrazovky nie |
| Editor prepojenia (ukončenie k dátumu) | dnes sa prepojenie pridáva a maže; `PATCH /api/admin/links/:id` čaká |
| Mazanie kauzy a účtu | dnes existuje len skrytie a deaktivovanie účtu |
| Zistenia z parsovania, porovnanie zmeneného zdroja | matcher (worker, krok 3) |

Hotové z pôvodného zoznamu medzier: rola `superadmin`, priradenie moderátora ku
kauze (a s ním filter „len moje kauzy“ aj stĺpec v zozname), profil
registrovaného používateľa s odbermi a marketingovým súhlasom, profil
administrátora s jeho aktivitou z auditu, úprava profilu, roly a stavu cudzieho
účtu podľa vlastnej roly, číselníky súdov, tagov káuz, kategórií udalostí
a typov prepojení — vrátane počtu použití a súdov zapísaných mimo číselníka.

Číselník **nadradenej položky** (hierarchia súdov zo zadania §9) nie je: nič ju
dnes nezobrazuje ani podľa nej nefiltruje, a pole, ktoré nikto nečíta, je len
ďalšia vec na udržiavanie. Pribudne s obrazovkou, ktorá ju použije.

Každé z týchto miest v rozhraní **hovorí, čo chýba a prečo** — prázdny rámik by
vyzeral ako chyba.

## Čo si vyžiadala táto obrazovka od backendu

Doplnené počas implementácie, lebo bez toho sa admin zoznam nedá postaviť:

- `GET /api/admin/cases`, `/admin/persons`, `/admin/orgs` — zoznamy vrátane
  konceptov a skrytých záznamov (verejné `/api/cases` vracia len publikované),
- `GET /api/admin/search` — globálne hľadanie, ktoré vidí aj nepublikované,
- index `entities` prestal preskakovať `publish_state: hidden`. Skrytie nemá byť
  zároveň zmiznutie — verejné dotazy filtrujú `publish_state:"published"`, takže
  von sa skryté nedostane, ale moderátor ich nájde.
- `publish_state` sa indexuje s `facet: true` kvôli počtom vo filtroch.

## Prihlásenie

Používateľ s rolou `user` sa do administrácie neprihlási — dostane vysvetlenie a
odkaz späť na verejnú časť, nie hlášku o zlom hesle.

Prvý admin sa zakladá ručne (registrácia cez API vytvára vždy len `user`, potom
sa rola prepíše priamo v CouchDB) — postup je v `packages/api/README.md`.

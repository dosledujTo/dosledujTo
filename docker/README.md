# Docker — pm2 kontajnery

Jeden image, viac kontajnerov. Čo ktorý spustí, určuje **ecosystem config**
v `command`, nie iný build.

```
docker/
  app/Dockerfile              image nad keymetrics/pm2 — iba závislosti a pm2
  ecosystem/
    api-admin.config.cjs      REST API + admin SPA
    workers.config.cjs        crawler (a ďalší workeri, keď budú)
    heartbeat.js              drží pm2-runtime otvorený v cronovom kontajneri
  docker-compose.yml
  .env.example
```

Sieť je spoločná a volá sa **`network_dosledujto`**. Neskoršia CouchDB compose sa
do nej pripojí ako externá.

CouchDB ani nginx tu zatiaľ **nie sú** — pribudnú s vlastnými profilmi. Kontajnery
sa na CouchDB pripájajú cez `COUCH_URL`.

## Spustenie

```bash
cd docker
cp .env.example .env          # a uprav COUCH_PASSWORD
docker compose build
```

Služby majú profily, takže si vyberáš, čo naštartuje:

```bash
docker compose --profile app up -d                    # len API + admin
docker compose --profile workers up -d                # len workeri
docker compose --profile app --profile workers up -d  # oboje
```

**Bez profilu sa nespustí nič.** Je to zámer — `docker compose up -d` nemá
uhádnuť, čo chceš. Ak ťa to otravuje, nastav v `docker/.env`:

```
COMPOSE_PROFILES=app,workers
```

potom stačí `docker compose up -d`.

Z koreňa repozitára:

```bash
npm run docker:build
npm run docker:up            # app + workers
npm run docker:up:app        # len API
npm run docker:up:workers    # len workeri
npm run docker:logs
npm run docker:down
```

## Aktualizácia kódu — bez rebuildu

Zdrojáky **nie sú v image**, repozitár je namountovaný z hosta na `/app`.
Aktualizácia je preto:

```bash
git pull
docker compose exec pm2-api-admin pm2 reload all
```

alebo `npm run docker:reload`.

Zmena admin SPA potrebuje ešte build (statické súbory, nie proces):

```bash
npm run admin:build                                     # na hoste
docker compose exec pm2-api-admin npm run admin:build   # alebo v kontajneri
```

Reload pri tom netreba — Express servíruje `dist` z disku a ten je zdieľaný.

**Pozor na `pm2 reload` vo fork móde:** API beží ako jedna inštancia vo fork
móde, takže `reload` je v skutočnosti reštart s krátkym výpadkom, nie
zero-downtime. Skutočný reload bez výpadku by chcel cluster mód s viacerými
inštanciami — a ten je zatiaľ vylúčený, lebo rate limiting beží v pamäti procesu.

### Kedy treba rebuild

Len pri zmene závislostí (`package.json`, `package-lock.json`). Vtedy sa musí
zahodiť aj volume so závislosťami, inak v ňom zostane starý obsah:

```bash
docker compose down
docker volume rm dosledujto_node_modules
docker compose build
docker compose --profile app --profile workers up -d
```

Rýchlejšia cesta bez rebuildu, keď len pribudol balík:

```bash
npm run docker:deps        # docker compose run --rm pm2-api-admin npm ci
```

## pm2 v kontajneri

Kontajner beží pod `pm2-runtime`, ale pm2 démon je ten istý — po prihlásení
funguje celý pm2 tak, ako si zvyknutý:

```bash
docker exec -it pm2-api-admin bash

pm2 list                 # čo beží
pm2 logs                 # všetko naživo
pm2 logs api --lines 200 # jeden proces
pm2 describe api         # detail: reštarty, pamäť, cesty k logom
pm2 monit                # interaktívny monitor
pm2 reload api
pm2 flush                # vyprázdni logy
```

To isté v kontajneri workerov:

```bash
docker exec -it pm2-workers bash
pm2 list                 # heartbeat online, crawler stopped medzi behmi
pm2 logs crawler
pm2 restart crawler      # vynúti beh crawlu mimo cronu
```

Bez prihlásenia:

```bash
docker compose logs -f pm2-api-admin
docker exec pm2-api-admin pm2 logs --nostream --lines 100
```

Logy pm2 sú v pomenovanom volume (`/root/.pm2/logs`), takže prežijú reštart
kontajnera — po páde sa dá pozrieť, čo mu predchádzalo.

## Čo beží v ktorom kontajneri

**`pm2-api-admin`** (profil `app`) — proces `api`. Admin nie je samostatný
proces, je to statický build, ktorý Express servíruje pod `/admin/*` z rovnakej
domény (preto zostáva session cookie first-party a nikde nie je CORS).

Beží **jedna inštancia zámerne**. Rate limiting je v pamäti procesu, takže pri
viacerých inštanciách by limity prestali byť globálne — päť pokusov o prihlásenie
by sa stalo piatimi na inštanciu.

**`pm2-workers`** (profil `workers`) — `crawler` (cez `cron_restart`, predvolene
každých 30 minút) a `heartbeat`.

Heartbeat tam nie je pre parádu: `autorestart: false` znamená, že crawler je
medzi behmi zastavený, a **pm2-runtime sa ukončí, keď nemá ani jeden bežiaci
proces**. Bez heartbeatu by sa kontajner po prvom dobehnutí crawlera reštartoval
v slučke. Zanikne, keď worker dostane vlastný plánovač.

Interval crawlu je `CRAWL_CRON`. Kratší než 30 minút SME nerob — vracia 429 pri
opakovanom čítaní v priebehu minúty.

## Pridanie ďalšieho pm2 kontajnera

1. Nový config v `docker/ecosystem/`, napríklad `imports.config.cjs`.
2. Nová služba v `docker-compose.yml` s vlastným profilom (zakomentovaná ukážka
   je tam).
3. `docker compose --profile imports up -d`

Nový build netreba — image je ten istý.

## Keď API nenaštartuje

**`getaddrinfo EAI_AGAIN <meno-kontajnera>`** — Docker rozlišuje mená
kontajnerov len v rámci **spoločnej siete**. Naše kontajnery sú v
`network_dosledujto`, CouchDB vo svojej. Preto je v compose druhá sieť `couch`
(externá, predvolene `docker-networks_network_couch`), do ktorej sa obe služby
pripájajú.

Over, v ktorých sieťach CouchDB naozaj je:

```bash
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
  couchdb-clouseau-cdb_couchdb-1
```

Predvolená hodnota je `docker-networks_network_couch`. Ak inde vypíše niečo iné, netreba meniť compose, stačí
`COUCH_NETWORK` v `docker/.env`:

```
COUCH_NETWORK=nazov_siete_z_inspectu
```

V `COUCH_URL` používaj **meno služby** (`cdb_couchdb`), nie meno kontajnera
(`couchdb-clouseau-cdb_couchdb-1`) — meno kontajnera sa mení s menom projektu
a pri škálovaní, alias služby nie.

**`databáza "dosledujto_register" neexistuje`** — CouchDB v kontajneri je iná
inštancia než tá na hoste, s vlastnými dátami aj heslom. Design dokumenty a
fixtures do nej treba nasadiť zvlášť, z hosta:

```bash
COUCHMAN_URL=http://admin:HESLO@127.0.0.1:5985 \
  npx couchman push --env=local --create-db --yes
npm run couch:fixtures
```

**`Clouseau nie je dostupný`** — API to kontroluje pri štarte a odmietne
nabehnúť. Prázdne výsledky vyhľadávania vyzerajú ako „taká kauza neexistuje",
a to je odpoveď, ktorú tento produkt nesmie dať omylom.

## Na čo si dať pozor

**`node_modules` sa nemountujú z hosta.** `@node-rs/argon2` je natívny modul —
binárka z hosta nemusí sedieť na architektúru ani libc v kontajneri, a na
serveri `node_modules` na hoste často ani nie sú. Preto je nad bind mountom
pomenovaný volume `node_modules`, ktorý ho na tomto mieste prekryje
závislosťami z image.

**V produkcii (`NODE_ENV=production`) API bez `TURNSTILE_SECRET` a
`IP_HASH_SALT` nenaštartuje.** Je to zámer: bez captchy je každý endpoint na
podnety otvorená cesta na zápis a bez salt-u by sa IP adresy logovali
rozpoznateľne.

**Prázdna premenná = nenastavená premenná.** Compose predáva nenastavené
premenné ako prázdny reťazec; konfigurácia ich odfiltruje pred validáciou.
Bez toho by `COOKIE_SECURE=` znamenalo `false` aj v produkcii.

## Testovacie prostredie

Testy potrebujú CouchDB 3.5 s Clouseau. Rovnakú, akú používa CI, spustíš lokálne:

```bash
export CI_COUCH_PASSWORD=$(openssl rand -hex 18) CI_COUCH_COOKIE=$(openssl rand -hex 18)
docker compose -p dosleduj-dev -f ci/couch.compose.yaml up -d --wait couchdb
docker compose -p dosleduj-dev -f ci/couch.compose.yaml up -d clouseau
docker build -f ci/test.Dockerfile -t dosleduj-test .
docker run --rm --network container:dosleduj-dev-couchdb-1 \
  -e COUCH_URL=http://127.0.0.1:5984 -e COUCH_USER=admin -e COUCH_PASSWORD="$CI_COUCH_PASSWORD" \
  -e COUCH_DB=dosledujto_register dosleduj-test sh ci/test.sh
```

`ci/test.sh` nahrá design dokumenty, prepne alias `search`, nahrá fiktívne
fixtures a spustí `npm test`. Na vývoj proti vlastnej inštancii stačí v `.env`
`COUCH_URL`, `COUCH_USER`, `COUCH_PASSWORD` (`couchman.config.js` ich berie odtiaľ).

## CI (`.github/workflows/ci.yml`)

| Job | Čo robí |
| --- | --- |
| `validate` | `couch:validate` a kontrola, že commitnuté fixtures sú výstup `couch/fixtures/generate.js` |
| `dist` | zostaví web a admin a skončí chybou, ak sa commitnutý `dist` líši od zdrojov — server `dist` nestavia |
| `test` | spustí CouchDB 3.5 + Clouseau (`ci/couch.compose.yaml`, dáta v tmpfs, jednorazové heslo), zostaví `ci/test.Dockerfile` a v sieti CouchDB spustí `ci/test.sh` |

Automatické nasadenie nie je. Server s repozitárom ako git checkout
(`docker/docker-compose.yml`, `docker/.env`) sa aktualizuje ručne:

```bash
bash docker/deploy.sh main
```

Skript urobí `git merge --ff-only` (ručná zmena na serveri nasadenie zastaví,
neprepíše), `npm ci` v kontajneri len pri zmene `package-lock.json`,
`couchman push`, pri novej verzii `search_vN` najprv `warm` a až potom
`promote`, `pm2 reload all` a kontrolu `/api/health`. **Fixtures nespúšťa
nikdy** — sú fiktívne.

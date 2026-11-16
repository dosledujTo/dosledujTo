# nginx — dosleduj.to

```
dosleduj.example         verejný frontend (zatiaľ neexistuje) + /api
admin.dosleduj.example   administrácia (/admin) + /api
```

Súbory sa kopírujú alebo symlinkujú do `user_conf.d` tvojho nginx:

```bash
cp docker/nginx/*.conf /etc/nginx/user_conf.d/
nginx -t && nginx -s reload
```

## Prečo API beží pod oboma doménami

Nie je to duplicita, je to podmienka funkčnosti. Admin je SPA a volá `/api` na
**svojom vlastnom** hostname, takže session cookie zostáva first-party a
`SameSite=Lax` funguje. Keby admin volal `dosleduj.example/api`, bola by to
cross-site požiadavka: cookie by sa neposlala, kým by sa neprerobila na
`SameSite=None; Secure`, a k tomu by pribudlo CORS a s ním celá trieda chýb,
ktorej sa tento návrh zámerne vyhýba (backend-zadanie.md §7).

Cookie je host-only (bez atribútu `Domain`), takže **prihlásenie na admin doméne
je samostatné** od prihlásenia na verejnej. Pre administráciu je to skôr výhoda.

Na verejnej doméne je `/admin` zablokovaný cez `404` — administrácia nemá byť
dostupná dvoma cestami.

## Certifikáty

Configy predpokladajú `jonasal/nginx-certbot` (napovedá tomu `user_conf.d`
a `dhparams`). Ten si certifikáty vypýta sám, ale musí mať splnené:

- **`CERTBOT_EMAIL`** v prostredí kontajnera,
- **A/AAAA záznamy** pre `dosleduj.example` aj `admin.dosleduj.example`
  smerujúce na tento server,
- **port 80 dostupný zvonku** — cez neho beží overenie
  `/.well-known/acme-challenge/`,
- **žiadny vlastný blok na porte 80** pre tieto domény. Image má vlastný
  redirector, ktorý overovaciu cestu obsluhuje; vlastný blok ho prebije
  a certbot certifikát nedostane.

Obidva súbory ukazujú na tú istú cestu `/etc/letsencrypt/live/dosledujto/`,
takže vznikne **jeden certifikát pre obe mená**. To je zámer.

Diagnostika:

```bash
docker logs <nginx-kontajner> 2>&1 | grep -i -A5 certbot
ls -l /etc/letsencrypt/live/            # existuje lineage "dosledujto"?
curl -I http://dosleduj.example/.well-known/acme-challenge/test   # nesmie byť 301
```

Kým certifikát nie je, image beží na dočasnom self-signed — stránka odpovedá,
ale prehliadač na ňu nadáva. To je normálny medzistav, nie chyba configu.

## Čo musí sedieť, inak to nepobeží

**nginx musí vidieť na kontajner.** Upstream je `pm2-api-admin:3000`, čo
predpokladá, že nginx beží v kontajneri pripojenom do siete
`network_dosledujto`:

```bash
docker network connect network_dosledujto <nazov-nginx-kontajnera>
```

Ak nginx beží priamo na hoste, prepni upstream na `127.0.0.1:3000` (kontajner
ten port publikuje).

**`X-Forwarded-Proto` je povinný.** Bez neho Express považuje spojenie za HTTP a
session cookie nedostane `Secure`. API má kvôli tomu `TRUST_PROXY=true` — a to
zároveň znamená, že bez správne nastaveného `X-Forwarded-For` by všetci klienti
vyzerali ako jedna IP a rate limity by boli na nič.

**Certifikát** musí pokrývať obe mená. Cesty v configu (`/etc/letsencrypt/live/
dosledujto/`) uprav podľa toho, ako sa u teba volá certifikát.

## Admin na koreni domény

Aplikácia je zostavená s base `/admin/`, takže na admin doméne beží na
`https://admin.dosleduj.example/admin/` a `/` naň presmeruje. Funguje to hneď a
bez zmeny kódu.

Ak chceš admin priamo na koreni (`https://admin.dosleduj.example/`), je to malá
zmena na troch miestach — `base` vo `packages/admin/vite.config.js`, `basename`
v `packages/admin/src/main.jsx` a mount v `packages/api/src/app.js`. Povedz a
spravím to; nerobil som to sám, lebo by to rozbilo prístup cez port 3000 bez
proxy, ktorý sa hodí na ladenie.

#!/bin/sh
# Testy proti čerstvej CouchDB s Clouseau. Beží v kontajneri z ci/test.Dockerfile
# v sieti CouchDB (`--network container:…`), takže databáza je na 127.0.0.1:5984.
#
#   COUCH_URL, COUCH_USER, COUCH_PASSWORD  — nastaví CI (.github/workflows/ci.yml)
set -eu

echo "čakám na Clouseau…"
i=0
until node -e '
  const u = new URL(process.env.COUCH_URL); u.pathname = "/_search_analyze";
  fetch(u, { method: "POST", headers: { "Content-Type": "application/json",
    Authorization: "Basic " + Buffer.from(process.env.COUCH_USER + ":" + process.env.COUCH_PASSWORD).toString("base64") },
    body: JSON.stringify({ analyzer: "standard", text: "test" }) })
  .then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));'; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "Clouseau nenaštartoval"; exit 1; }; sleep 2
done

# Prvé nasadenie na čistú inštanciu: design dokumenty, alias vyhľadávania a
# testovacie dáta (fiktívne — na produkciu nepatria nikdy).
npx couchman push --env=local --create-db --yes
SEARCH=$(ls couch/databases/dosledujto_register | grep -E '^search_v[0-9]+$' | sort -V | tail -1)
npx couchman warm --env=local --ddoc="$SEARCH"
npx couchman promote "$SEARCH" search --env=local
npx couchman fixtures push --env=local
npx couchman warm --env=local

npm test

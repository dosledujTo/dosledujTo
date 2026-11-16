#!/usr/bin/env bash
# Nasadenie novej verzie na server s docker/docker-compose.yml (handoff CI/CD).
# Spúšťa sa ručne z koreňa repozitára na serveri:
#
#   bash docker/deploy.sh [vetva]
#
# Kroky:
#   1. git pull --ff-only (žiadny force — ručná zmena na serveri pipeline zastaví,
#      nie prepíše),
#   2. závislosti, len ak sa zmenil package-lock.json,
#   3. design dokumenty (couchman push) a vyhľadávanie: najnovší search_vN sa
#      nahreje a až potom sa prepne alias — starý index slúži, kým sa nový stavia,
#   4. pm2 reload a kontrola /api/health.
#
# Fixtures sa tu nespúšťajú nikdy: sú to fiktívne testovacie dáta.
set -euo pipefail

BRANCH="${1:-main}"
COMPOSE=(docker compose -f docker/docker-compose.yml)
RUN=("${COMPOSE[@]}" exec -T pm2-api-admin)

before=$(git rev-parse HEAD)
git fetch --quiet origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
after=$(git rev-parse HEAD)
echo "verzia: ${before:0:8} → ${after:0:8}"

if ! git diff --quiet "$before" "$after" -- package.json package-lock.json; then
  echo "zmenili sa závislosti — npm ci v kontajneri"
  "${COMPOSE[@]}" run --rm --no-deps pm2-api-admin npm ci --no-audit --no-fund
fi

echo "design dokumenty"
"${RUN[@]}" npx couchman push --env=local --yes

SEARCH=$(ls couch/databases/dosledujto_register | grep -E '^search_v[0-9]+$' | sort -V | tail -1)
CURRENT=$("${RUN[@]}" node -e '
  import("./packages/shared/src/couch.js").then(async (c) => { console.log(await c.resolveDdoc("search")); process.exit(0); })
    .catch(() => { console.log(""); process.exit(0); });' 2>/dev/null | tail -1)
if [ "$CURRENT" != "$SEARCH" ]; then
  echo "vyhľadávanie: $CURRENT → $SEARCH (warm, potom promote)"
  "${RUN[@]}" npx couchman warm --env=local --ddoc="$SEARCH"
  "${RUN[@]}" npx couchman promote "$SEARCH" search --env=local
fi

echo "reload"
"${RUN[@]}" pm2 reload all
for i in $(seq 1 30); do
  if "${RUN[@]}" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "API beží (${after:0:8})"
    exit 0
  fi
  sleep 2
done
echo "API po reloade neodpovedá — pozri: docker compose -f docker/docker-compose.yml logs pm2-api-admin" >&2
exit 1

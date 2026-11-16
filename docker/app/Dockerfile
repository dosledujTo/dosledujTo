# Image obsahuje **iba závislosti a pm2**. Zdrojáky sa nekopírujú — mountujú sa
# z hosta (viď `docker-compose.yml`).
#
# Dôsledok, kvôli ktorému to takto je: aktualizácia kódu = `git pull` na hoste
# a `pm2 reload` v kontajneri. Žiadny rebuild.
#
# Rebuild treba len vtedy, keď sa zmenia závislosti (`package.json` /
# `package-lock.json`) — vtedy aj zmazať volume `node_modules`, inak zostane
# starý obsah.

FROM keymetrics/pm2:24-slim

WORKDIR /app

# `procps` kvôli `ps`: pm2 ho volá pri zastavovaní procesov a v `pm2 monit`.
# Bez neho image funguje, ale v logu sa objaví `spawn ps ENOENT` a niektoré
# pm2 príkazy sú okresané.
RUN apt-get update \
    && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*

# Aj dev závislosti: v tomto režime sa v kontajneri buildí admin (vite) a dá sa
# odtiaľ spustiť couchman aj testy. Image je väčší, ale je to vývojový obraz,
# nie odtlačok nasadenia.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# `/app` prekryje bind mount z hosta. `node_modules` sa spod neho vyníma
# pomenovaným volume, aby v kontajneri zostali linuxové závislosti — natívny
# `@node-rs/argon2` skompilovaný na macOS by tu spadol.

CMD ["pm2-runtime", "start", "docker/ecosystem/api-admin.config.cjs"]

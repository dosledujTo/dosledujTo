# Obraz pre testy v CI: zdrojáky + závislosti. Kopíruje sa, nemountuje — runner
# s pripojeným docker.sock nevidí cesty z job kontajnera ako cesty na hoste.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

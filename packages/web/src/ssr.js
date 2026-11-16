// Express strana SSR: nájdi rout, načítaj dáta cez API, vykresli React
// a pošli hotové HTML aj s dátami pre hydratáciu.
//
// Server tu **nerenderuje HTML ručne** — skladá ho ten istý strom komponentov,
// ktorý potom beží v prehliadači. Šablóna nižšie je len obal: `<head>`, koreň
// a dva skripty.

import express from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(DIR, "../dist");
const CLIENT = path.join(DIST, "client");
const PUBLIC = path.resolve(DIR, "../public");

// API volania urobené počas vykreslenia jednej stránky (`api.js` ich sem
// zapisuje). Idú so stránkou do prehliadača ako `__API__`, aby prvá
// navigácia — iná záložka, iné obdobie — nesťahovala znova to, čo už stránka má.
// Cez globalThis, lebo `api.js` je v zostavenom SSR balíku, nie v tomto module.
const apiCalls = (globalThis.__dosledujApiCalls ??= new AsyncLocalStorage());

/** Escapovanie do <script> — dáta obsahujú citované cudzie texty. */
function serialize(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    // U+2028 a U+2029 sú v JSON platné, v JavaScripte to boli roky zalomenia
    // riadku — bez escapovania rozbijú <script> na stránke.
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Zoznam assetov z Vite manifestu — hashované mená sa menia pri každom builde,
 * takže sa nedajú napísať natvrdo.
 */
function readAssets() {
  const manifestPath = path.join(CLIENT, ".vite", "manifest.json");
  if (!existsSync(manifestPath)) return null;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = manifest["src/entry-client.jsx"] ?? Object.values(manifest).find((e) => e.isEntry);
  return {
    script: `/${entry.file}`,
    styles: (entry.css ?? []).map((file) => `/${file}`),
  };
}

/**
 * @param {import("express").Express} app
 * @param {{ logger: any, publicUrl?: string }} deps
 *   `publicUrl` — z konfigurácie (`PUBLIC_URL`). `og:image` musí byť absolútna
 *   adresa a z hlavičky Host sa skladať nesmie: stránka sa cachuje a podvrhnutý
 *   Host by sa dostal do cache. Bez `publicUrl` sa `og:image` nevypíše.
 */
export async function serveWeb(app, { logger, publicUrl }) {
  const assets = readAssets();
  const serverEntry = path.join(DIST, "server", "entry-server.js");

  if (!assets || !existsSync(serverEntry)) {
    app.get(/^\/(?!api|admin).*/, (req, res) => {
      res.status(503).type("text/plain").send(
        "Verejný web nie je zostavený.\nSpusti: npm run web:build\n",
      );
    });
    logger.warn("verejný web nie je zostavený — spusti `npm run web:build`");
    return;
  }

  const { render, matchRoute, NO_FLASH_SCRIPT } = await import(serverEntry);

  // Hashované assety sú nemenné, písma tiež. `public/` obsahuje fonts.css.
  app.use("/assets", express.static(CLIENT + "/assets", { immutable: true, maxAge: "1y" }));
  app.use("/assets", express.static(PUBLIC, { maxAge: "30d" }));

  app.get(/^\/(?!api\/|admin(\/|$)|assets\/).*/, async (req, res, next) => {
    const url = req.originalUrl;
    const { route, params } = matchRoute(req.path);
    const query = { ...req.query };

    let data;
    let status = 200;
    let rendered = route;
    let dataPath = url;
    /** @type {Map<string, unknown>} */
    const calls = new Map();
    try {
      data = await apiCalls.run(calls, () => route.load({ params, query }));
    } catch (error) {
      if (error?.status === 404) {
        // Neexistujúca kauza či osoba: stránka „nenájdené" s jej vlastnými
        // metadátami — meta pôvodnej routy by siahala na dáta, ktoré nie sú.
        const fallback = matchRoute("/__notfound__");
        rendered = fallback.route;
        dataPath = "/__notfound__";
        data = await fallback.route.load({ params: {}, query: {} });
        status = 404;
      } else {
        return next(error);
      }
    }

    const meta = rendered.meta?.({ data, params }) ?? {};
    if (meta.status) status = meta.status;

    let body;
    try {
      // Pri 404 patria dáta stránke „nenájdené"; App ich podľa toho aj vykreslí.
      body = render(url, data, dataPath);
    } catch (error) {
      return next(error);
    }

    const nonce = res.locals.cspNonce ?? "";

    const head = [
      `<title>${escapeAttr(meta.title ?? "Dosleduj.to")}</title>`,
      meta.description && `<meta name="description" content="${escapeAttr(meta.description)}">`,
      meta.canonical && `<link rel="canonical" href="${escapeAttr(meta.canonical)}">`,
      meta.noindex && `<meta name="robots" content="noindex, nofollow">`,
      `<meta property="og:title" content="${escapeAttr(meta.title ?? "Dosleduj.to")}">`,
      meta.description && `<meta property="og:description" content="${escapeAttr(meta.description)}">`,
      `<link rel="stylesheet" href="/assets/fonts.css">`,
      ...assets.styles.map((href) => `<link rel="stylesheet" href="${href}">`),
      // Beží pred prvým paintom, inak by na tmavom režime bliklo biele pozadie.
      `<script nonce="${nonce}">${NO_FLASH_SCRIPT}</script>`,
      `<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">`,
      `<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">`,
      publicUrl && `<meta property="og:image" content="${escapeAttr(`${publicUrl}/assets/og-image.png`)}">`,
      publicUrl && `<meta property="og:image:width" content="1200">`,
      publicUrl && `<meta property="og:image:height" content="630">`,
      publicUrl && `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="theme-color" content="#f4f3f1" media="(prefers-color-scheme: light)">`,
      `<meta name="theme-color" content="#121110" media="(prefers-color-scheme: dark)">`,
    ].filter(Boolean).join("\n");

    res
      .status(status)
      .type("html")
      .set("Cache-Control", status === 200 ? "public, max-age=60, stale-while-revalidate=300" : "no-store")
      .send(`<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
<div id="root">${body}</div>
<script nonce="${nonce}">window.__DATA__=${serialize(data)};window.__PATH__=${serialize(dataPath)};window.__API__=${serialize(status === 200 ? Object.fromEntries(calls) : {})}</script>
<script type="module" src="${assets.script}"></script>
</body>
</html>`);
  });
}

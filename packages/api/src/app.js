import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../../shared/src/config.js";
import { logger } from "../../shared/src/logger.js";
import { api } from "./routes/index.js";
import { serveWeb } from "../../web/src/ssr.js";
import { attachUser } from "./middleware/auth.js";
import { requireCsrf } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";

const ADMIN_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../admin/dist",
);

/**
 * Administrácia je SPA a servíruje sa z **rovnakej domény** ako API pod
 * `/admin/*`. Session cookie tak zostáva first-party a CORS sa nikde
 * nekonfiguruje (admin-zadanie.md §1).
 *
 * Ak build neexistuje, `/admin` to povie priamo — prázdna 404 by vyzerala ako
 * chyba servera, nie ako „zabudol si spustiť build".
 *
 * @param {import("express").Express} app
 */
function serveAdmin(app) {
  if (!existsSync(path.join(ADMIN_DIST, "index.html"))) {
    app.get("/admin{/*path}", (req, res) => {
      res.status(503).type("text/plain").send(
        "Administrácia nie je zostavená.\nSpusti: npm run admin:build\n",
      );
    });
    return;
  }

  // Hashované assety sa smú cachovať dlho, index.html nikdy — inak by prehliadač
  // po nasadení servíroval starú aplikáciu proti novému API.
  app.use(
    "/admin/assets",
    express.static(path.join(ADMIN_DIST, "assets"), { immutable: true, maxAge: "1y" }),
  );
  app.use("/admin", express.static(ADMIN_DIST, { index: false, maxAge: 0 }));

  // Client-side routy: čokoľvek pod /admin vráti index.html.
  app.get("/admin{/*path}", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(ADMIN_DIST, "index.html"));
  });
}

export async function createApp() {
  const app = express();

  // The API sits behind a reverse proxy under the same domain as the frontend.
  // Without this, every client shares one IP and the rate limits are useless.
  if (config.TRUST_PROXY) app.set("trust proxy", true);
  app.disable("x-powered-by");

  // Nonce pre inline skripty verejného webu (no-flash téma a serializované
  // dáta pre hydratáciu). Alternatívou by bolo `'unsafe-inline'`, čo by CSP
  // pre skripty prakticky vyplo — nonce ju necháva v platnosti.
  app.use((req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString("base64");
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Turnstile (formulár podnetu) načítava skript a iframe od Cloudflare.
          scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, "https://challenges.cloudflare.com"],
          frameSrc: ["https://challenges.cloudflare.com"],
        },
      },
    }),
  );
  // No CORS on purpose: frontend and API are same-origin, so a cross-origin
  // request is not a case we need to support (backend-zadanie.md §7, §9).

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers["x-request-id"] ?? randomUUID(),
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );

  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  app.use(attachUser);
  app.use(requireCsrf);

  app.use("/api", api);
  serveAdmin(app);

  // Verejný web je posledný: `/api` aj `/admin` majú prednosť, zvyšok domény
  // patrí jemu. Na admin doméne ho nginx nikdy nevystaví — presmeruje na
  // `/admin/` — takže tá istá aplikácia obslúži obe domény bez vetvenia.
  await serveWeb(app, { logger, publicUrl: config.PUBLIC_URL });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

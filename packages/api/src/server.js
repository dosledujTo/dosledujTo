import { createApp } from "./app.js";
import { config, configWarnings, sanitizeUrl } from "../../shared/src/config.js";
import { logger } from "../../shared/src/logger.js";
import { checkConnection } from "../../shared/src/couch.js";

// Čo si proces naozaj načítal. Bez tohto sa chýbajúca premenná prejaví až ako
// nezrozumiteľné „ECONNREFUSED 127.0.0.1" — a človek hľadá chybu v sieti, hoci
// ide o konfiguráciu, ktorá k procesu nedorazila.
for (const warning of configWarnings) logger.warn(warning);

logger.info(
  {
    env: config.NODE_ENV,
    port: config.PORT,
    couch: sanitizeUrl(config.COUCH_URL),
    db: config.COUCH_DB,
    couch_user: config.COUCH_USER ?? "(bez prihlásenia)",
  },
  "načítaná konfigurácia",
);

// Fail fast, and fail loudly. An API that starts without Clouseau would answer
// every search with an empty result set, which looks exactly like "no such
// case" — the one answer this product must never give by accident.
try {
  const status = await checkConnection();
  logger.info(status, "CouchDB a Clouseau sú dostupné");
} catch (err) {
  logger.fatal({ err: err.message }, "štart zrušený");
  process.exit(1);
}

const app = await createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "API beží");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    logger.info({ signal }, "ukončujem");
    server.close(() => process.exit(0));
  });
}

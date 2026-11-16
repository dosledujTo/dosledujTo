import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import { config } from "../../../../shared/src/config.js";

export const health = Router();

// Reports what the API depends on, not just that the process is up: an API that
// answers 200 while Clouseau is down would report health it does not have.
health.get("/", async (req, res) => {
  try {
    const status = await couch.checkConnection();
    res.json({ status: "ok", db: status.db, couchdb: status.couchdb, env: config.NODE_ENV });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: err.message });
  }
});

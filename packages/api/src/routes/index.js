import { Router } from "express";

import { health } from "./public/health.js";
import { searchRoutes } from "./public/search.js";
import { cases } from "./public/cases.js";
import { persons } from "./public/persons.js";
import { orgs } from "./public/orgs.js";
import { suggestions } from "./public/suggestions.js";
import { auth, profile } from "./public/auth.js";
import { subscriptions, notifications } from "./public/subscriptions.js";
import { stats, events } from "./public/stats.js";
import { config as appConfig } from "../../../shared/src/config.js";

import { adminModeration } from "./admin/moderation.js";
import { adminCases } from "./admin/cases.js";
import { adminEvents, adminProceedings, adminRoles } from "./admin/children.js";
import { adminPersons, adminOrgs, adminLinks } from "./admin/persons.js";
import { adminArticles } from "./admin/articles.js";
import { adminRevisions } from "./admin/revisions.js";
import { adminUsers, adminFeeds } from "./admin/users.js";
import { adminCodelists } from "./admin/codelists.js";

import { requireRole } from "../middleware/auth.js";

// Route names are English even though the content is Slovak (backend-zadanie.md §4).
export const api = Router();

api.use("/health", health);
// Verejná konfigurácia pre web — len to, čo je verejné z povahy veci.
api.get("/public-config", (req, res) => {
  res.json({ turnstile_site_key: appConfig.TURNSTILE_SITE_KEY ?? null });
});
api.use("/search", searchRoutes);
api.use("/stats", stats);
api.use("/events", events);
api.use("/cases", cases);
api.use("/persons", persons);
api.use("/orgs", orgs);
api.use("/auth", auth);
api.use("/profile", profile);
api.use("/subscriptions", subscriptions);
api.use("/notifications", notifications);

// Owns `/cases/:id/suggestions`, `/persons/:id/suggestions` and `/suggestions`,
// so it is mounted at the root of the API. The GET routers above do not claim
// those POSTs, and Express falls through to here.
api.use("/", suggestions);

const admin = Router();

// One gate for the whole administrative surface. It stays in the same Express
// app: a separate port buys nothing here, and a reverse proxy can restrict
// `/api/admin` when it matters (backend-zadanie.md §4).
admin.use(requireRole("moderator"));

admin.use("/", adminModeration);
admin.use("/cases", adminCases);
admin.use("/events", adminEvents);
admin.use("/proceedings", adminProceedings);
admin.use("/roles", adminRoles);
admin.use("/persons", adminPersons);
admin.use("/orgs", adminOrgs);
admin.use("/links", adminLinks);
admin.use("/articles", adminArticles);
admin.use("/revisions", adminRevisions);
admin.use("/codelists", adminCodelists);
admin.use("/users", adminUsers);
admin.use("/feeds", adminFeeds);

api.use("/admin", admin);

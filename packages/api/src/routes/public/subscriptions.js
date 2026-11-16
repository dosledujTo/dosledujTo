// Watching a case is the answer to the problem the product exists for: a case
// does not disappear just because nobody writes about it (produktové zadanie §4.3).

import { Router } from "express";
import { z } from "zod";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { conflict, forbidden, notFound } from "../../../../shared/src/index.js";
import * as validate from "../../middleware/validate.js";
import { requireAuth, actorOf } from "../../middleware/auth.js";
import { nameMap } from "../../lib/hydrate.js";

export const subscriptions = Router();

subscriptions.use(requireAuth);

subscriptions.get("/", async (req, res) => {
  const docs = await queries.subscriptionsOfUser(req.user._id);
  const names = await nameMap(docs.map((d) => d.target_id));

  res.json({
    items: docs.map((d) => ({
      id: d._id,
      target_type: d.target_type,
      target_id: d.target_id,
      target: names[d.target_id] ?? null,
      frequency: d.frequency,
      level: d.level,
      created_at: d.created_at,
    })),
  });
});

subscriptions.post("/", validate.body(schemas.subscriptionBody), async (req, res) => {
  const target = await couch.get(req.body.target_id);
  if (!target || target.type !== req.body.target_type) throw notFound("sledovaný cieľ");
  if (target.publish_state !== "published") throw notFound("sledovaný cieľ");

  const existing = await queries.subscriptionsOfUser(req.user._id);
  if (existing.some((s) => s.target_id === req.body.target_id)) {
    throw conflict("tento cieľ už sleduješ");
  }

  const doc = await store.createDoc({
    type: "subscription",
    data: {
      user_id: req.user._id,
      target_type: req.body.target_type,
      target_id: req.body.target_id,
      frequency: req.body.frequency,
      level: req.body.level,
    },
    actor: actorOf(req),
    reason: "nový odber",
  });

  res.status(201).json({ subscription: { id: doc._id, ...req.body } });
});

subscriptions.delete("/:id", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "subscription") throw notFound("odber");
  if (doc.user_id !== req.user._id) throw forbidden("odber patrí inému používateľovi");

  await couch.db.destroy(doc._id, doc._rev);
  res.status(204).end();
});

export const notifications = Router();

notifications.use(requireAuth);

const notificationsQuery = z.object({
  state: z.enum(["pending", "sent", "read"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

notifications.get("/", validate.query(notificationsQuery), async (req, res) => {
  const docs = await queries.notificationsOfUser(req.user._id, {
    state: req.validQuery.state,
    limit: req.validQuery.limit,
  });

  res.json({
    items: docs.map((d) => ({
      id: d._id,
      state: d.state,
      event_ids: d.event_ids ?? [],
      subscription_id: d.subscription_id ?? null,
      sent_at: d.sent_at ?? null,
      created_at: d.created_at,
    })),
    // The notifier is a worker job; until it runs there is nothing to page through.
    next_cursor: null,
  });
});

notifications.post("/:id/read", async (req, res) => {
  const doc = await couch.get(req.params.id);
  if (!doc || doc.type !== "notification") throw notFound("upozornenie");
  if (doc.user_id !== req.user._id) throw forbidden("upozornenie patrí inému používateľovi");

  const updated = await store.updateDoc({
    id: doc._id,
    patch: { state: "read" },
    actor: actorOf(req),
    reason: "prečítané",
  });

  res.json({ id: updated._id, state: updated.state });
});

// The moderation queue. "Automatika navrhuje, človek potvrdzuje" — this is the
// step that keeps the product from being a news aggregator (produktové zadanie §4.5).

import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as queries from "../../../../shared/src/queries.js";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { badRequest, notFound } from "../../../../shared/src/index.js";
import { adminDoc } from "../../../../shared/src/projection.js";
import { isSourced } from "../../../../shared/src/sourced.js";
import * as validate from "../../middleware/validate.js";
import { actorOf } from "../../middleware/auth.js";

export const adminModeration = Router();

adminModeration.get("/summary", async (req, res) => {
  const [pending, bot, coverage] = await Promise.all([
    search.searchSuggestions({ status: "pending", limit: 1 }),
    search.searchSuggestions({ status: "pending", origin: "bot", limit: 1 }),
    queries.coverage(),
  ]);

  const candidates = await search.searchArticles({ status: "candidate", limit: 1 });

  const published = coverage.filter((c) => c.bucket === "published");
  const fields = published.reduce((sum, c) => sum + c.fields, 0);
  const withSource = published.reduce((sum, c) => sum + c.with_source, 0);

  res.json({
    queue: {
      pending: pending.total,
      pending_bot: bot.total,
      unprocessed_articles: candidates.total,
    },
    // Produktové zadanie §9: the share of data with a working source. The goal
    // is 100 %, and the number is only meaningful if it is visible daily.
    coverage: {
      by_type: coverage,
      published_fields: fields,
      published_fields_with_source: withSource,
      ratio: fields === 0 ? null : Number((withSource / fields).toFixed(4)),
    },
  });
});

// Globálne vyhľadávanie v hornom pruhu administrácie. Na rozdiel od verejného
// `/api/search` vidí koncepty aj skryté záznamy — moderátor hľadá práve to, čo
// ešte nie je vonku.
adminModeration.get("/search", validate.query(schemas.searchQuery), async (req, res) => {
  const { q, type, limit } = req.validQuery;

  const [entities, articles] = await Promise.all([
    type === "article"
      ? { items: [], total: 0 }
      : search.searchEntities({ q, type, limit, includeUnpublished: true, sort: "relevance" }),
    type && type !== "article"
      ? { items: [], total: 0 }
      : search.searchArticles({ q, limit, sort: "relevance", includeDocs: true }),
  ]);

  res.json({
    entities: entities.items,
    articles: articles.items.map((a) => ({
      id: a._id ?? a.id,
      title: a.title,
      publisher: a.publisher,
      published_at: a.published_at,
      status: a.status,
    })),
    total: (entities.total ?? 0) + (articles.total ?? 0),
  });
});

adminModeration.get("/suggestions", validate.query(schemas.moderationQuery), async (req, res) => {
  const f = req.validQuery;
  const result = await search.searchSuggestions({
    status: f.status,
    origin: f.origin,
    target_type: f.target_type,
    limit: f.limit,
    cursor: f.cursor,
    counts: ["status", "origin", "target_type"],
    includeDocs: true,
  });

  res.json({
    items: result.items.map(adminDoc),
    next_cursor: result.next_cursor,
    total: result.total,
    facets: result.counts,
  });
});

adminModeration.get("/suggestions/:id", async (req, res) => {
  const doc = await loadSuggestion(req.params.id);
  const target = doc.target?.id ? await couch.get(doc.target.id) : null;
  res.json({ suggestion: adminDoc(doc), target: target ? adminDoc(target) : null });
});

/**
 * Accepting applies the value and records the change against the suggestion, so
 * the audit log says not just what changed but on whose prompting.
 *
 * The moderator may edit the proposal before accepting it — `edited_value`
 * wins over what was submitted.
 */
adminModeration.post(
  "/suggestions/:id/accept",
  validate.body(schemas.suggestionAcceptBody),
  async (req, res) => {
    const doc = await loadSuggestion(req.params.id);
    if (doc.status !== "pending" && doc.status !== "needs_info") {
      throw badRequest(`podnet je už vybavený (${doc.status})`);
    }

    const actor = actorOf(req);
    const value = req.body.edited_value ?? doc.proposed_value;
    let applied = null;

    if (doc.target?.id && doc.target.path && value !== null && value !== undefined) {
      applied = await applyToTarget(doc, value, actor);
    }

    const updated = await store.updateDoc({
      id: doc._id,
      patch: {
        status: "accepted",
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
        review_note: req.body.note ?? null,
      },
      actor,
      reason: "podnet prijatý",
      suggestionId: doc._id,
    });

    res.json({
      suggestion: adminDoc(updated),
      applied: applied ? adminDoc(applied) : null,
      // Accepting a value does not attach a source to it. The submitted URLs
      // have to become `article` documents first, and until then the field
      // cannot be published — by design, not by oversight.
      note: applied
        ? "hodnota bola zapísaná; zdroje z podnetu treba pridať ako article dokumenty"
        : "podnet označený ako prijatý, hodnotu doplní moderátor ručne",
    });
  },
);

adminModeration.post(
  "/suggestions/:id/reject",
  validate.body(schemas.suggestionRejectBody),
  async (req, res) => {
    const doc = await loadSuggestion(req.params.id);
    const actor = actorOf(req);

    const updated = await store.updateDoc({
      id: doc._id,
      patch: {
        status: "rejected",
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
        review_note: req.body.reason,
      },
      actor,
      reason: `podnet zamietnutý: ${req.body.reason}`,
      suggestionId: doc._id,
    });

    res.json({ suggestion: adminDoc(updated) });
  },
);

/**
 * Write the accepted value into the target document.
 *
 * For a sourced field only `value`, `unit` and `disputed` are taken from the
 * proposal: `sources` stay whatever the moderator has verified. A suggestion
 * carries URLs, not article ids, and a URL is not a source until somebody has
 * fetched, dated and attributed it.
 */
async function applyToTarget(suggestion, value, actor) {
  const target = await couch.get(suggestion.target.id);
  if (!target) throw notFound("cieľ podnetu");

  const path = suggestion.target.path;
  const current = target[path];

  const next =
    isSourced(current) || isSourced(value)
      ? {
          ...(isSourced(current) ? current : {}),
          ...(isSourced(value) ? value : { value: value?.value ?? value }),
          sources: isSourced(current) ? current.sources : [],
          asserted_at: new Date().toISOString().slice(0, 10),
        }
      : value;

  return store.updateDoc({
    id: target._id,
    patch: { [path]: next },
    actor,
    reason: `prijatý podnet ${suggestion._id}`,
    suggestionId: suggestion._id,
  });
}

async function loadSuggestion(id) {
  const doc = await couch.get(id);
  if (!doc || doc.type !== "suggestion") throw notFound("podnet");
  return doc;
}

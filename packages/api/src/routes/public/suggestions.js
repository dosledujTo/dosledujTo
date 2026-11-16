// One handler, one validation, three entry points (backend-zadanie.md §5).
// The routes differ only in what they prefill into `target` — a suggestion is
// always made from a page, never into the void.

import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as search from "../../../../shared/src/search.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { notFound } from "../../../../shared/src/index.js";
import { publicSuggestion } from "../../../../shared/src/projection.js";
import * as validate from "../../middleware/validate.js";
import { requireCaptcha } from "../../middleware/captcha.js";
import { suggestionLimiter } from "../../middleware/ratelimit.js";
import { requireAuth, actorOf } from "../../middleware/auth.js";

export const suggestions = Router();

/**
 * @param {import("express").Request} req
 * @param {{ type: string, id: string|null }} target
 */
async function submit(req, target) {
  if (target.id) {
    const doc = await couch.get(target.id);
    if (!doc || doc.type !== target.type) throw notFound("cieľ podnetu");
  }

  const suggestion = await store.createDoc({
    type: "suggestion",
    data: {
      origin: "user",
      author_id: req.user?._id ?? null,
      submitter_email: req.user ? null : (req.body.submitter_email ?? null),
      target: { type: target.type, id: target.id, path: req.body.path ?? null },
      proposed_value: req.body.proposed_value ?? null,
      current_value_snapshot: await snapshot(target, req.body.path),
      source_urls: req.body.source_urls,
      comment: req.body.comment ?? null,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    },
    // Anonymous submissions are the point: "ktokoľvek (aj neprihlásený) môže
    // poslať podnet" (produktové zadanie §4.4).
    actor: actorOf(req),
    reason: "podnet od používateľa",
  });

  return suggestion;
}

/** What the value looked like when the suggestion was made. */
async function snapshot(target, path) {
  if (!target.id || !path) return null;
  const doc = await couch.get(target.id);
  return doc?.[path] ?? null;
}

// The order matters: the captcha token has to be checked before the body
// schema strips it as an unknown field.
const guards = [suggestionLimiter, requireCaptcha, validate.body(schemas.suggestionBody)];

suggestions.post("/cases/:id/suggestions", ...guards, async (req, res) => {
  const doc = await submit(req, { type: "case", id: req.params.id });
  res.status(201).json({ suggestion: publicSuggestion(doc) });
});

suggestions.post("/persons/:id/suggestions", ...guards, async (req, res) => {
  const doc = await submit(req, { type: "person", id: req.params.id });
  res.status(201).json({ suggestion: publicSuggestion(doc) });
});

// Aj firma alebo strana môže mať na profile chybu (handoff „Červená niť" kap. 5.5).
suggestions.post("/orgs/:id/suggestions", ...guards, async (req, res) => {
  const doc = await submit(req, { type: "org", id: req.params.id });
  res.status(201).json({ suggestion: publicSuggestion(doc) });
});

// A proposal for an entity that does not exist yet. `target.id` is null, and
// validate_doc_update then requires a comment saying what is being proposed.
suggestions.post("/suggestions", ...guards, async (req, res) => {
  const doc = await submit(req, { type: "case", id: null });
  res.status(201).json({ suggestion: publicSuggestion(doc) });
});

suggestions.get("/suggestions/mine", requireAuth, async (req, res) => {
  const result = await search.searchSuggestions({
    author_id: req.user._id,
    limit: Number(req.query.limit) || 20,
    cursor: req.query.cursor,
    includeDocs: true,
  });

  res.json({
    items: result.items.map(publicSuggestion),
    next_cursor: result.next_cursor,
    total: result.total,
  });
});

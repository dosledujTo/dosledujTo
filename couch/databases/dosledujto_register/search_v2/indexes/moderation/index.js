// The moderator queue is a search query, not a view (backend-zadanie.md §2.3).
// Sorting by `created_at` and faceting by `origin` / `status` is what makes the
// queue usable once the crawler starts producing bot suggestions in volume.

import { epoch } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (doc.type !== "suggestion") return;

  index("status", doc.status || "pending", { store: true, facet: true });
  index("origin", doc.origin || "user", { store: true, facet: true });

  var target = doc.target || {};
  index("target_type", target.type || "none", { store: true, facet: true });
  if (target.id) index("target_id", target.id, { store: true });
  if (target.path) index("target_path", target.path, { store: true });
  // A suggestion with no target is a proposal for a brand new case or person.
  if (!target.id) index("new_entity", "true", { store: true });

  var created = epoch(doc.created_at);
  if (created !== null) index("created_at", created, { store: true });

  var reviewed = epoch(doc.reviewed_at);
  if (reviewed !== null) index("reviewed_at", reviewed, { store: true });

  // Only bot suggestions carry a confidence. Indexed as a number so the queue
  // can be filtered to what is worth a human's attention first.
  if (typeof doc.confidence === "number") {
    index("confidence", doc.confidence, { store: true, facet: true });
  }

  if (doc.author_id) index("author_id", doc.author_id, { store: false });
  if (doc.reviewed_by) index("reviewed_by", doc.reviewed_by, { store: true });

  var urls = doc.source_urls || [];
  index("source_count", urls.length, { store: true });

  if (doc.comment) index("comment", doc.comment, { store: false });
}

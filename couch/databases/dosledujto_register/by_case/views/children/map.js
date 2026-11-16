// Everything hanging off a case — roles, events, proceedings — in one query.
//
//   ?startkey=["case:018f…"]&endkey=["case:018f…",{}]&include_docs=true
//
// GET /api/cases/:id must use this, not N+1 lookups (backend-zadanie.md §5).
// The second key element groups by child type, the third orders within a group:
// roles by validity, events by date, proceedings by court.

import { epoch } from "../../../../../shared/sourced.js";

export default function (doc) {
  if (!doc.case_id) return;

  if (doc.type === "role") {
    // Open roles (no valid_to) sort last, so the current state is easy to take.
    emit([doc.case_id, "role", doc.valid_from || "", doc.valid_to || "9999"], {
      person_id: doc.person_id || null,
      org_id: doc.org_id || null,
      role: doc.role,
      valid_from: doc.valid_from || null,
      valid_to: doc.valid_to || null,
      current: !doc.valid_to,
      source_count: (doc.sources || []).length,
    });
    return;
  }

  if (doc.type === "event") {
    emit([doc.case_id, "event", doc.kind || "past", epoch(doc.occurred_on) || 0], {
      occurred_on: doc.occurred_on || null,
      kind: doc.kind || "past",
      category: doc.category || "other",
      title: doc.title || null,
      person_ids: doc.person_ids || [],
      proceeding_id: doc.proceeding_id || null,
      source_count: (doc.sources || []).length,
    });
    return;
  }

  if (doc.type === "proceeding") {
    emit([doc.case_id, "proceeding", doc.court || "", doc.file_number || ""], {
      court: doc.court || null,
      file_number: doc.file_number || null,
      phase: doc.phase || null,
      decision_count: (doc.decisions || []).length,
      source_count: (doc.sources || []).length,
    });
  }
}

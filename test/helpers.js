// Integration helpers. The tests run against the real CouchDB with Clouseau —
// the only way to test a search index is to query one (backend-zadanie.md §9).
// Every document a test creates is registered for removal in `afterAll`.

import request from "supertest";
import { createApp } from "../packages/api/src/app.js";
import * as couch from "../packages/shared/src/couch.js";
import * as store from "../packages/shared/src/store.js";
import * as sessions from "../packages/shared/src/sessions.js";
import { newId } from "../packages/shared/src/ids.js";

export const app = await createApp();

/** Documents created by the current test file. */
const created = new Set();

export function track(id) {
  created.add(id);
  return id;
}

export async function cleanup() {
  for (const id of created) {
    // Writes are audited, so a tracked document leaves revisions behind. A test
    // run that grows the database by nine documents is a test run that changes
    // what the next one sees.
    await cleanupRevisions(id);
    const doc = await couch.get(id).catch(() => null);
    if (doc) await couch.db.destroy(doc._id, doc._rev).catch(() => {});
  }
  created.clear();
}

/** Remove every revision written about a document, so runs stay repeatable. */
export async function cleanupRevisions(targetId) {
  const res = await couch.view("revisions", "by_target", {
    startkey: [targetId],
    endkey: [targetId, {}],
  });
  for (const row of res.rows) {
    const doc = await couch.get(row.id).catch(() => null);
    if (doc) await couch.db.destroy(doc._id, doc._rev).catch(() => {});
  }
}

const SYSTEM = { id: "system:test", role: "admin" };

/**
 * A logged-in client with the given role. Returns a function that decorates a
 * supertest request with the session and CSRF headers.
 *
 * @param {"user"|"moderator"|"admin"} role
 */
export async function login(role) {
  const suffix = Math.random().toString(36).slice(2, 10);
  const user = await store.createDoc({
    type: "user",
    data: {
      email: `${role}-${suffix}@example.test`,
      // Never a usable password: these accounts exist to carry a role.
      password_hash: "TEST-PLACEHOLDER-NO-LOGIN",
      display_name: `${role} (test)`,
      role,
      status: "active",
      notification_prefs: { frequency: "daily", level: "all" },
    },
    actor: SYSTEM,
    reason: "testovací používateľ",
  });
  track(user._id);

  const { cookie, session } = await sessions.createSession(user._id, {});
  track(session._id);

  const csrf = "test-csrf-token";
  const cookies = [`sid=${cookie}`, `csrf=${csrf}`].join("; ");

  return {
    user,
    /** @param {import("supertest").Test} req */
    auth: (req) => req.set("Cookie", cookies).set("x-csrf-token", csrf),
  };
}

export { request, couch, store, newId };

// Sessions live in CouchDB (backend-zadanie.md §7). What the browser holds is
// `<session id>.<token>`; what the database holds is the session id and a hash
// of the token. A dump of the session documents therefore cannot be replayed.
//
// The id travels in the cookie so the lookup is a point read by `_id` — no view,
// no scan, and no index that would have to be kept in step with a secret.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as couch from "./couch.js";
import * as store from "./store.js";
import { config } from "./config.js";
import { hashIp } from "./logger.js";

const SYSTEM_ACTOR = { id: "system:api", role: "user" };

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * @param {string} userId
 * @param {{ ip?: string, userAgent?: string }} meta
 * @returns {Promise<{ cookie: string, session: any }>}
 */
export async function createSession(userId, meta = {}) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.SESSION_TTL_DAYS * 86400_000);

  const session = await store.createDoc({
    type: "session",
    data: {
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: expires.toISOString(),
      ip_hash: hashIp(meta.ip),
      user_agent: (meta.userAgent ?? "").slice(0, 200),
      refreshed_at: new Date().toISOString(),
    },
    actor: SYSTEM_ACTOR,
    reason: "prihlásenie",
  });

  return { cookie: `${session._id}.${token}`, session };
}

/**
 * Resolve a cookie to its session, refreshing the expiry at most once an hour.
 *
 * @param {string|undefined} cookie
 * @returns {Promise<any|null>}
 */
export async function readSession(cookie) {
  if (!cookie) return null;
  const dot = cookie.indexOf(".");
  if (dot < 0) return null;

  const id = cookie.slice(0, dot);
  const token = cookie.slice(dot + 1);
  if (!id.startsWith("session:") || !token) return null;

  const session = await couch.get(id);
  if (!session) return null;

  const expected = Buffer.from(session.token_hash ?? "", "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await destroySession(id);
    return null;
  }

  return refreshIfStale(session);
}

/**
 * Rolling expiry, but not on every request: a write per request would turn
 * CouchDB into a very slow Redis.
 */
async function refreshIfStale(session) {
  const last = new Date(session.refreshed_at ?? session.created_at).getTime();
  if (Date.now() - last < config.SESSION_REFRESH_MIN * 60_000) return session;

  const expires = new Date(Date.now() + config.SESSION_TTL_DAYS * 86400_000);
  try {
    return await store.updateDoc({
      id: session._id,
      patch: {
        expires_at: expires.toISOString(),
        refreshed_at: new Date().toISOString(),
      },
      actor: SYSTEM_ACTOR,
      reason: "predĺženie session",
    });
  } catch {
    // A racing refresh from a parallel request is harmless — the session is
    // valid either way.
    return session;
  }
}

/** @param {string} sessionId */
export async function destroySession(sessionId) {
  const session = await couch.get(sessionId);
  if (!session) return;
  await couch.db.destroy(session._id, session._rev).catch(() => {});
}

/** @param {string|undefined} cookie */
export function sessionIdFromCookie(cookie) {
  if (!cookie) return null;
  const dot = cookie.indexOf(".");
  return dot > 0 ? cookie.slice(0, dot) : null;
}

/**
 * Cookie attributes. First-party under the same domain behind a reverse proxy:
 * no CORS, no `SameSite=None`, no domain attribute (backend-zadanie.md §7).
 */
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: config.SESSION_TTL_DAYS * 86400_000,
  };
}

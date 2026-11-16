// Fixed-window rate limiting, in memory.
//
// In-process state is the honest choice for the MVP: one API process, no Redis
// in the stack, and CouchDB is the wrong tool for a counter that changes on
// every request. It follows that limits are per process — when the API is
// scaled out, this has to move to shared state, and the limits below become
// per-instance until it does.

import { rateLimited } from "../../../shared/src/index.js";
import { hashIp } from "../../../shared/src/logger.js";

const buckets = new Map();

/** Drop expired windows so a long-running process does not grow without bound. */
function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

let lastSweep = Date.now();

/**
 * @param {object} opts
 * @param {number} opts.max          Requests per window.
 * @param {number} opts.windowMs
 * @param {(req: any) => string} opts.key
 * @param {string} [opts.message]
 */
export function rateLimit({ max, windowMs, key, message }) {
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep > 60_000) {
      sweep(now);
      lastSweep = now;
    }

    const id = key(req);
    const bucket = buckets.get(id);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      throw rateLimited(message ?? `priveľa požiadaviek, skús o ${retryAfter} s`);
    }
    next();
  };
}

/** Hashed, because a raw IP in process memory is still personal data. */
export function ipKey(req) {
  return hashIp(req.ip) ?? "unknown";
}

// The three limits named in backend-zadanie.md §7.
export const loginLimiter = rateLimit({
  max: 5,
  windowMs: 15 * 60_000,
  key: (req) => `login:${ipKey(req)}:${String(req.body?.email ?? "").toLowerCase()}`,
  message: "priveľa pokusov o prihlásenie, skús to o pár minút",
});

export const registerLimiter = rateLimit({
  max: 3,
  windowMs: 60 * 60_000,
  key: (req) => `register:${ipKey(req)}`,
});

export const suggestionLimiter = rateLimit({
  max: 10,
  windowMs: 60 * 60_000,
  key: (req) => `suggestion:${ipKey(req)}`,
  message: "priveľa podnetov z jednej adresy, skús to neskôr",
});

/** Test helper — the counters are process state. */
export function resetLimits() {
  buckets.clear();
}

import pino from "pino";
import { createHash } from "node:crypto";
import { config } from "./config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  // No PII in production logs (backend-zadanie.md §9). IPs are hashed at the
  // edge, but redaction is the backstop for everything else.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.body.password",
      "req.body.password_hash",
      "*.password",
      "*.password_hash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});

/**
 * An IP address is personal data. What we need is a stable key for rate
 * limiting and session forensics, which a salted hash gives us.
 *
 * @param {string|undefined} ip
 */
export function hashIp(ip) {
  if (!ip) return null;
  return createHash("sha256").update(config.IP_HASH_SALT).update(ip).digest("hex").slice(0, 32);
}

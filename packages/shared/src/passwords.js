// argon2id, never bcrypt at default cost (backend-zadanie.md §7).

import { hash as argonHash, verify as argonVerify, Algorithm } from "@node-rs/argon2";

/** OWASP's second recommended argon2id profile: 19 MiB, 2 passes, 1 lane. */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * @param {string} password
 * @returns {Promise<string>} PHC-format hash.
 */
export function hashPassword(password) {
  return argonHash(password, OPTIONS);
}

/**
 * @param {string|undefined} hash
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, password) {
  if (!hash) return false;
  try {
    return await argonVerify(hash, password, OPTIONS);
  } catch {
    // A malformed hash — a fixture placeholder, for instance — is a failed
    // verification, not an exception that reveals which accounts are seeded.
    return false;
  }
}

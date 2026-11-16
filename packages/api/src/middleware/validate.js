import { badRequest } from "../../../shared/src/index.js";

function fail(result) {
  throw badRequest(
    "neplatný vstup",
    result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

/**
 * Validate `req.body` and replace it with the parsed value.
 * @param {import("zod").ZodTypeAny} schema
 */
export function body(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) fail(result);
    req.body = result.data;
    next();
  };
}

/**
 * Validate `req.query`. Unknown parameters are dropped rather than rejected:
 * the point of the whitelist is that nothing unexpected reaches the query
 * builder, not that a stray `utm_source` breaks a link (backend-zadanie.md §3).
 *
 * @param {import("zod").ZodTypeAny} schema
 */
export function query(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) fail(result);
    req.validQuery = result.data;
    next();
  };
}

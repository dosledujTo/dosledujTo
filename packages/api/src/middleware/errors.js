import { AppError, badRequest } from "../../../shared/src/index.js";
import { logger } from "../../../shared/src/logger.js";

/** 404 for anything the router did not claim. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `neznámy endpoint ${req.method} ${req.path}` },
  });
}

/**
 * The single error responder. Express 5 forwards rejected promises here, so
 * route handlers do not need a try/catch around every await.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies this by arity.
export function errorHandler(err, req, res, next) {
  const error = normalise(err);

  if (error.status >= 500) {
    logger.error({ err, request_id: req.id }, "neošetrená chyba");
  } else {
    logger.debug({ code: error.code, message: error.message, request_id: req.id }, "chyba požiadavky");
  }

  res.status(error.status).json({
    error: {
      code: error.code,
      message:
        error.status >= 500 ? "interná chyba servera" : error.message,
      details: error.details,
    },
  });
}

function normalise(err) {
  if (err instanceof AppError) return err;

  // zod, when a schema is used outside the validate middleware
  if (err?.issues) {
    return badRequest(
      "neplatný vstup",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  // express.json() on a malformed body
  if (err?.type === "entity.parse.failed") return badRequest("telo požiadavky nie je platný JSON");
  if (err?.type === "entity.too.large") return badRequest("telo požiadavky je príliš veľké");

  return new AppError("INTERNAL", err?.message ?? "neznáma chyba");
}

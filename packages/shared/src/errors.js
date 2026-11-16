// One error shape for the whole API (backend-zadanie.md §4):
//   { "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [...] } }

export const CODES = {
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  /**
   * @param {keyof CODES} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = CODES[code] ?? 500;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new AppError("VALIDATION_FAILED", message, details);
export const unauthenticated = (message = "prihlásenie je potrebné") =>
  new AppError("UNAUTHENTICATED", message);
export const forbidden = (message = "nedostatočné oprávnenie") =>
  new AppError("FORBIDDEN", message);
export const notFound = (what = "dokument") => new AppError("NOT_FOUND", `${what} neexistuje`);
export const conflict = (message, details) => new AppError("CONFLICT", message, details);
export const rateLimited = (message = "priveľa požiadaviek") =>
  new AppError("RATE_LIMITED", message);

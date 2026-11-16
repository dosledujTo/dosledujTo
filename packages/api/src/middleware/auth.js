import * as couch from "../../../shared/src/couch.js";
import * as sessions from "../../../shared/src/sessions.js";
import { forbidden, unauthenticated } from "../../../shared/src/index.js";

/**
 * Roles are cumulative: superadmin ⊃ admin ⊃ moderator ⊃ user
 * (backend-zadanie.md §7, admin-zadanie.md §2).
 *
 * `superadmin` zatiaľ **neotvára nič navyše** — žiadny endpoint na ňu nie je
 * naviazaný. Ktoré akcie majú byť výhradne jej (mazanie kauzy, revert revízie,
 * správa admin účtov a feedov) je rozhodnutie zo zoznamu v admin-zadanie.md §12
 * a patrí do samostatnej zmeny, nie do založenia účtu.
 */
const RANK = { user: 1, moderator: 2, admin: 3, superadmin: 4 };

export const SESSION_COOKIE = "sid";

/**
 * Resolve the session cookie to a user. Never rejects: endpoints that do not
 * need a user (a suggestion from an anonymous visitor) still want to know who
 * is calling when somebody is logged in.
 */
export async function attachUser(req, res, next) {
  req.user = null;
  req.session = null;

  const cookie = req.cookies?.[SESSION_COOKIE];
  if (!cookie) return next();

  const session = await sessions.readSession(cookie);
  if (!session) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return next();
  }

  const user = await couch.get(session.user_id);
  // A blocked account keeps its session document but stops being a user.
  if (!user || user.status === "blocked") {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return next();
  }

  req.session = session;
  req.user = user;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) throw unauthenticated();
  next();
}

/**
 * @param {"user"|"moderator"|"admin"} role  Minimum required role.
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) throw unauthenticated();
    if ((RANK[req.user.role] ?? 0) < RANK[role]) {
      throw forbidden(`vyžaduje sa rola ${role}`);
    }
    next();
  };
}

/** The actor recorded in the audit trail for this request. */
export function actorOf(req) {
  if (!req.user) return { id: "anonymous", role: "user" };
  return { id: req.user._id, role: req.user.role };
}

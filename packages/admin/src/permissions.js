// Kto koho smie spravovať v sekcii účtov (zadanie §2).
//
// Zrkadlo pravidla z `packages/api/src/routes/admin/users.js` — rozhoduje
// backend, tu sa podľa neho len neponúka akcia, na ktorú používateľ nemá právo.

const RANK = { user: 1, moderator: 2, admin: 3, superadmin: 4 };

export const ROLE_LABELS = {
  user: "používateľ",
  moderator: "moderátor",
  admin: "administrátor",
  superadmin: "superadmin",
};

export const roleLabel = (role) => ROLE_LABELS[role] ?? role ?? "—";

/**
 * Superadmin spravuje všetky účty vrátane adminov, admin moderátorov a bežných
 * používateľov. Vlastný účet sa upravuje cez profil, nie tu — inak by si admin
 * vedel odobrať rolu alebo vypnúť sám seba.
 *
 * @param {{id?: string, role?: string}|null} actor
 * @param {{id?: string, role?: string}|null} target
 */
export function canManageUser(actor, target) {
  if (!actor || !target) return false;
  if (actor.id === target.id) return false;
  if (actor.role === "superadmin") return true;
  if (actor.role !== "admin") return false;
  return (RANK[target.role] ?? 0) <= RANK.moderator;
}

/** Rolu vyššiu, než má sám, neprideľuje nikto. */
export function assignableRoles(actor) {
  if (actor?.role === "superadmin") return ["user", "moderator", "admin", "superadmin"];
  if (actor?.role === "admin") return ["user", "moderator"];
  return [];
}

import { Router } from "express";
import * as couch from "../../../../shared/src/couch.js";
import * as store from "../../../../shared/src/store.js";
import * as sessions from "../../../../shared/src/sessions.js";
import * as schemas from "../../../../shared/src/schemas.js";
import { hashPassword, verifyPassword } from "../../../../shared/src/passwords.js";
import { badRequest, conflict, unauthenticated } from "../../../../shared/src/index.js";
import { publicUser } from "../../../../shared/src/projection.js";
import { userByEmail } from "../../../../shared/src/queries.js";
import * as validate from "../../middleware/validate.js";
import { issueToken } from "../../middleware/csrf.js";
import { SESSION_COOKIE, requireAuth, actorOf } from "../../middleware/auth.js";
import { loginLimiter, registerLimiter } from "../../middleware/ratelimit.js";

export const auth = Router();

auth.get("/csrf", (req, res) => {
  res.json({ csrf_token: issueToken(res) });
});

auth.post(
  "/register",
  registerLimiter,
  validate.body(schemas.registerBody),
  async (req, res) => {
    const email = req.body.email.toLowerCase();
    if (await userByEmail(email)) {
      // Registration is rate limited, so this is not a usable enumeration
      // oracle; a vague error here would only confuse legitimate users.
      throw conflict("e-mail je už zaregistrovaný");
    }

    const user = await store.createDoc({
      type: "user",
      data: {
        email,
        password_hash: await hashPassword(req.body.password),
        display_name: req.body.display_name ?? null,
        // Registration always produces a plain user. Promotion is an explicit
        // admin action; the API has no path that mints a moderator or an admin
        // (backend-zadanie.md §7).
        role: "user",
        status: "active",
        email_verified_at: null,
        last_login_at: null,
        notification_prefs: { frequency: "daily", level: "significant" },
      },
      actor: { id: "system:api", role: "user" },
      reason: "registrácia",
    });

    const { cookie } = await sessions.createSession(user._id, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.cookie(SESSION_COOKIE, cookie, sessions.cookieOptions());
    issueToken(res);

    res.status(201).json({ user: publicUser(user) });
  },
);

auth.post("/login", loginLimiter, validate.body(schemas.loginBody), async (req, res) => {
  const email = req.body.email.toLowerCase();
  const user = await userByEmail(email);

  // The same work and the same answer whether or not the account exists.
  const ok = await verifyPassword(user?.password_hash, req.body.password);
  if (!user || !ok || user.status === "blocked") {
    throw unauthenticated("nesprávny e-mail alebo heslo");
  }

  const { cookie } = await sessions.createSession(user._id, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  res.cookie(SESSION_COOKIE, cookie, sessions.cookieOptions());
  issueToken(res);

  await store.updateDoc({
    id: user._id,
    patch: { last_login_at: new Date().toISOString() },
    actor: { id: user._id, role: user.role },
    reason: "prihlásenie",
  });

  res.json({ user: publicUser(user) });
});

auth.post("/logout", async (req, res) => {
  const cookie = req.cookies?.[SESSION_COOKIE];
  const id = sessions.sessionIdFromCookie(cookie);
  if (id) await sessions.destroySession(id);

  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

export const profile = Router();

profile.get("/", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

profile.patch("/", requireAuth, validate.body(schemas.profileBody), async (req, res) => {
  const patch = {};
  if (req.body.display_name !== undefined) patch.display_name = req.body.display_name;
  if (req.body.notification_prefs) {
    patch.notification_prefs = { ...req.user.notification_prefs, ...req.body.notification_prefs };
  }

  if (req.body.new_password) {
    if (!(await verifyPassword(req.user.password_hash, req.body.current_password))) {
      throw badRequest("súčasné heslo nesedí");
    }
    patch.password_hash = await hashPassword(req.body.new_password);
  }

  if (Object.keys(patch).length === 0) {
    return res.json({ user: publicUser(req.user) });
  }

  const updated = await store.updateDoc({
    id: req.user._id,
    patch,
    actor: actorOf(req),
    reason: "úprava profilu",
  });

  res.json({ user: publicUser(updated) });
});

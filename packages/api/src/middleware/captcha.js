// Cloudflare Turnstile, verified server-side before anything is written
// (backend-zadanie.md §7). It applies to logged-in users too, so there is one
// path and one validation rather than two that drift apart.
//
// Same shape as the `Mailer` interface in §8.3: an implementation is chosen at
// startup, and the rest of the code does not know which one it got. Without a
// secret configured the API refuses to start in production; in development it
// runs with the permissive implementation and says so, loudly, once.

import { config } from "../../../shared/src/config.js";
import { logger } from "../../../shared/src/logger.js";
import { badRequest } from "../../../shared/src/index.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** @typedef {{ verify(token: string|undefined, ip?: string): Promise<boolean> }} Captcha */

/** @implements {Captcha} */
class TurnstileCaptcha {
  constructor(secret) {
    this.secret = secret;
  }

  async verify(token, ip) {
    if (!token) return false;
    const form = new URLSearchParams({ secret: this.secret, response: token });
    if (ip) form.set("remoteip", ip);

    try {
      const res = await fetch(VERIFY_URL, { method: "POST", body: form });
      const data = await res.json();
      return data.success === true;
    } catch (err) {
      // A captcha provider outage must not become an open write path.
      logger.error({ err }, "overenie captchy zlyhalo");
      return false;
    }
  }
}

/** @implements {Captcha} */
class AllowAllCaptcha {
  async verify() {
    return true;
  }
}

/** @type {Captcha} */
export const captcha = config.TURNSTILE_SECRET
  ? new TurnstileCaptcha(config.TURNSTILE_SECRET)
  : new AllowAllCaptcha();

if (!config.TURNSTILE_SECRET) {
  logger.warn(
    "TURNSTILE_SECRET nie je nastavený — captcha na podnetoch je vypnutá. " +
      "V produkcii sa API bez neho nespustí.",
  );
}

/** Reads `captcha_token` from the body and rejects with 422 when it fails. */
export function requireCaptcha(req, res, next) {
  Promise.resolve(captcha.verify(req.body?.captcha_token, req.ip))
    .then((ok) => {
      if (!ok) return next(badRequest("neplatné alebo chýbajúce overenie captcha"));
      // Never let it through to the store: it is proof, not content.
      if (req.body) delete req.body.captcha_token;
      next();
    })
    .catch(next);
}

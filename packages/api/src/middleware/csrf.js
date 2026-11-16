// Double-submit CSRF for every non-GET request (backend-zadanie.md §7).
//
// The cookie is deliberately *not* HttpOnly: the browser has to be able to read
// it and echo it in a header. That is the whole mechanism — a cross-site
// attacker can make the browser send the cookie, but cannot read it to build
// the matching header.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../../../shared/src/config.js";
import { forbidden } from "../../../shared/src/index.js";

export const CSRF_COOKIE = "csrf";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** @param {import("express").Response} res */
export function issueToken(res) {
  const token = randomBytes(32).toString("base64url");
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  });
  return token;
}

export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get(CSRF_HEADER);

  if (!cookie || !header || !equal(cookie, header)) {
    throw forbidden("chýbajúci alebo neplatný CSRF token");
  }
  next();
}

function equal(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Jediné miesto, ktoré volá API.
//
// Tri veci, ktoré musí riešiť za všetkých ostatných: CSRF token pri každom
// non-GET, jednotný tvar chyby zo servera, a 409 ako bežnú situáciu (dvaja
// moderátori na tej istej kauze), nie ako pád.

/** Chyba z API v tvare `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {{ code?: string, message?: string, details?: unknown }} body
   */
  constructor(status, body) {
    super(body?.message ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? "UNKNOWN";
    this.details = body?.details;
  }

  /** Vypršaná session — vyžaduje prihlásenie, nie chybovú hlášku. */
  get isUnauthenticated() {
    return this.code === "UNAUTHENTICATED";
  }

  /** Konflikt verzií. `details.current` nesie aktuálny stav dokumentu. */
  get isConflict() {
    return this.code === "CONFLICT";
  }

  /** Validácia: `details` je pole `{ path, message }`. */
  get fieldErrors() {
    return Array.isArray(this.details) ? this.details : [];
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Zabezpečí, že CSRF cookie existuje; vráti token do hlavičky. */
async function csrfToken() {
  const existing = readCookie("csrf");
  if (existing) return existing;

  const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status, { code: "INTERNAL", message: "CSRF token sa nepodarilo získať" });
  const data = await res.json();
  return data.csrf_token;
}

/**
 * @param {string} path  napr. "/admin/cases"
 * @param {{ method?: string, body?: unknown, params?: Record<string, any>, signal?: AbortSignal }} [opts]
 */
export async function api(path, opts = {}) {
  const method = opts.method ?? "GET";
  const url = new URL(`/api${path}`, window.location.origin);

  for (const [key, value] of Object.entries(opts.params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  /** @type {RequestInit} */
  const init = {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: opts.signal,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.headers["x-csrf-token"] = await csrfToken();
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(url, init);
  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, data?.error ?? {});
  return data;
}

export const get = (path, params, signal) => api(path, { params, signal });
export const post = (path, body) => api(path, { method: "POST", body });
export const patch = (path, body) => api(path, { method: "PATCH", body });
// Mazanie nesie telo — dôvod je povinný a končí v audite.
export const del = (path, body) => api(path, { method: "DELETE", body });

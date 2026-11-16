// Prihlásenie, roly a ochrana routov.
//
// Dve veci zo zadania §1, ktoré nie sú samozrejmé:
//   - používateľ s rolou `user` sa do administrácie neprihlási a musí sa to
//     dozvedieť ako vysvetlenie, nie ako „nesprávne heslo";
//   - vypršanie session počas práce nesmie zhodiť rozpracovaný formulár, takže
//     sa rieši modálom nad obrazovkou, nie presmerovaním.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, post } from "./api/client.js";
import { ThemeToggle } from "./theme.jsx";
import { useProfile } from "./api/queries.js";

/** Kumulatívne poradie rolí. `superadmin` zatiaľ backend nepozná (zadanie §12). */
const RANK = { user: 1, moderator: 2, admin: 3, superadmin: 4 };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { data, isLoading, refetch } = useProfile();
  const [expired, setExpired] = useState(false);
  const client = useQueryClient();

  const user = data?.user ?? null;

  // Každá 401 z ľubovoľného dotazu znamená vypršanú session. Zachytáva sa
  // globálne, aby o tom nemusela vedieť žiadna obrazovka.
  useEffect(() => {
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      const error = event?.query?.state?.error;
      if (error instanceof ApiError && error.isUnauthenticated && user) setExpired(true);
    });
    return unsubscribe;
  }, [client, user]);

  const login = useCallback(
    async (email, password) => {
      const result = await post("/auth/login", { email, password });
      await refetch();
      setExpired(false);
      return result.user;
    },
    [refetch],
  );

  const logout = useCallback(async () => {
    await post("/auth/logout", {});
    client.clear();
    window.location.assign("/admin/login");
  }, [client]);

  const value = {
    user,
    isLoading,
    login,
    logout,
    expired,
    dismissExpired: () => setExpired(false),
    can: (role) => (RANK[user?.role] ?? 0) >= (RANK[role] ?? 99),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth mimo AuthProvider");
  return context;
}

/** Má prihlásený používateľ prístup do administrácie vôbec? */
export const hasAdminAccess = (user) => (RANK[user?.role] ?? 0) >= RANK.moderator;

export function RequireAdmin({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!hasAdminAccess(user)) return <NoAccess />;
  return children;
}

/**
 * Obal pre obrazovku, ktorá vyžaduje vyššiu rolu. Akcia, na ktorú používateľ
 * nemá právo, sa podľa zadania §2 **nezobrazuje** — takže na túto obrazovku by
 * sa nemal ani dostať cez menu. Toto je poistka pre priamy odkaz.
 */
export function RequireRole({ role, children }) {
  const { can } = useAuth();
  if (!can(role)) {
    return (
      <div className="alert alert-warning">
        <h5 className="alert-heading">Na túto sekciu nemáš oprávnenie</h5>
        <p className="mb-0">Vyžaduje sa rola <strong>{role}</strong>. Ak ju potrebuješ, napíš administrátorovi.</p>
      </div>
    );
  }
  return children;
}

export function FullPageSpinner() {
  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
      <div className="spinner-border text-secondary" role="status">
        <span className="visually-hidden">Načítava sa…</span>
      </div>
    </div>
  );
}

function NoAccess() {
  const { user, logout } = useAuth();
  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <div className="card">
        <div className="card-body">
          <h4 className="card-title">Účet nemá prístup do administrácie</h4>
          <p className="text-body-secondary">
            Si prihlásený ako <strong>{user?.email}</strong> s rolou <code>{user?.role}</code>.
            Do administrácie sa dostane moderátor a vyššie. Moderovanie prideľuje administrátor.
          </p>
          <div className="d-flex gap-2">
            <a className="btn btn-primary" href="/">Späť na verejnú časť</a>
            <button className="btn btn-outline-secondary" onClick={logout} type="button">
              Odhlásiť sa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && hasAdminAccess(user)) {
    return <Navigate to={location.state?.from ?? "/"} replace />;
  }
  if (user) return <NoAccess />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "RATE_LIMITED"
          ? err.message
          : "Nesprávny e-mail alebo heslo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <h1 className="h4 mb-1">Register káuz</h1>
          <p className="text-body-secondary mb-4">Administrácia</p>
        </div>
        {/* Aj prihlasovacia obrazovka je obrazovka — prepínač patrí aj sem. */}
        <ThemeToggle />
      </div>

      <form className="card" onSubmit={submit}>
        <div className="card-body">
          {error && <div className="alert alert-danger py-2">{error}</div>}

          <div className="mb-3">
            <label className="form-label" htmlFor="email">E-mail</label>
            <input
              id="email" type="email" className="form-control" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="password">Heslo</label>
            <input
              id="password" type="password" className="form-control" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </div>

          <button className="btn btn-primary w-100" type="submit" disabled={busy}>
            {busy ? "Prihlasujem…" : "Prihlásiť sa"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Modál pri vypršanej session — formulár pod ním zostáva nedotknutý. */
export function SessionExpiredModal() {
  const { expired, login, dismissExpired } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const { user } = useAuth();

  if (!expired) return null;

  async function submit(event) {
    event.preventDefault();
    try {
      await login(user?.email ?? "", password);
      setPassword("");
      dismissExpired();
    } catch {
      setError("Heslo nesedí.");
    }
  }

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-dialog-centered">
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header">
            <h5 className="modal-title">Prihlásenie vypršalo</h5>
          </div>
          <div className="modal-body">
            <p className="text-body-secondary">
              Rozpracovaný formulár zostal otvorený. Zadaj heslo a pokračuj tam, kde si prestal.
            </p>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <input
              type="password" className="form-control" autoComplete="current-password" autoFocus
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={user?.email}
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" type="submit">Prihlásiť</button>
          </div>
        </form>
      </div>
    </div>
  );
}

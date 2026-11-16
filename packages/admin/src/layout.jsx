// Layout, sidebar a horný pruh (zadanie §3).
//
// Zásada zobrazovania práv: akcia, na ktorú používateľ nemá právo, sa
// **nezobrazuje**, nie zobrazuje neaktívna. Sidebar preto filtruje položky
// podľa roly, nie ich zašedí.
//
// Badge ukazujú prácu, ktorá čaká — nie celkové počty. Nula znamená žiadny
// badge, nie nulu.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import { useGlobalSearch, useSummary } from "./api/queries.js";
import { ThemeToggle } from "./theme.jsx";
import { PublishBadge } from "./ui.jsx";

const ROLE_LABELS = { moderator: "moderátor", admin: "administrátor", superadmin: "superadmin" };

function Badge({ count }) {
  if (!count) return null; // nula = žiadny badge
  return <span className="badge text-bg-danger ms-auto">{count}</span>;
}

function Sidebar() {
  const { can } = useAuth();
  const { data: summary } = useSummary();
  const queue = summary?.queue ?? {};

  const items = [
    { to: "/", label: "Prehľad", end: true },
    { to: "/kauzy", label: "Kauzy" },
    { to: "/konania", label: "Konania" },
    { to: "/podnety", label: "Podnety", badge: queue.pending },
    { to: "/clanky", label: "Články", badge: queue.unprocessed_articles },
    { to: "/osoby", label: "Osoby" },
    { to: "/subjekty", label: "Subjekty" },
    { to: "/ciselniky", label: "Číselníky", role: "admin" },
    { to: "/pouzivatelia", label: "Používatelia", role: "admin" },
    { to: "/administratori", label: "Administrátori", role: "admin" },
    { to: "/feedy", label: "Feedy", role: "admin" },
    { to: "/revizie", label: "Revízie", role: "admin" },
  ];

  return (
    <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
      <div className="sidebar-brand">
        <Link to="/" className="brand-link text-decoration-none">
          <span className="brand-text fw-light">Register káuz</span>
        </Link>
      </div>

      <nav className="mt-2">
        <ul className="nav sidebar-menu flex-column" role="menu">
          {items
            .filter((item) => !item.role || can(item.role))
            .map((item) => (
              <li className="nav-item" key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link d-flex align-items-center ${isActive ? "active" : ""}`}
                >
                  <span>{item.label}</span>
                  <Badge count={item.badge} />
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </aside>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useGlobalSearch(q);
  const navigate = useNavigate();
  const box = useRef(null);

  useEffect(() => {
    const onClick = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const groups = [
    { title: "Kauzy", items: (data?.entities ?? []).filter((e) => e.type === "case"), path: "/kauzy" },
    { title: "Osoby", items: (data?.entities ?? []).filter((e) => e.type === "person"), path: "/osoby" },
    { title: "Subjekty", items: (data?.entities ?? []).filter((e) => e.type === "org"), path: "/subjekty" },
    { title: "Články", items: data?.articles ?? [], path: "/clanky" },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="position-relative flex-grow-1" style={{ maxWidth: 560 }} ref={box}>
      <input
        className="form-control form-control-sm"
        placeholder="Hľadaj kauzy, osoby, subjekty, články…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        aria-label="Globálne vyhľadávanie"
      />

      {open && q.trim().length >= 2 && (
        <div className="dropdown-menu show w-100 mt-1 shadow" style={{ maxHeight: 420, overflowY: "auto" }}>
          {isFetching && <span className="dropdown-item-text text-body-secondary small">Hľadám…</span>}
          {!isFetching && groups.length === 0 && (
            <span className="dropdown-item-text text-body-secondary small">Nič sa nenašlo.</span>
          )}
          {groups.map((group) => (
            <div key={group.title}>
              <h6 className="dropdown-header">{group.title}</h6>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="dropdown-item d-flex justify-content-between gap-2"
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                    navigate(`${group.path}/${item.id}`);
                  }}
                >
                  <span className="text-truncate">{item.title ?? item.full_name ?? item.name}</span>
                  {item.publish_state && <PublishBadge state={item.publish_state} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-wrapper">
      <nav className="app-header navbar navbar-expand bg-body border-bottom">
        <div className="container-fluid gap-3">
          <GlobalSearch />
          <div className="ms-auto d-flex align-items-center gap-3">
            <ThemeToggle />
            <Link to="/profil" className="small text-decoration-none">
              {user?.display_name || user?.email}
              <span className="badge text-bg-light border ms-2">{ROLE_LABELS[user?.role] ?? user?.role}</span>
            </Link>
            <button className="btn btn-sm btn-outline-secondary" onClick={logout} type="button">
              Odhlásiť
            </button>
          </div>
        </div>
      </nav>

      <Sidebar />

      <main className="app-main">
        <div className="app-content pt-3">
          <div className="container-fluid">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Drobečková navigácia je povinná všade hlbšie než prvá úroveň (zadanie §3) —
 * z detailu sa musí dať jedným klikom vrátiť.
 *
 * @param {{ items: Array<{ label: string, to?: string }> }} props
 */
export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Drobečková navigácia">
      <ol className="breadcrumb small">
        {items.map((item, index) => (
          <li
            key={index}
            className={`breadcrumb-item ${index === items.length - 1 ? "active" : ""}`}
            aria-current={index === items.length - 1 ? "page" : undefined}
          >
            {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Hlavička obrazovky: nadpis vľavo, akcie vpravo. */
export function PageHeader({ title, subtitle, actions, breadcrumbs }) {
  return (
    <div className="mb-3">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div>
          <h1 className="h4 mb-0">{title}</h1>
          {subtitle && <p className="text-body-secondary mb-0 small">{subtitle}</p>}
        </div>
        {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

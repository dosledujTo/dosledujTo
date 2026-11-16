// Prevádzkové obrazovky: feedy, používatelia, administrátori, revízie (zadanie §9).
// Číselníky majú vlastný súbor — `pages/Codelists.jsx`.

import { useState } from "react";
import { Link, useMatch, useParams } from "react-router-dom";
import { useCases, useFeeds, usePatchUser, useRevisions, useRunFeed, useUser, useUsers } from "../api/queries.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../layout.jsx";
import { assignableRoles, canManageUser, roleLabel } from "../permissions.js";
import { EmptyState, ErrorState, Notice, ReasonDialog, Spinner, formatDateTime } from "../ui.jsx";

/** Dokedy nás médium nepustí; `null`, keď už zase pustí. */
const blockedUntil = (feed) =>
  feed.blocked_until && Date.parse(feed.blocked_until) > Date.now() ? feed.blocked_until : null;

export function Feeds() {
  const { data, isLoading, error, refetch } = useFeeds();
  const run = useRunFeed();

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Feedy" subtitle="Sledované zdroje, z ktorých crawler sťahuje články" />

      <div className="table-responsive card">
        <table className="table align-middle mb-0">
          <thead className="table-light">
            <tr className="small text-body-secondary">
              <th>Feed</th><th>URL</th><th>Interval</th><th>Posledný beh</th>
              <th>robots.txt</th><th>Stav</th><th />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((feed) => (
              <tr key={feed.id}>
                <td>
                  <div className="fw-semibold">{feed.name}</div>
                  <div className="small text-body-secondary">
                    {feed.kind}{feed.paywall && " · paywall"}
                  </div>
                </td>
                <td className="small text-truncate" style={{ maxWidth: 260 }}>
                  <a href={feed.url} target="_blank" rel="noreferrer noopener">{feed.url}</a>
                </td>
                <td className="small">{feed.crawl_interval_min} min</td>
                <td className="small">{feed.last_run_at ? formatDateTime(feed.last_run_at) : "nikdy"}</td>
                <td className="small">
                  {feed.robots_ok === false
                    ? <span className="badge text-bg-danger">zakazuje</span>
                    : feed.robots_ok === true
                      ? <span className="badge text-bg-success">povoľuje</span>
                      : <span className="text-body-secondary">neoverené</span>}
                </td>
                <td className="small">
                  {/* Odmietnutie médiom (429/403) nie je pokazený feed: crawler
                      mu dal pokoj a sám sa vráti. Vyzerať to má inak než chyba,
                      inak by prevádzka opravovala niečo, čo nie je rozbité. */}
                  {blockedUntil(feed) ? (
                    <>
                      <span className="badge text-bg-warning">odmieta crawler</span>
                      <div className="text-body-secondary">
                        skúsi znova {formatDateTime(feed.blocked_until)}
                      </div>
                    </>
                  ) : feed.last_error ? (
                    // Chybová hláška, nie len červená bodka (zadanie §9).
                    <span className="text-danger">{feed.last_error}</span>
                  ) : feed.enabled ? (
                    <span className="badge text-bg-success">zapnutý</span>
                  ) : (
                    <span className="badge text-bg-secondary">vypnutý</span>
                  )}
                  {feed.consecutive_failures > 0 && (
                    <div className="text-danger">{feed.consecutive_failures}× po sebe zlyhal</div>
                  )}
                </td>
                <td className="text-end">
                  <button
                    className="btn btn-sm btn-outline-primary"
                    type="button"
                    disabled={run.isPending}
                    onClick={() => run.mutate(feed.id)}
                  >
                    Spustiť
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {run.isSuccess && (
        <Notice tone="info">
          Požiadavka na crawl je zapísaná. Vykoná ju worker — API a worker sa rozprávajú cez databázu,
          nie priamo, takže sa to nestane okamžite.
        </Notice>
      )}
    </>
  );
}

/**
 * Stav účtu je v dátach `active | blocked`, v rozhraní **aktívny / neaktívny**:
 * moderátorovi sa účet nezakazuje, iba vypína a zapína (zadanie §9).
 */
export function StatusBadge({ status }) {
  return status === "active"
    ? <span className="badge text-bg-success">aktívny</span>
    : <span className="badge text-bg-secondary">neaktívny</span>;
}

export function Users({ adminsOnly = false }) {
  const { data, isLoading, error, refetch } = useUsers({});

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const items = (data?.items ?? []).filter((user) =>
    adminsOnly ? user.role !== "user" : user.role === "user");

  return (
    <>
      <PageHeader
        title={adminsOnly ? "Administrátori" : "Registrovaní používatelia"}
        subtitle={adminsOnly
          ? "Účty s prístupom do administrácie a ich roly"
          : "Účty verejnej časti — sledovanie káuz a podnety"}
      />

      {items.length === 0 ? (
        <EmptyState title="Žiadne účty" hint="Účty vznikajú registráciou na verejnej časti." />
      ) : (
        <div className="table-responsive card">
          <table className="table align-middle mb-0">
            <thead className="table-light">
              <tr className="small text-body-secondary">
                <th>E-mail</th><th>Meno</th><th>Rola</th><th>Stav</th>
                <th>Registrácia</th><th>Posledné prihlásenie</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <UserRow key={user.id} user={user} section={adminsOnly ? "administratori" : "pouzivatelia"} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="small text-body-secondary mt-3">
        Superadmin spravuje všetky účty vrátane administrátorov, administrátor moderátorov a bežných
        používateľov. Vlastný účet sa upravuje cez <Link to="/profil">vlastný profil</Link>, inak by
        si administrátor vedel odobrať rolu alebo vypnúť sám seba. Mazanie účtu zatiaľ v modeli
        nie je (§12 zadania).
      </p>
    </>
  );
}

/**
 * Riadok je vlastný komponent kvôli mutácii: `usePatchUser` potrebuje id účtu,
 * a hooky sa nedajú volať v cykle nad zoznamom.
 */
function UserRow({ user, section }) {
  const { user: me } = useAuth();
  const patch = usePatchUser(user.id);
  const [editing, setEditing] = useState(false);
  const canManage = canManageUser(me, user);
  const roles = assignableRoles(me);

  return (
    <tr>
      <td>{user.email}</td>
      <td>{user.display_name ?? "—"}</td>
      <td>
        {editing ? (
          <select
            className="form-select form-select-sm"
            defaultValue={user.role}
            disabled={patch.isPending}
            onChange={async (e) => {
              await patch.mutateAsync({ role: e.target.value, reason: "zmena roly z administrácie" });
              setEditing(false);
            }}
          >
            {roles.map((role) => (
              <option key={role} value={role}>{roleLabel(role)}</option>
            ))}
          </select>
        ) : (
          <span className="badge text-bg-light border">{roleLabel(user.role)}</span>
        )}
        {patch.error && <div className="small text-danger mt-1">{patch.error.message}</div>}
      </td>
      <td><StatusBadge status={user.status} /></td>
      <td className="small">{formatDateTime(user.created_at)}</td>
      <td className="small">{user.last_login_at ? formatDateTime(user.last_login_at) : "nikdy"}</td>
      <td className="text-end">
        <Link className="btn btn-sm btn-outline-primary me-1" to={`/${section}/${user.id}`}>
          profil
        </Link>
        {/* Akcia, na ktorú používateľ nemá právo, sa nezobrazuje (zadanie §2). */}
        {canManage && (
          <button
            className="btn btn-sm btn-outline-secondary"
            type="button"
            onClick={() => setEditing(!editing)}
          >
            {editing ? "zrušiť" : "zmeniť rolu"}
          </button>
        )}
      </td>
    </tr>
  );
}

export function Revisions() {
  const [targetId, setTargetId] = useState("");
  const [actorId, setActorId] = useState("");
  const { data, isLoading, error } = useRevisions({
    target_id: targetId || undefined,
    actor_id: actorId || undefined,
    limit: 100,
  });
  const [open, setOpen] = useState(null);

  return (
    <>
      <PageHeader title="Revízie" subtitle="Audit log — kto, kedy, čo a prečo zmenil" />

      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label className="form-label small mb-1">Id dokumentu</label>
            <input className="form-control form-control-sm font-monospace" style={{ minWidth: 320 }}
              value={targetId} onChange={(e) => setTargetId(e.target.value.trim())} placeholder="case:0192…" />
          </div>
          <div>
            <label className="form-label small mb-1">Id autora</label>
            <input className="form-control form-control-sm font-monospace" style={{ minWidth: 320 }}
              value={actorId} onChange={(e) => setActorId(e.target.value.trim())} placeholder="user:0192…" />
          </div>
        </div>
      </div>

      {!targetId && !actorId && (
        <EmptyState
          title="Vyber, čo chceš vidieť"
          hint="Audit sa číta podľa dokumentu alebo podľa autora — filter podľa obdobia naprieč celým systémom backend zatiaľ nemá."
        />
      )}

      {isLoading && (targetId || actorId) && <Spinner />}
      {error && <ErrorState error={error} />}

      {data && (
        <div className="list-group">
          {data.items.map((revision) => (
            <div className="list-group-item" key={revision.id}>
              <button className="btn btn-link p-0 text-start w-100 text-decoration-none" type="button"
                onClick={() => setOpen(open === revision.id ? null : revision.id)}>
                <div className="d-flex justify-content-between gap-2">
                  <span className="fw-semibold text-body">{revision.reason ?? "bez dôvodu"}</span>
                  <span className="small text-body-secondary">{formatDateTime(revision.at)}</span>
                </div>
                <div className="small text-body-secondary font-monospace">
                  {revision.target_id} · {revision.actor_role} {revision.actor_id}
                </div>
              </button>
              {open === revision.id && (
                <pre className="bg-body-tertiary p-2 mt-2 mb-0 small" style={{ maxHeight: 320, overflow: "auto" }}>
                  {JSON.stringify(revision.diff, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Profil registrovaného používateľa (zadanie §9): prezývka, odbery a v akom
 * režime ich má.
 *
 * Režim oznámení admin **vidí, ale nemení** — je to voľba používateľa. Produkt
 * sa zúžil na dva: pri každej zmene, alebo týždenný súhrn.
 */
export function UserDetail() {
  const { id } = useParams();
  // Detail účtu žije v oboch zoznamoch — profil administrátora sa otvára pod
  // `/administratori/:id`, aby drobečky ani zvýraznenie v sidebare neposlali
  // moderátora späť medzi registrovaných používateľov.
  const admins = useMatch("/administratori/:id") != null;
  const section = admins
    ? { label: "Administrátori", to: "/administratori" }
    : { label: "Používatelia", to: "/pouzivatelia" };
  const { user: me } = useAuth();
  const { data, isLoading, error } = useUser(id);
  const patch = usePatchUser(id);
  const [name, setName] = useState(null);
  // Každá zmena účtu ide do auditu s dôvodom, tak ako zmena kauzy.
  const [pending, setPending] = useState(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const user = data.user;
  const canManage = canManageUser(me, user);
  const roles = assignableRoles(me);
  const displayName = name ?? user.display_name ?? "";
  const active = user.status === "active";

  const apply = async (reason) => {
    try {
      await patch.mutateAsync({ ...pending.patch, reason });
      setName(null);
    } catch {
      // Hlášku z backendu ukáže Notice nad kartami — dialóg by ju prekryl.
    }
    setPending(null);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[section, { label: user.email }]}
        title={user.display_name || user.email}
        subtitle={
          <span className="d-inline-flex gap-2 align-items-center">
            <span className="badge text-bg-light border">{roleLabel(user.role)}</span>
            <StatusBadge status={user.status} />
          </span>
        }
      />

      {patch.error && <Notice tone="danger">{patch.error.message}</Notice>}

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Účet</div>
            <div className="card-body">
              <dl className="row mb-0 small">
                <dt className="col-5">E-mail</dt><dd className="col-7">{user.email}</dd>
                {!canManage && (
                  <>
                    <dt className="col-5">Prezývka</dt><dd className="col-7">{user.display_name ?? "—"}</dd>
                    <dt className="col-5">Rola</dt><dd className="col-7">{roleLabel(user.role)}</dd>
                  </>
                )}
                <dt className="col-5">Registrácia</dt><dd className="col-7">{formatDateTime(user.created_at)}</dd>
                <dt className="col-5">Posledné prihlásenie</dt>
                <dd className="col-7">{user.last_login_at ? formatDateTime(user.last_login_at) : "nikdy"}</dd>
                <dt className="col-5">E-mail overený</dt>
                <dd className="col-7">{user.email_verified_at ? formatDateTime(user.email_verified_at) : "nie"}</dd>
              </dl>

              {canManage ? (
                <div className="border-top mt-3 pt-3 d-grid gap-3">
                  <div>
                    <label className="form-label small mb-1" htmlFor="user-display-name">Prezývka</label>
                    <div className="d-flex gap-2">
                      <input
                        id="user-display-name"
                        className="form-control form-control-sm"
                        value={displayName}
                        maxLength={80}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <button
                        className="btn btn-sm btn-outline-primary"
                        type="button"
                        disabled={
                          patch.isPending
                          || displayName.trim().length < 2
                          || displayName.trim() === (user.display_name ?? "")
                        }
                        onClick={() => setPending({
                          patch: { display_name: displayName.trim() },
                          title: "Zmena prezývky",
                        })}
                      >
                        Uložiť
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="form-label small mb-1" htmlFor="user-role">Rola</label>
                    <select
                      id="user-role"
                      className="form-select form-select-sm"
                      value={user.role}
                      disabled={patch.isPending}
                      onChange={(e) => setPending({ patch: { role: e.target.value }, title: "Zmena roly" })}
                    >
                      {/* Rolu, ktorú prihlásený prideliť nesmie, ponuka neobsahuje;
                          vlastnú rolu účtu treba ukázať aj tak. */}
                      {(roles.includes(user.role) ? roles : [user.role, ...roles]).map((role) => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="form-label small mb-1">Stav účtu</div>
                    <div className="d-flex align-items-center gap-2">
                      <StatusBadge status={user.status} />
                      <button
                        className={`btn btn-sm ${active ? "btn-outline-danger" : "btn-outline-success"}`}
                        type="button"
                        disabled={patch.isPending}
                        onClick={() => setPending({
                          patch: { status: active ? "blocked" : "active" },
                          title: active ? "Deaktivovanie účtu" : "Aktivovanie účtu",
                          hint: active
                            ? "Deaktivovaný účet sa neprihlási a jeho prebiehajúca session prestane platiť. Účet zostáva aj s históriou zmien."
                            : "Účet sa bude môcť znova prihlásiť v role, ktorú má nastavenú.",
                        })}
                      >
                        {active ? "Deaktivovať" : "Aktivovať"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="small text-body-secondary border-top mt-3 pt-3 mb-0">
                  {me?.id === user.id
                    ? <>Vlastný účet upravíš cez <Link to="/profil">svoj profil</Link>.</>
                    : <>Účet s rolou <strong>{roleLabel(user.role)}</strong> upravuje len superadmin.</>}
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Marketingové oznámenia</div>
            <div className="card-body">
              {user.marketing_consent ? (
                <>
                  <p className="mb-2"><span className="badge text-bg-success">súhlas udelený</span></p>
                  {canManage && (
                    <button
                      className="btn btn-sm btn-outline-danger"
                      type="button"
                      disabled={patch.isPending}
                      onClick={() => setPending({
                        patch: { marketing_consent: false },
                        title: "Odobratie súhlasu",
                      })}
                    >
                      Odobrať súhlas
                    </button>
                  )}
                </>
              ) : (
                <p className="mb-0 text-body-secondary small">
                  Bez súhlasu. Udeliť ho môže <strong>len sám používateľ</strong> — admin ho vie iba
                  odobrať.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold">Sledované kauzy</div>
            <ul className="list-group list-group-flush">
              {(data.subscriptions ?? []).map((s) => (
                <li className="list-group-item d-flex justify-content-between align-items-center gap-2" key={s.id}>
                  <span>
                    {s.target ? (
                      <Link to={`/${s.target_type === "case" ? "kauzy" : s.target_type === "person" ? "osoby" : "subjekty"}/${s.target_id}`}>
                        {s.target.name}
                      </Link>
                    ) : (
                      <span className="font-monospace small">{s.target_id}</span>
                    )}
                    <div className="small text-body-secondary">od {formatDateTime(s.created_at)}</div>
                  </span>
                  <span className="badge text-bg-light border">
                    {s.mode === "instant" ? "pri každej zmene" : "týždenný súhrn"}
                  </span>
                </li>
              ))}
              {(data.subscriptions ?? []).length === 0 && (
                <li className="list-group-item text-body-secondary small">Nesleduje žiadnu kauzu.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {pending && (
        <ReasonDialog
          title={pending.title}
          hint={pending.hint ?? "Jedna veta, ktorá zostane v histórii zmien účtu."}
          busy={patch.isPending}
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

/**
 * Profil prihláseného administrátora: čo kde kedy zmenil (zadanie §6).
 *
 * Aktivita sa číta z auditu podľa autora — `revisions/by_actor`. Je to tá istá
 * reťaz, z ktorej sa robí revert, takže tu nie je nič, čo by sa dalo prikrášliť.
 */
export function MyProfile() {
  const { user } = useAuth();
  const { data, isLoading } = useRevisions({ actor_id: user?.id, limit: 100 });
  const { data: cases } = useCases({ moderator_id: user?.id, limit: 50 });
  const [open, setOpen] = useState(null);

  return (
    <>
      <PageHeader
        title={user?.display_name || user?.email}
        subtitle={<span className="badge text-bg-light border">{roleLabel(user?.role)}</span>}
      />

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Moje kauzy</div>
            <ul className="list-group list-group-flush">
              {(cases?.items ?? []).map((item) => (
                <li className="list-group-item d-flex justify-content-between align-items-center" key={item.id}>
                  <Link to={`/kauzy/${item.id}`}>{item.title}</Link>
                  <span className="badge text-bg-light border">{item.publish_state}</span>
                </li>
              ))}
              {(cases?.items ?? []).length === 0 && (
                <li className="list-group-item text-body-secondary small">
                  Nemáš priradenú žiadnu kauzu. Prideľuje ich administrátor na detaile kauzy.
                </li>
              )}
            </ul>
          </div>

          <div className="card">
            <div className="card-header fw-semibold">Nastavenia</div>
            <div className="card-body text-body-secondary small">
              Zmena prezývky a hesla ide cez <code>PATCH /api/profile</code>; obrazovka k tomu
              zatiaľ nie je.
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card">
            <div className="card-header fw-semibold">Moja aktivita</div>
            {isLoading && <div className="card-body"><Spinner /></div>}
            <div className="list-group list-group-flush">
              {(data?.items ?? []).map((revision) => (
                <div className="list-group-item" key={revision.id}>
                  <button
                    className="btn btn-link p-0 text-start w-100 text-decoration-none"
                    type="button"
                    onClick={() => setOpen(open === revision.id ? null : revision.id)}
                  >
                    <div className="d-flex justify-content-between gap-2">
                      <span className="fw-semibold text-body">{revision.reason ?? "bez dôvodu"}</span>
                      <span className="small text-body-secondary">{formatDateTime(revision.at)}</span>
                    </div>
                    <div className="small text-body-secondary font-monospace">{revision.target_id}</div>
                  </button>
                  {open === revision.id && (
                    <pre className="bg-body-tertiary p-2 mt-2 mb-0 small" style={{ maxHeight: 300, overflow: "auto" }}>
                      {JSON.stringify(revision.diff, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              {data && data.items.length === 0 && (
                <div className="card-body text-body-secondary small">
                  Zatiaľ si nič nezmenil. Každá úprava sa sem zapíše aj s dôvodom.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

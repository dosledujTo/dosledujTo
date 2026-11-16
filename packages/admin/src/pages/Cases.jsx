// Zoznam káuz (zadanie §5.1).
//
// Stav filtrov žije v URL, aby sa dal odkaz na filtrovaný zoznam poslať
// kolegovi. Riadok konceptu je vizuálne odlíšený — koncepty zakladá worker
// automaticky a je ich veľa; nesmú sa strácať medzi publikovanými.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCases, useCreateCase } from "../api/queries.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../layout.jsx";
import { EmptyState, ErrorState, PHASE_LABELS, PhaseBadge, PublishBadge, Spinner, formatDate, money } from "../ui.jsx";

const PHASES = Object.entries(PHASE_LABELS);

export default function Cases() {
  const [params, setParams] = useSearchParams();
  const { can, user } = useAuth();
  const [creating, setCreating] = useState(false);

  const mine = params.get("mine") === "1";
  const filters = {
    q: params.get("q") ?? undefined,
    // „Len moje kauzy" ide cez index (`moderator_id`), nie cez filtrovanie na
    // klientovi — inak by stránkovanie prestalo dávať zmysel.
    moderator_id: mine ? user?.id : undefined,
    has_moderator: params.get("has_moderator") ?? undefined,
    publish_state: params.get("publish_state") ?? undefined,
    status: params.get("status") ?? undefined,
    phase: params.get("phase") ?? undefined,
    tag: params.get("tag") ?? undefined,
    amount_min: params.get("amount_min") ?? undefined,
    sort: params.get("sort") ?? undefined,
    limit: 50,
  };

  const { data, isLoading, error, refetch } = useCases(filters);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Kauzy"
        subtitle={data ? `${data.total} záznamov` : undefined}
        actions={
          can("admin") && (
            <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
              Založiť kauzu
            </button>
          )
        }
      />

      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-2 align-items-end">
          {/* Najdôležitejší filter stojí vľavo a oddelene (zadanie §5.1). */}
          <div className="btn-group btn-group-sm me-2" role="group">
            <button
              type="button" className={`btn btn-outline-primary ${mine ? "active" : ""}`}
              onClick={() => setFilter("mine", mine ? "" : "1")}
            >
              Len moje kauzy
            </button>
            <button
              type="button" className={`btn btn-outline-primary ${!mine ? "active" : ""}`}
              onClick={() => setFilter("mine", "")}
            >
              Všetky
            </button>
          </div>

          <div className="flex-grow-1" style={{ minWidth: 220 }}>
            <label className="form-label small mb-1">Hľadať</label>
            <input
              className="form-control form-control-sm"
              defaultValue={filters.q ?? ""}
              onKeyDown={(e) => e.key === "Enter" && setFilter("q", e.currentTarget.value)}
              onBlur={(e) => setFilter("q", e.target.value)}
              placeholder="názov, popis, meno…"
            />
          </div>

          <div>
            <label className="form-label small mb-1">Publikačný stav</label>
            <select
              className="form-select form-select-sm" value={filters.publish_state ?? ""}
              onChange={(e) => setFilter("publish_state", e.target.value)}
            >
              <option value="">všetky</option>
              <option value="draft">koncepty</option>
              <option value="published">publikované</option>
              <option value="hidden">skryté</option>
            </select>
          </div>

          <div>
            <label className="form-label small mb-1">Stav</label>
            <select className="form-select form-select-sm" value={filters.status ?? ""}
              onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">všetky</option>
              <option value="open">otvorená</option>
              <option value="closed">uzavretá</option>
            </select>
          </div>

          <div>
            <label className="form-label small mb-1">Fáza</label>
            <select className="form-select form-select-sm" value={filters.phase ?? ""}
              onChange={(e) => setFilter("phase", e.target.value)}>
              <option value="">všetky</option>
              {PHASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label small mb-1">Moderátor</label>
            <select className="form-select form-select-sm" value={filters.has_moderator ?? ""}
              onChange={(e) => setFilter("has_moderator", e.target.value)}>
              <option value="">nezáleží</option>
              <option value="true">priradený</option>
              <option value="false">bez moderátora</option>
            </select>
          </div>

          <div>
            <label className="form-label small mb-1">Zoradiť</label>
            <select className="form-select form-select-sm" value={filters.sort ?? "updated"}
              onChange={(e) => setFilter("sort", e.target.value)}>
              <option value="updated">podľa zmeny</option>
              <option value="amount">podľa sumy</option>
              <option value="started">podľa začiatku</option>
            </select>
          </div>

          {[...params.keys()].length > 0 && (
            <button className="btn btn-sm btn-link" type="button" onClick={() => setParams({}, { replace: true })}>
              zrušiť filtre
            </button>
          )}
        </div>
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="Žiadna kauza nesedí na tieto filtre"
          hint="Skús ich uvoľniť — alebo je to naozaj všetko, čo v registri je."
        />
      )}

      {data && data.items.length > 0 && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr className="small text-body-secondary">
                  <th>Kauza</th><th>Fáza</th><th>Stav</th>
                  <th className="text-end">Suma</th><th className="text-end">Osôb</th>
                  <th className="text-end">Zdrojov</th><th>Moderátori</th><th>Zmenené</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className={item.publish_state === "draft" ? "table-warning" : undefined}>
                    <td>
                      <Link to={`/kauzy/${item.id}`} className="fw-semibold text-decoration-none">
                        {item.title}
                      </Link>
                      <div className="d-flex gap-1 mt-1">
                        <PublishBadge state={item.publish_state} />
                        {item.has_unsourced && (
                          <span className="badge text-bg-danger">údaje bez zdroja</span>
                        )}
                      </div>
                    </td>
                    <td><PhaseBadge phase={item.phase} /></td>
                    <td className="small">{item.status === "open" ? "otvorená" : item.status === "closed" ? "uzavretá" : "—"}</td>
                    <td className="text-end">{money(item.amount)}</td>
                    <td className="text-end small">{item.person_count ?? 0}</td>
                    <td className="text-end small">{item.sources_count ?? 0}</td>
                    <td className="small">
                      {item.moderator_count ? (
                        <span className="text-body-secondary">{item.moderator_count} priradený(ch)</span>
                      ) : (
                        <span className="badge text-bg-warning">bez moderátora</span>
                      )}
                    </td>
                    <td className="small text-body-secondary">{formatDate(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && <NewCaseModal onClose={() => setCreating(false)} />}
    </>
  );
}

function NewCaseModal({ onClose }) {
  const create = useCreateCase();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const slugify = (text) =>
    text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-dialog-centered">
        <form
          className="modal-content"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await create.mutateAsync({ title, slug: slug || slugify(title), tags: [] });
            window.location.assign(`/admin/kauzy/${result.case.id}`);
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">Nová kauza</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <p className="text-body-secondary small">
              Kauza vzniká ako <strong>koncept</strong>. Publikovať sa dá až vtedy, keď má každý údaj zdroj.
            </p>
            <div className="mb-3">
              <label className="form-label">Názov</label>
              <input
                className="form-control" required minLength={3} autoFocus
                value={title}
                onChange={(e) => { setTitle(e.target.value); setSlug(slugify(e.target.value)); }}
              />
            </div>
            <div>
              <label className="form-label">Slug</label>
              <input className="form-control font-monospace" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
            {create.isError && <div className="alert alert-danger mt-3 py-2">{create.error.message}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onClose}>Zrušiť</button>
            <button className="btn btn-primary" type="submit" disabled={create.isPending}>
              {create.isPending ? "Zakladám…" : "Založiť koncept"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

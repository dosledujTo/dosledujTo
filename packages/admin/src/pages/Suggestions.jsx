// Podnety (zadanie §8). Detail je porovnanie: vľavo súčasná hodnota, vpravo
// navrhovaná.
//
// Rozhranie musí byť zjavné v jednej veci: **prijatie podnetu automaticky
// nepripája zdroj k údaju.** Zdroje z podnetu treba pripojiť vedome, v editore
// hodnoty — inak vzniknú publikované údaje s prázdnym `sources`.

import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useAcceptSuggestion, useRejectSuggestion, useSuggestion, useSuggestions,
} from "../api/queries.js";
import { PageHeader } from "../layout.jsx";
import { EmptyState, ErrorState, Notice, Spinner, formatDateTime } from "../ui.jsx";

const STATUS_LABELS = {
  pending: "čaká", accepted: "prijaté", rejected: "zamietnuté", needs_info: "vyžiadané doplnenie",
};

export function SuggestionQueue() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "pending";
  const origin = params.get("origin") ?? "";
  const { data, isLoading, error, refetch } = useSuggestions({
    status, origin: origin || undefined, limit: 50,
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  const newEntity = (data?.items ?? []).filter((s) => !s.target?.id);
  const regular = (data?.items ?? []).filter((s) => s.target?.id);

  return (
    <>
      <PageHeader title="Podnety" subtitle="Návrhy na zmenu údajov od používateľov a od bota" />

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <div className="btn-group btn-group-sm">
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <button
              key={value} type="button"
              className={`btn btn-outline-secondary ${status === value ? "active" : ""}`}
              onClick={() => setParam("status", value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select className="form-select form-select-sm w-auto" value={origin} onChange={(e) => setParam("origin", e.target.value)}>
          <option value="">človek aj bot</option>
          <option value="user">od človeka</option>
          <option value="bot">od bota</option>
        </select>
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="Fronta je prázdna"
          hint="Podnety sa objavia, keď niekto pošle opravu — alebo keď matcher navrhne zmenu."
        />
      )}

      {newEntity.length > 0 && (
        <>
          <h2 className="h6 text-uppercase text-body-secondary">Návrhy na novú kauzu</h2>
          <SuggestionList items={newEntity} />
        </>
      )}

      {regular.length > 0 && (
        <>
          {newEntity.length > 0 && <h2 className="h6 text-uppercase text-body-secondary mt-4">Podnety k existujúcim</h2>}
          <SuggestionList items={regular} />
        </>
      )}
    </>
  );
}

function SuggestionList({ items }) {
  return (
    <div className="list-group mb-3">
      {items.map((s) => (
        <Link className="list-group-item list-group-item-action" to={`/podnety/${s.id}`} key={s.id}>
          <div className="d-flex justify-content-between gap-3">
            <span className="fw-semibold">{s.comment ?? <em>bez komentára</em>}</span>
            <span className="text-nowrap small text-body-secondary">{formatDateTime(s.created_at)}</span>
          </div>
          <div className="d-flex flex-wrap gap-2 align-items-center mt-1 small text-body-secondary">
            <span className={`badge ${s.origin === "bot" ? "text-bg-info" : "text-bg-light border"}`}>
              {s.origin === "bot" ? "bot" : "človek"}
            </span>
            {typeof s.confidence === "number" && (
              <span className="badge text-bg-light border">istota {(s.confidence * 100).toFixed(0)} %</span>
            )}
            {s.target?.path && <code>{s.target.path}</code>}
            <span>{(s.source_urls ?? []).length} zdroj(e)</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function SuggestionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useSuggestion(id);
  const accept = useAcceptSuggestion(id);
  const reject = useRejectSuggestion(id);

  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const s = data.suggestion;
  const target = data.target;
  const decided = s.status !== "pending" && s.status !== "needs_info";

  const currentValue = s.target?.path ? target?.[s.target.path] : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Podnety", to: "/podnety" }, { label: "Detail" }]}
        title={s.target?.path ? `Podnet k poľu „${s.target.path}“` : "Podnet"}
        subtitle={
          <>
            {s.origin === "bot" ? "návrh bota" : "podnet používateľa"} · {formatDateTime(s.created_at)} ·{" "}
            <span className="badge text-bg-light border">{STATUS_LABELS[s.status]}</span>
          </>
        }
      />

      {target && (
        <p className="mb-3">
          Cieľ:{" "}
          <Link to={`/kauzy/${target.id}`}>{target.title ?? target.full_name ?? target.name}</Link>
        </p>
      )}

      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">Súčasná hodnota</div>
            <div className="card-body">
              <pre className="mb-0 small" style={{ whiteSpace: "pre-wrap" }}>
                {currentValue ? JSON.stringify(currentValue, null, 2) : "—"}
              </pre>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100 border-primary">
            <div className="card-header">Navrhovaná hodnota</div>
            <div className="card-body">
              {editing ? (
                <textarea
                  className="form-control font-monospace" rows={8}
                  value={edited} onChange={(e) => setEdited(e.target.value)}
                />
              ) : (
                <pre className="mb-0 small" style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(s.proposed_value, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">Zdroje priložené k podnetu</div>
        <ul className="list-group list-group-flush">
          {(s.source_urls ?? []).map((url) => (
            <li className="list-group-item" key={url}>
              <a href={url} target="_blank" rel="noreferrer noopener">{url}</a>
            </li>
          ))}
        </ul>
        {s.comment && <div className="card-body small text-body-secondary">„{s.comment}“</div>}
      </div>

      <Notice tone="warning">
        <div className="small">
          <strong>Prijatie nepripojí zdroj k údaju.</strong> Odkazy vyššie sú URL, nie záznamy zdrojov.
          Kým z nich niekto nespraví článok a nepripojí ho v editore hodnoty, pole zostane bez zdroja
          a kauza sa nedá publikovať.
        </div>
      </Notice>

      {decided ? (
        <div className="alert alert-secondary">
          Podnet je vybavený ({STATUS_LABELS[s.status]}).{" "}
          {s.review_note && <>Poznámka: „{s.review_note}“</>}
        </div>
      ) : (
        <div className="card">
          <div className="card-body d-flex flex-wrap gap-2 align-items-start">
            <button
              className="btn btn-success"
              type="button"
              disabled={accept.isPending}
              onClick={async () => {
                await accept.mutateAsync(
                  editing ? { edited_value: JSON.parse(edited), note: "prijaté s úpravou" } : {},
                );
                navigate("/podnety");
              }}
            >
              {editing ? "Prijať s úpravou" : "Prijať"}
            </button>

            {!editing && (
              <button
                className="btn btn-outline-primary"
                type="button"
                onClick={() => {
                  setEdited(JSON.stringify(s.proposed_value, null, 2));
                  setEditing(true);
                }}
              >
                Upraviť pred prijatím
              </button>
            )}

            <div className="ms-auto d-flex gap-2">
              <input
                className="form-control form-control-sm" style={{ minWidth: 260 }}
                placeholder="dôvod zamietnutia (povinný)"
                value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              />
              <button
                className="btn btn-outline-danger"
                type="button"
                disabled={rejectReason.trim().length < 3 || reject.isPending}
                onClick={async () => {
                  await reject.mutateAsync({ reason: rejectReason.trim() });
                  navigate("/podnety");
                }}
              >
                Zamietnuť
              </button>
            </div>
          </div>

          {(accept.isError || reject.isError) && (
            <div className="card-footer text-danger small">
              {(accept.error ?? reject.error).message}
            </div>
          )}
        </div>
      )}

      <p className="small text-body-secondary mt-3">
        Akcia „Vyžiadať doplnenie“ (stav <code>needs_info</code>) je v dátovom modeli, ale API pre ňu
        zatiaľ nemá endpoint — dopĺňa sa spolu s ostatnými bodmi z §12 zadania.
      </p>
    </>
  );
}

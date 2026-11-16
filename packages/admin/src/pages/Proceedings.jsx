// Súdne konania ako samostatná sekcia.
//
// Konanie patrí ku kauze, ale pracuje sa s ním aj naprieč nimi: moderátor má
// v ruke rozhodnutie so spisovou značkou a potrebuje zistiť, ku ktorej kauze
// patrí — nie prekliknúť tridsať detailov káuz. Spisová značka je jediný
// praktický kľúč na spárovanie anonymizovaného rozhodnutia (zadanie §5.10),
// takže vyhľadávanie ide predovšetkým cez ňu.
//
// Zakladá sa vždy v kauze: konanie bez kauzy nemá kam patriť. Tu sa upravuje
// a odstraňuje.

import { useState } from "react";
import { Link } from "react-router-dom";

import { useDeleteProceeding, usePatchProceeding, useProceedings } from "../api/queries.js";
import { PageHeader } from "../layout.jsx";
import { DeleteDialog } from "../pickers.jsx";
import { useCodelist } from "../codelist.jsx";
import { EmptyState, ErrorState, PhaseBadge, Spinner } from "../ui.jsx";
import { ProceedingForm } from "./CaseDetail.jsx";

export default function Proceedings() {
  const [filters, setFilters] = useState({ q: "", court: "" });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, error, refetch } = useProceedings({
    q: filters.q || undefined,
    court: filters.court || undefined,
    limit: 200,
  });

  // Mutácie sú viazané na kauzu vybraného konania — po zmene sa musí obnoviť
  // aj jej detail, nielen tento zoznam.
  const { items: courts } = useCodelist("court");
  const save = usePatchProceeding(editing?.case_id);
  const remove = useDeleteProceeding(deleting?.case_id);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const items = data.items ?? [];
  const courtOptions = [...new Set([...courts.map((c) => c.name), ...(data.courts ?? [])])].sort();

  return (
    <>
      <PageHeader
        title="Súdne konania"
        subtitle={`${data.total} ${data.total === 1 ? "konanie" : "konaní"} naprieč kauzami`}
      />

      <div className="card mb-3">
        <div className="card-body d-flex flex-wrap gap-2 align-items-end">
          <div className="flex-grow-1" style={{ minWidth: "16rem" }}>
            <label className="form-label small mb-1">Spisová značka alebo súd</label>
            <input
              className="form-control font-monospace"
              value={filters.q}
              placeholder="2T/45/2025"
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </div>
          <div>
            <label className="form-label small mb-1">Súd</label>
            <select
              className="form-select"
              value={filters.court}
              onChange={(event) => setFilters({ ...filters, court: event.target.value })}
            >
              <option value="">všetky súdy</option>
              {/* Číselník aj to, čo je naozaj zapísané v konaniach: súd mimo
                  číselníka musí byť vo filtri, inak by sa jeho konania stratili. */}
              {courtOptions.map((court) => (
                <option key={court} value={court}>{court}</option>
              ))}
            </select>
          </div>
          {(filters.q || filters.court) && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setFilters({ q: "", court: "" })}
            >
              Zrušiť filter
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nič sa nenašlo"
          hint="Konanie sa zakladá v detaile kauzy, na záložke Konania — bez kauzy nemá kam patriť."
        />
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th>Spisová značka</th>
                <th>Súd</th>
                <th>Kauza</th>
                <th>Fáza</th>
                <th className="text-end">Zdroje</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.file_number}</code></td>
                  <td>{item.court}</td>
                  <td>
                    {item.case_id ? (
                      <Link to={`/kauzy/${item.case_id}/konania`} className="text-decoration-none">
                        {item.case?.name ?? item.case?.title ?? item.case_id}
                      </Link>
                    ) : (
                      <span className="text-body-secondary">—</span>
                    )}
                  </td>
                  <td><PhaseBadge phase={item.phase} /></td>
                  <td className="text-end">
                    <span className={`badge ${(item.sources ?? []).length === 0 ? "text-bg-danger" : "text-bg-light border"}`}>
                      {(item.sources ?? []).length}
                    </span>
                  </td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm">
                      <button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(item)}>
                        Upraviť
                      </button>
                      <button className="btn btn-outline-danger" type="button" onClick={() => setDeleting(item)}>
                        Odstrániť
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Upraviť konanie {editing.file_number}</h5>
                <button className="btn-close" type="button" onClick={() => setEditing(null)} aria-label="Zavrieť" />
              </div>
              <div className="modal-body">
                <ProceedingForm
                  initial={editing}
                  requireReason
                  submitLabel="Uložiť zmenu"
                  busy={save.isPending}
                  error={save.error}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (body) => {
                    await save.mutateAsync({ id: editing.id, ...body });
                    setEditing(null);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <DeleteDialog
          title="Odstrániť konanie"
          warning={`Konanie ${deleting.file_number} zmizne aj z detailu kauzy.`}
          busy={remove.isPending}
          error={remove.error}
          onCancel={() => setDeleting(null)}
          onConfirm={async (reason) => {
            await remove.mutateAsync({ id: deleting.id, reason });
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

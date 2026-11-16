// Editor zdrojovanej hodnoty — nosný komponent administrácie (zadanie §6).
//
// Ak bude ťažkopádny, moderátori budú obchádzať pravidlá alebo prestanú
// prispievať. Preto: hodnota hore, zdroje hneď pod ňou ako čipy, a pole bez
// zdroja je **vizuálne rozbité** v momente, keď taký stav vznikne — nie tichá
// validácia až pri uložení.
//
// Tvar hodnoty je `{ value, unit?, sources[], derived, derivation, disputed[],
// asserted_at }` a rovnaký je pre text, sumu, stav aj dátum.

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { get } from "./api/client.js";
import { useArticles, useCreateArticle } from "./api/queries.js";
import { EmptyState, SourceState, formatDate, formatMoment, money, useEscape } from "./ui.jsx";

/** Prázdna zdrojovaná hodnota. */
export const emptySourced = (value = "") => ({
  value,
  sources: [],
  derived: false,
  derivation: null,
  disputed: [],
  asserted_at: null,
});

/** Načíta metadáta článkov pre čipy. React Query dotazy deduplikuje. */
export function useArticleSummaries(ids) {
  const results = useQueries({
    queries: (ids ?? []).map((id) => ({
      queryKey: ["admin", "article", id],
      queryFn: () => get(`/admin/articles/${id}`),
      staleTime: 5 * 60_000,
    })),
  });

  return useMemo(() => {
    const map = {};
    results.forEach((result, index) => {
      const article = result.data?.article;
      if (article) map[ids[index]] = article;
    });
    return map;
  }, [results, ids]);
}

export function SourceChip({ id, article, onRemove }) {
  const label = article
    ? `${article.publisher ?? "?"} · ${formatDate(article.published_at)}`
    : id.slice(0, 20) + "…";

  return (
    <span
      className={`badge d-inline-flex align-items-center gap-1 ${
        article?.kind === "official" ? "text-bg-primary" : "text-bg-light border"
      }`}
      title={article?.title ?? id}
    >
      {article?.kind === "official" && <span aria-hidden="true">§</span>}
      {article?.url ? (
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer noopener"
          className={article.kind === "official" ? "link-light" : "link-body-emphasis"}
        >
          {label}
        </a>
      ) : (
        label
      )}
      {onRemove && (
        <button
          type="button"
          className="btn-close btn-close-sm ms-1"
          style={{ fontSize: ".5rem" }}
          aria-label="Odobrať zdroj"
          onClick={() => onRemove(id)}
        />
      )}
    </span>
  );
}

/**
 * Výber zdroja. Zdroj sa pridáva **vyhľadaním medzi uloženými článkami**, nie
 * vpisovaním URL — tým sa zabráni duplicitám. Ak zdroj v systéme nie je, dá sa
 * tu založiť a rovno pripojiť.
 */
export function SourcePicker({ onPick, onClose }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, isFetching } = useArticles({ q: q.length >= 2 ? q : undefined, limit: 8 });
  useEscape(onClose);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Pripojiť zdroj</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>

          <div className="modal-body">
            {creating ? (
              <NewSourceForm
                onCreated={(article) => {
                  onPick(article.id ?? article._id);
                  onClose();
                }}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <>
                <input
                  className="form-control mb-3"
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Hľadaj v uložených článkoch a úradných dokumentoch…"
                />

                {isFetching && <p className="text-body-secondary small">Hľadám…</p>}

                <div className="list-group list-group-flush">
                  {(data?.items ?? []).map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      className="list-group-item list-group-item-action"
                      onClick={() => {
                        onPick(article.id);
                        onClose();
                      }}
                    >
                      <div className="d-flex justify-content-between gap-2">
                        <span className="fw-semibold">{article.title}</span>
                        {article.kind === "official" && (
                          <span className="badge text-bg-primary">úradný</span>
                        )}
                      </div>
                      <div className="small text-body-secondary">
                        {article.publisher} · {formatMoment(article.published_at)}
                      </div>
                    </button>
                  ))}
                </div>

                {!isFetching && (data?.items ?? []).length === 0 && (
                  <EmptyState
                    title="Nič také tu zatiaľ nie je"
                    hint="Ak zdroj v systéme chýba, založ ho — pripojí sa rovno k tomuto údaju."
                  />
                )}
              </>
            )}
          </div>

          {!creating && (
            <div className="modal-footer justify-content-between">
              <button className="btn btn-outline-primary" type="button" onClick={() => setCreating(true)}>
                Pridať úradný dokument
              </button>
              <button className="btn btn-outline-secondary" type="button" onClick={onClose}>
                Zavrieť
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewSourceForm({ onCreated, onCancel }) {
  const create = useCreateArticle();
  const [form, setForm] = useState({
    kind: "official",
    url: "",
    title: "",
    publisher: "",
    published_at: "",
    excerpt: "",
  });

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await create.mutateAsync({
          ...form,
          published_at: new Date(form.published_at).toISOString(),
          case_ids: [],
          person_ids: [],
        });
        onCreated(result.article);
      }}
    >
      <div className="row g-2">
        <div className="col-12">
          <label className="form-label">Odkaz na originál</label>
          <input className="form-control" type="url" required value={form.url} onChange={set("url")} />
        </div>
        <div className="col-12">
          <label className="form-label">Názov</label>
          <input className="form-control" required minLength={3} value={form.title} onChange={set("title")} />
        </div>
        <div className="col-md-7">
          <label className="form-label">Vydavateľ / úrad</label>
          <input className="form-control" required value={form.publisher} onChange={set("publisher")} />
        </div>
        <div className="col-md-5">
          <label className="form-label">Dátum vydania</label>
          <input className="form-control" type="date" required value={form.published_at} onChange={set("published_at")} />
        </div>
        <div className="col-md-5">
          <label className="form-label">Typ</label>
          <select className="form-select" value={form.kind} onChange={set("kind")}>
            <option value="official">úradný dokument</option>
            <option value="media">médium</option>
          </select>
        </div>
        <div className="col-12">
          <label className="form-label">Výňatok (nepovinné)</label>
          <textarea className="form-control" rows={2} value={form.excerpt} onChange={set("excerpt")} />
        </div>
      </div>

      {create.isError && <div className="alert alert-danger mt-3 py-2">{create.error.message}</div>}

      <div className="d-flex gap-2 mt-3">
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Zakladám…" : "Založiť a pripojiť"}
        </button>
        <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>
          Späť na vyhľadávanie
        </button>
      </div>
    </form>
  );
}

function ValueInput({ type, value, options, onChange, disabled }) {
  if (type === "multiselect") {
    // Poradie má význam: prvý vybraný je hlavný (druh kauzy na karte a v Mape).
    const chosen = Array.isArray(value) ? value : [];
    const toggle = (code) =>
      onChange(chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code]);
    return (
      <div className="d-flex flex-wrap gap-2">
        {options.map((option) => {
          const at = chosen.indexOf(option.value);
          return (
            <button
              key={option.value} type="button" disabled={disabled}
              className={`btn btn-sm ${at >= 0 ? "btn-primary" : "btn-outline-secondary"}`}
              aria-pressed={at >= 0}
              onClick={() => toggle(option.value)}
            >
              {option.label}
              {at === 0 && <span className="badge text-bg-light ms-1">hlavný</span>}
            </button>
          );
        })}
      </div>
    );
  }
  if (type === "impact") {
    // Dopad kauzy bez sumy: číslo, jednotka a krátka poznámka.
    const current = value && typeof value === "object" ? value : null;
    const set = (key) => (e) => {
      const next = { value: current?.value ?? null, unit: current?.unit ?? "", note: current?.note ?? "", [key]: e.target.value };
      if (key === "value") next.value = e.target.value === "" ? null : Number(e.target.value);
      onChange(next.value === null && !next.unit && !next.note ? null : next);
    };
    return (
      <div className="row g-2">
        <div className="col-sm-3">
          <input className="form-control" type="number" min="0" step="any" disabled={disabled}
            aria-label="Číslo" placeholder="6"
            value={typeof current?.value === "number" ? current.value : ""} onChange={set("value")} />
        </div>
        <div className="col-sm-4">
          <input className="form-control" disabled={disabled} aria-label="Jednotka"
            placeholder="odvolaných vyšetrovateľov" value={current?.unit ?? ""} onChange={set("unit")} />
        </div>
        <div className="col-sm-5">
          <input className="form-control" disabled={disabled} aria-label="Poznámka"
            placeholder="2 zrušené obvinenia politikov" value={current?.note ?? ""} onChange={set("note")} />
        </div>
      </div>
    );
  }
  if (type === "select") {
    return (
      <select className="form-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  if (type === "money") {
    return (
      <div className="input-group">
        <input
          className="form-control" type="number" min="0" step="1" disabled={disabled}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
        <span className="input-group-text">centov</span>
        <span className="input-group-text bg-body-tertiary">{money(value)}</span>
      </div>
    );
  }
  if (type === "textarea") {
    return (
      <textarea
        className="form-control" rows={4} disabled={disabled}
        value={value ?? ""} onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (type === "date") {
    return (
      <input
        className="form-control" type="date" disabled={disabled}
        value={value ?? ""} onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="form-control" disabled={disabled}
      value={value ?? ""} onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * @param {object} props
 * @param {string} props.label
 * @param {any} props.field        zdrojovaná hodnota
 * @param {(next: any) => void} props.onChange
 * @param {"text"|"textarea"|"money"|"select"|"multiselect"|"impact"|"date"} [props.type]
 * @param {Array<{value: string, label: string}>} [props.options]
 * @param {boolean} [props.readOnly]
 */
export function SourcedField({ label, field, onChange, type = "text", options = [], readOnly = false }) {
  const [picker, setPicker] = useState(null); // null | "main" | index sporu
  const value = field ?? emptySourced(type === "multiselect" ? [] : type === "money" || type === "impact" ? null : "");
  const articles = useArticleSummaries([
    ...value.sources,
    ...(value.disputed ?? []).flatMap((alt) => alt.sources ?? []),
  ]);

  const unsourced = value.sources.length === 0;
  const hasOfficial = value.sources.some((id) => articles[id]?.kind === "official");

  const update = (partial) => onChange({ ...value, ...partial });

  const addSource = (target) => (id) => {
    if (target === "main") {
      if (value.sources.includes(id)) return;
      update({ sources: [...value.sources, id] });
      return;
    }
    const disputed = [...value.disputed];
    disputed[target] = { ...disputed[target], sources: [...(disputed[target].sources ?? []), id] };
    update({ disputed });
  };

  return (
    <div
      className={`card mb-3 ${unsourced ? "border-danger" : value.derived ? "border-warning" : ""}`}
      style={value.derived ? { background: "rgba(255,193,7,.05)" } : undefined}
    >
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
          <label className="form-label mb-0 fw-semibold">{label}</label>
          <SourceState sources={value.sources} derived={value.derived} />
        </div>

        <ValueInput
          type={type}
          value={value.value}
          options={options}
          disabled={readOnly}
          onChange={(next) => update({ value: next })}
        />

        {/* Zdroje sú hneď pod hodnotou, nie schované v poznámke pod čiarou. */}
        <div className="d-flex flex-wrap gap-1 align-items-center mt-2">
          {value.sources.map((id) => (
            <SourceChip
              key={id}
              id={id}
              article={articles[id]}
              onRemove={readOnly ? null : (removed) =>
                update({ sources: value.sources.filter((s) => s !== removed) })}
            />
          ))}

          {!readOnly && (
            <button className="btn btn-sm btn-outline-secondary py-0" type="button" onClick={() => setPicker("main")}>
              + zdroj
            </button>
          )}
        </div>

        {unsourced && (
          <p className="text-danger small mb-0 mt-2">
            Bez zdroja sa tento údaj nezverejní. Kauzu s ním nepôjde publikovať.
          </p>
        )}

        {hasOfficial && (
          <p className="text-body-secondary small mb-0 mt-2">
            Medzi zdrojmi je úradný dokument — pri rozpore s médiom má prednosť.
          </p>
        )}

        {/* Rozpor: alternatívna hodnota je rovnocenná, nie poznámka. */}
        {(value.disputed ?? []).map((alt, index) => (
          <div key={index} className="border-start border-3 ps-3 mt-3">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="small fw-semibold text-body-secondary">Iný zdroj uvádza</span>
              {!readOnly && (
                <button
                  className="btn btn-sm btn-link text-danger p-0"
                  type="button"
                  onClick={() => update({ disputed: value.disputed.filter((_, i) => i !== index) })}
                >
                  odobrať
                </button>
              )}
            </div>
            <ValueInput
              type={type}
              value={alt.value}
              options={options}
              disabled={readOnly}
              onChange={(next) => {
                const disputed = [...value.disputed];
                disputed[index] = { ...alt, value: next };
                update({ disputed });
              }}
            />
            <div className="d-flex flex-wrap gap-1 align-items-center mt-2">
              {(alt.sources ?? []).map((id) => (
                <SourceChip key={id} id={id} article={articles[id]} />
              ))}
              {!readOnly && (
                <button className="btn btn-sm btn-outline-secondary py-0" type="button" onClick={() => setPicker(index)}>
                  + zdroj
                </button>
              )}
            </div>
          </div>
        ))}

        {!readOnly && (
          <div className="d-flex flex-wrap gap-3 align-items-center mt-3 pt-2 border-top">
            <button
              className="btn btn-sm btn-link p-0"
              type="button"
              onClick={() => update({ disputed: [...(value.disputed ?? []), { value: value.value, sources: [] }] })}
            >
              Zdroje sa rozchádzajú
            </button>

            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input" type="checkbox" id={`derived-${label}`}
                checked={!!value.derived}
                onChange={(e) => update({ derived: e.target.checked, derivation: e.target.checked ? value.derivation ?? "" : null })}
              />
              <label className="form-check-label small" htmlFor={`derived-${label}`}>
                toto sme odvodili sami
              </label>
            </div>
          </div>
        )}

        {value.derived && (
          <div className="mt-2">
            <p className="small text-body-secondary mb-1">
              Odvodené údaje sú naše tvrdenie, nie citácia. Popíš, ako si k hodnote došiel.
            </p>
            <textarea
              className={`form-control ${!value.derivation ? "border-danger" : ""}`}
              rows={2} disabled={readOnly}
              value={value.derivation ?? ""}
              onChange={(e) => update({ derivation: e.target.value })}
              placeholder="napr. súčet troch zmlúv z CRZ, čísla 12/2023, 44/2023 a 51/2024"
            />
          </div>
        )}
      </div>

      {picker !== null && <SourcePicker onPick={addSource(picker)} onClose={() => setPicker(null)} />}
    </div>
  );
}

/**
 * Kontrolný zoznam pred publikovaním. Kým nie je prázdny, tlačidlo Publikovať
 * nefunguje — a hovorí prečo, skôr než na to isté pravidlo používateľ narazí
 * ako na chybu servera z `validate_doc_update`.
 *
 * @param {Record<string, any>} doc
 * @returns {string[]} názvy polí bez zdroja
 */
export function unsourcedFields(doc) {
  return Object.entries(doc ?? {})
    .filter(([key, value]) =>
      key[0] !== "_" &&
      value && typeof value === "object" && Array.isArray(value.sources) &&
      value.sources.length === 0)
    .map(([key]) => key);
}

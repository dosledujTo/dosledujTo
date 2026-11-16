// Vyhľadávacie polia do formulárov.
//
// Predtým sa osoba vyberala z rozbaľovacieho zoznamu prvých sto osôb a zdroje
// sa vpisovali ako `article:0192…` oddelené čiarkou. Pri tridsiatich osobách to
// ešte fungovalo; pri tisícke to je nepoužiteľné a identifikátor opísaný rukou
// je hlavne pozvánka na preklep.
//
// Preto tu sú dve polia, ktoré používajú všetky formuláre:
//   - `EntityPicker` — našepkávač nad osobami, subjektmi a kauzami,
//   - `SourcesField` — zdroje ako čipy, pridávané tým istým vyhľadávaním
//     zdrojov, aké má editor zdrojovanej hodnoty.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCases, useCreateEntity, useOrgs, usePersons } from "./api/queries.js";
import { SourceChip, SourcePicker, useArticleSummaries } from "./sourced.jsx";
import { slugify, useEscape } from "./ui.jsx";

/** Písanie predbieha sieť — bez zdržania by každý znak poslal dotaz. */
function useDebounced(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const KINDS = {
  person: {
    hook: usePersons, label: "osobu", empty: "Takú osobu nemáme",
    create: "novú osobu", title: "Nová osoba", nameLabel: "Celé meno",
    body: (name, slug) => ({ full_name: name, slug, name_variants: [] }),
    pick: (result) => result.person,
  },
  org: {
    hook: useOrgs, label: "subjekt", empty: "Taký subjekt nemáme",
    create: "nový subjekt", title: "Nový subjekt", nameLabel: "Názov",
    body: (name, slug, extra) => ({ name, slug, kind: extra.kind ?? "company", name_variants: [] }),
    pick: (result) => result.org,
    extra: [{ key: "kind", label: "Druh", options: [
      ["company", "firma"], ["party", "politická strana"], ["institution", "inštitúcia"],
    ] }],
  },
  case: {
    hook: useCases, label: "kauzu", empty: "Takú kauzu nemáme",
    create: "novú kauzu", title: "Nová kauza", nameLabel: "Názov kauzy",
    body: (name, slug) => ({ title: name, slug, tags: [] }),
    pick: (result) => result.case,
  },
};

/**
 * Založenie záznamu priamo z našepkávača (zadanie §5).
 *
 * Moderátor pri priraďovaní zisťuje, že osoba ešte v registri nie je — a
 * odchod na inú obrazovku znamená stratiť rozrobené priradenie. Vzniká vždy
 * **koncept**: je to len meno a adresa, žiadny publikovateľný údaj.
 */
function CreateEntityDialog({ kind, initialName = "", onCreated, onCancel }) {
  const config = KINDS[kind] ?? KINDS.person;
  const create = useCreateEntity(kind);
  const fieldId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState("");
  const [extra, setExtra] = useState({});
  useEscape(onCancel);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-dialog-centered">
        <form
          className="modal-content"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await create.mutateAsync(
              config.body(name.trim(), slug.trim() || slugify(name), extra),
            );
            onCreated(config.pick(result));
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">{config.title}</h5>
            <button className="btn-close" type="button" onClick={onCancel} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <p className="small text-body-secondary">
              Vzniká ako <strong>koncept</strong> — verejná časť ho neuvidí, kým ho niekto
              nepublikuje. Priradenie, ktoré máš rozrobené, zostáva.
            </p>

            <label className="form-label small mb-1" htmlFor={`${fieldId}-name`}>
              {config.nameLabel}
            </label>
            <input
              id={`${fieldId}-name`}
              className="form-control" autoFocus required minLength={3}
              value={name} onChange={(event) => setName(event.target.value)}
            />

            <label className="form-label small mb-1 mt-3" htmlFor={`${fieldId}-slug`}>
              Adresa (slug)
            </label>
            <input
              id={`${fieldId}-slug`}
              className="form-control font-monospace"
              value={slug} placeholder={slugify(name)}
              onChange={(event) => setSlug(event.target.value)}
            />
            <div className="form-text">Odvodí sa z názvu, ak ju nevyplníš. Neskôr sa už nemení.</div>

            {(config.extra ?? []).map((field) => (
              <div key={field.key}>
                <label className="form-label small mb-1 mt-3" htmlFor={`${fieldId}-${field.key}`}>
                  {field.label}
                </label>
                <select
                  id={`${fieldId}-${field.key}`}
                  className="form-select"
                  value={extra[field.key] ?? field.options[0][0]}
                  onChange={(event) => setExtra({ ...extra, [field.key]: event.target.value })}
                >
                  {field.options.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            ))}

            {create.isError && <div className="alert alert-danger py-2 mt-3 mb-0">{create.error.message}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Zrušiť</button>
            <button className="btn btn-primary" type="submit" disabled={create.isPending || name.trim().length < 3}>
              {create.isPending ? "Zakladám…" : "Založiť"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Našepkávač nad entitami. Kým nie je nič vybraté, je to vyhľadávacie pole;
 * po výbere sa zmení na meno s krížikom, aby bolo na prvý pohľad vidieť, čo je
 * vybraté — nie identifikátor.
 *
 * @param {object} props
 * @param {"person"|"org"|"case"} [props.kind]
 * @param {string} props.value              id vybranej entity ("" = nič)
 * @param {string} [props.valueLabel]       meno, ak ho volajúci už pozná
 * @param {(id: string, item: any) => void} props.onChange
 * @param {string} [props.placeholder]
 * @param {boolean} [props.autoFocus]
 * @param {boolean} [props.allowCreate]  ponúkne založiť záznam, ktorý ešte nie je
 */
export function EntityPicker({
  kind = "person", value, valueLabel, onChange, placeholder, autoFocus = false,
  allowCreate = false,
}) {
  const config = KINDS[kind] ?? KINDS.person;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(null);
  const [picked, setPicked] = useState(valueLabel ?? null);
  const boxRef = useRef(null);
  const listId = useId();

  const debounced = useDebounced(q);
  const { data, isFetching } = config.hook(
    debounced.length >= 2 ? { q: debounced, limit: 8 } : { limit: 8 },
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  // Kliknutie mimo zavrie ponuku. Bez toho ostane visieť nad zvyškom formulára.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const choose = (item) => {
    setPicked(item.title ?? item.name ?? item.id);
    setQ("");
    setOpen(false);
    onChange(item.id, item);
  };

  const clear = () => {
    setPicked(null);
    onChange("", null);
  };

  if (value && picked) {
    return (
      <div className="d-flex align-items-center gap-2 form-control bg-body-tertiary">
        <span className="fw-semibold text-truncate">{picked}</span>
        <button
          type="button"
          className="btn-close btn-close-sm ms-auto"
          aria-label={`Zrušiť výber (${picked})`}
          onClick={clear}
        />
      </div>
    );
  }

  return (
    <div className="position-relative" ref={boxRef}>
      <input
        className="form-control"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder ?? `Začni písať a vyber ${config.label}…`}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQ(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter" && open && items[active]) {
            // Vo formulári by Enter inak odoslal celý formulár s prázdnym výberom.
            event.preventDefault();
            choose(items[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="list-group position-absolute w-100 shadow"
          style={{ zIndex: 1080, maxHeight: "16rem", overflowY: "auto" }}
        >
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={`list-group-item list-group-item-action text-start ${index === active ? "active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
              >
                <span className="fw-semibold">{item.title}</span>
                {item.publish_state && item.publish_state !== "published" && (
                  <span className="badge text-bg-light border ms-2">{item.publish_state}</span>
                )}
              </button>
            </li>
          ))}

          {items.length === 0 && (
            <li className="list-group-item text-body-secondary small">
              {isFetching ? "Hľadám…" : config.empty}
            </li>
          )}

          {/* Záznam, ktorý v registri ešte nie je, sa založí odtiaľto —
              odchod na inú obrazovku by znamenal stratiť rozrobené priradenie. */}
          {allowCreate && config.create && (
            <li>
              <button
                type="button"
                className="list-group-item list-group-item-action text-start text-primary"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setCreating(q.trim());
                  setOpen(false);
                }}
              >
                + založiť {config.create}{q.trim() && <> „{q.trim()}“</>}
              </button>
            </li>
          )}
        </ul>
      )}

      {creating !== null && (
        <CreateEntityDialog
          kind={kind}
          initialName={creating}
          onCancel={() => setCreating(null)}
          onCreated={(created) => {
            setCreating(null);
            choose({ ...created, title: created.title ?? created.full_name ?? created.name });
          }}
        />
      )}
    </div>
  );
}

/**
 * Zdroje ako čipy. Rovnaké vyhľadávanie ako v editore zdrojovanej hodnoty —
 * moderátor sa nemá učiť dva spôsoby pridania zdroja podľa toho, na ktorej
 * záložke stojí.
 *
 * Prázdny zoznam je červený hneď, nie až po odoslaní: tvrdenie o človeku bez
 * zdroja sa nezapisuje.
 *
 * @param {object} props
 * @param {string[]} props.value
 * @param {(next: string[]) => void} props.onChange
 * @param {string} [props.label]
 * @param {string} [props.hint]
 */
export function SourcesField({ value = [], onChange, label = "Zdroje", hint }) {
  const [picking, setPicking] = useState(false);
  const articles = useArticleSummaries(value);
  const empty = value.length === 0;

  return (
    <div>
      <label className="form-label small mb-1">{label}</label>
      <div className={`form-control d-flex flex-wrap gap-1 align-items-center ${empty ? "border-danger" : ""}`}
        style={{ minHeight: "2.4rem" }}
      >
        {value.map((id) => (
          <SourceChip
            key={id}
            id={id}
            article={articles[id]}
            onRemove={(removed) => onChange(value.filter((s) => s !== removed))}
          />
        ))}

        <button
          className="btn btn-sm btn-outline-secondary py-0 ms-auto"
          type="button"
          onClick={() => setPicking(true)}
        >
          + zdroj
        </button>
      </div>

      {empty ? (
        <div className="form-text text-danger">
          {hint ?? "Bez zdroja sa záznam nezapíše."}
        </div>
      ) : (
        hint && <div className="form-text">{hint}</div>
      )}

      {picking && (
        <SourcePicker
          onPick={(id) => {
            if (!value.includes(id)) onChange([...value, id]);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/**
 * Potvrdenie zmazania. Dôvod je povinný — dokument zmizne, ale záznam o tom,
 * kto ho zmazal a prečo, zostáva v histórii.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.warning]
 * @param {(reason: string) => Promise<void>|void} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.busy]
 * @param {Error|null} [props.error]
 */
export function DeleteDialog({ title, warning, onConfirm, onCancel, busy = false, error = null }) {
  const [reason, setReason] = useState("");
  useEscape(onCancel);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog">
        <form
          className="modal-content"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(reason);
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button className="btn-close" type="button" onClick={onCancel} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            {warning && <div className="alert alert-warning py-2 small">{warning}</div>}
            <label className="form-label">Dôvod zmazania</label>
            <input
              className="form-control"
              autoFocus
              required
              minLength={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="napr. duplicitný záznam"
            />
            <div className="form-text">Zostane v histórii aj po zmazaní záznamu.</div>
            {error && <div className="alert alert-danger py-2 mt-3 mb-0">{error.message}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Zrušiť</button>
            <button className="btn btn-danger" type="submit" disabled={busy || reason.trim().length < 3}>
              {busy ? "Mažem…" : "Zmazať"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

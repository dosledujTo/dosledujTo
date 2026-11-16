// Čítanie číselníka vo formulároch (zadanie §9).
//
// Formulár nikdy nesiahne po `useCodelists` priamo: potrebuje aktívne položky
// jedného druhu a slovenský názov ku kódu, nie celú obrazovku číselníkov.
//
// Dve pravidlá, ktoré sa dajú ľahko porušiť:
//   - **hodnota, ktorá už v dokumente je, musí zostať vybrateľná**, aj keď ju
//     medzitým niekto deaktivoval alebo v číselníku nikdy nebola. Inak by
//     otvorenie formulára ticho prepísalo údaj, ktorý nikto meniť nechcel;
//   - **prázdny číselník neblokuje prácu**. Kým ho admin nenaplní, ponuka je
//     prázdna a moderátor napíše hodnotu ako doteraz.

import { useCodelists } from "./api/queries.js";

/**
 * @param {"court"|"case_tag"|"event_category"|"link_type"} kind
 */
export function useCodelist(kind) {
  const { data, isLoading } = useCodelists({ kind });
  const group = data?.groups?.find((item) => item.kind === kind);
  const items = group?.items ?? [];
  const active = items.filter((item) => item.active !== false);

  return {
    isLoading,
    /** Aktívne položky v poradí, v akom ich má formulár ponúkať. */
    items: active,
    /** Všetky vrátane neaktívnych — na pomenovanie hodnoty, ktorá už je zapísaná. */
    all: items,
    /** Slovenský názov ku kódu; neznámy kód sa vráti taký, aký je. */
    label: (code) => items.find((item) => item.code === code)?.name ?? code ?? "—",
  };
}

/**
 * Select nad číselníkom. `by` hovorí, čo sa zapisuje do dokumentu: kód
 * (`case.tags[]`, `event.category`) alebo názov (`proceeding.court`).
 */
export function CodelistSelect({ kind, value, onChange, by = "code", id, required, className }) {
  const { items, all } = useCodelist(kind);
  const valueOf = (item) => (by === "name" ? item.name : item.code);

  // Zapísaná hodnota, ktorú ponuka nepozná — pridá sa na koniec, nie zahodí.
  const known = items.some((item) => valueOf(item) === value);
  const stale = all.find((item) => valueOf(item) === value);

  return (
    <select
      id={id}
      className={className ?? "form-select"}
      value={value ?? ""}
      required={required}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">— vyber —</option>
      {items.map((item) => (
        <option key={item.id} value={valueOf(item)}>{item.name}</option>
      ))}
      {!known && value && (
        <option value={value}>
          {stale ? `${stale.name} (neaktívne)` : `${value} (mimo číselníka)`}
        </option>
      )}
    </select>
  );
}

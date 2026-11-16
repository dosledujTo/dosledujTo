// Číselníky: súdy, tagy káuz, kategórie udalostí, typy prepojení (zadanie §9),
// fázy konania so segmentom metriky a druhy káuz (redizajn „Červená niť", kap. 6.1).
//
// Obrazovka stojí na rozdiele, ktorý číselníky v tomto produkte majú a inde
// nebýva: **dva z nich si obsah určujú samy, dva sú viazané na enum v databáze.**
// Súd a tag sú v dokumente obyčajný reťazec, takže číselník je jediné miesto,
// kde vznikajú — a preto sa podľa nich dá filtrovať. Kategória udalosti a typ
// prepojenia majú hodnoty pevne dané vo `validate_doc_update`; tu k nim pribudne
// slovenský názov a poradie v ponuke, nič viac. Pridávať do nich hodnoty by
// znamenalo klamať: databáza by dokument s takou hodnotou odmietla.
//
// Preto tu nie je mazanie. Položka, na ktorú niečo odkazuje, sa **deaktivuje** —
// prestane sa ponúkať, ale kauzy a konania, ktoré ju nesú, zostanú čitateľné.
// Je to ten istý rozdiel ako medzi ukončením a zmazaním role.

import { useState } from "react";
import { useCodelists, useCreateCodelistItem, usePatchCodelistItem } from "../api/queries.js";
import { PageHeader } from "../layout.jsx";
import { EmptyState, ErrorState, Notice, ReasonDialog, Spinner } from "../ui.jsx";

const emptyForm = { code: "", name: "", short_name: "", note: "", sort: 100, bucket: "" };

// Segment metriky „Peniaze v kauzách" pre fázu konania. Mapovanie je v číselníku,
// nie v kóde, aby ho vedel moderátor upraviť bez nasadenia.
const BUCKETS = [
  ["none", "bez trestného konania"], ["investigation", "vyšetrovanie"], ["charge", "obvinenie"],
  ["trial", "obžaloba a súd"], ["convicted", "právoplatné odsúdenie"], ["acquitted", "oslobodenie"],
  ["discontinued", "zastavené alebo zrušené"], ["lapsed", "premlčané alebo odložené"],
];

export function Codelists() {
  const { data, isLoading, error, refetch } = useCodelists();
  const create = useCreateCodelistItem();
  const patch = usePatchCodelistItem();

  const [kind, setKind] = useState("court");
  const [form, setForm] = useState(emptyForm);
  const [renaming, setRenaming] = useState(null);
  // Každá zmena číselníka ide do auditu s dôvodom, tak ako zmena kauzy.
  const [pending, setPending] = useState(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const groups = data?.groups ?? [];
  const group = groups.find((item) => item.kind === kind) ?? groups[0];
  if (!group) return <ErrorState error={new Error("číselníky sa nenačítali")} onRetry={refetch} />;

  const bound = group.bound_to_enum;
  const busy = create.isPending || patch.isPending;
  const set = (field) => (event) =>
    setForm({ ...form, [field]: field === "sort" ? Number(event.target.value) : event.target.value });

  const switchKind = (next) => {
    setKind(next);
    setForm(emptyForm);
    setRenaming(null);
  };

  const apply = async (reason) => {
    try {
      await pending.run(reason);
      if (pending.after) pending.after();
    } catch {
      // Hlášku z backendu ukáže Notice nad tabuľkou — dialóg by ju prekryl.
    }
    setPending(null);
  };

  const addItem = () =>
    setPending({
      title: `Pridanie položky do číselníka ${group.label.toLowerCase()}`,
      hint: "Jedna veta, ktorá zostane v histórii zmien číselníka.",
      run: (reason) =>
        create.mutateAsync({
          kind: group.kind,
          code: form.code.trim(),
          name: form.name.trim(),
          short_name: form.short_name.trim() || null,
          note: form.note.trim() || null,
          sort: form.sort,
          ...(group.kind === "phase" ? { bucket: form.bucket } : {}),
          reason,
        }),
      after: () => setForm(emptyForm),
    });

  return (
    <>
      <PageHeader
        title="Číselníky"
        subtitle="Súdy, tagy káuz, kategórie udalostí, typy prepojení, fázy konania, druhy káuz"
      />

      <ul className="nav nav-pills mb-3 gap-1">
        {groups.map((item) => (
          <li className="nav-item" key={item.kind}>
            <button
              type="button"
              className={`nav-link ${item.kind === group.kind ? "active" : ""}`}
              onClick={() => switchKind(item.kind)}
            >
              {item.label}
              <span className="badge text-bg-light border ms-2">{item.items.length}</span>
            </button>
          </li>
        ))}
      </ul>

      {(create.error || patch.error) && (
        <Notice tone="danger">{(create.error ?? patch.error).message}</Notice>
      )}

      <div className="card mb-3">
        <div className="card-body">
          <p className="mb-1">{group.hint}</p>
          <p className="small text-body-secondary mb-0">
            Hodnota sa zapisuje do <code>{group.field}</code>.
            {bound && (
              <>
                {" "}Zoznam kódov drží <code>validate_doc_update</code>, takže sem sa nedá pridať
                hodnota, ktorú by databáza odmietla: <code>{bound.join(", ")}</code>.
              </>
            )}
          </p>
        </div>
      </div>

      {group.kind === "court" && (data?.unlisted_courts ?? []).length > 0 && (
        <Notice tone="warning">
          <div>
            <strong>Mimo číselníka:</strong> v konaniach sú zapísané súdy, ktoré tu nie sú —{" "}
            {data.unlisted_courts.join(", ")}. Kým to platí, filter podľa súdu je len taký spoľahlivý
            ako preklepy v ňom. Doplň ich nižšie presne v tom znení, v akom sú v konaniach.
          </div>
        </Notice>
      )}

      {bound && group.missing.length > 0 && (
        <Notice tone="info">
          <div>
            <strong>Bez slovenského názvu:</strong> {group.missing.join(", ")}. Kým názov chýba,
            formuláre ukazujú holý kód.
          </div>
        </Notice>
      )}

      <div className="table-responsive card mb-3">
        <table className="table align-middle mb-0">
          <thead className="table-light">
            <tr className="small text-body-secondary">
              <th>Názov</th><th>Skratka</th><th>Kód</th>
              {group.kind === "phase" && <th>Segment metriky</th>}
              <th>Poradie</th><th>Použitie</th><th>Stav</th><th />
            </tr>
          </thead>
          <tbody>
            {group.items.length === 0 && (
              <tr>
                <td colSpan={group.kind === "phase" ? 8 : 7}>
                  <EmptyState
                    title="Číselník je prázdny"
                    hint="Kým je prázdny, formuláre ponúkajú voľný text — a podľa voľného textu sa nedá filtrovať."
                  />
                </td>
              </tr>
            )}
            {group.items.map((item) => (
              <tr key={item.id} className={item.active ? "" : "opacity-50"}>
                <td>
                  {renaming?.id === item.id ? (
                    <div className="d-flex gap-2">
                      <input
                        className="form-control form-control-sm"
                        value={renaming.name}
                        autoFocus
                        onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                      />
                      <button
                        className="btn btn-sm btn-outline-primary"
                        type="button"
                        disabled={busy || renaming.name.trim().length < 2 || renaming.name.trim() === item.name}
                        onClick={() =>
                          setPending({
                            title: "Premenovanie položky",
                            run: (reason) =>
                              patch.mutateAsync({ id: item.id, name: renaming.name.trim(), reason }),
                            after: () => setRenaming(null),
                          })
                        }
                      >
                        Uložiť
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        type="button"
                        onClick={() => setRenaming(null)}
                      >
                        Zrušiť
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="fw-semibold">{item.name}</div>
                      {item.note && <div className="small text-body-secondary">{item.note}</div>}
                    </>
                  )}
                </td>
                <td className="small">{item.short_name ?? <span className="text-body-secondary">—</span>}</td>
                <td className="small font-monospace">{item.code}</td>
                {group.kind === "phase" && (
                  <td>
                    <select
                      className="form-select form-select-sm"
                      aria-label={`Segment metriky pre ${item.name}`}
                      value={item.bucket ?? ""}
                      disabled={busy}
                      onChange={(event) => {
                        const bucket = event.target.value;
                        setPending({
                          title: "Zmena segmentu metriky",
                          hint: "Zmení, kam sa kauzy v tejto fáze rátajú v grafe Peniaze v kauzách.",
                          run: (reason) => patch.mutateAsync({ id: item.id, bucket, reason }),
                        });
                      }}
                    >
                      {!item.bucket && <option value="">— chýba —</option>}
                      {BUCKETS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </td>
                )}
                <td className="small">{item.sort}</td>
                <td className="small">
                  {item.usage === null || item.usage === undefined ? (
                    <span className="text-body-secondary">—</span>
                  ) : item.usage > 0 ? (
                    <>{item.usage}×</>
                  ) : (
                    <span className="text-body-secondary">nepoužité</span>
                  )}
                </td>
                <td>
                  {item.active
                    ? <span className="badge text-bg-success">aktívna</span>
                    : <span className="badge text-bg-secondary">neaktívna</span>}
                </td>
                <td className="text-end">
                  <button
                    className="btn btn-sm btn-outline-secondary me-1"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setRenaming(renaming?.id === item.id ? null : { id: item.id, name: item.name })
                    }
                  >
                    premenovať
                  </button>
                  <button
                    className={`btn btn-sm ${item.active ? "btn-outline-danger" : "btn-outline-success"}`}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPending({
                        title: item.active ? "Deaktivovanie položky" : "Aktivovanie položky",
                        hint: item.active
                          ? "Položka sa prestane ponúkať vo formulároch. Kauzy a konania, ktoré ju nesú, zostávajú, ako sú."
                          : "Položka sa začne znova ponúkať vo formulároch.",
                        run: (reason) => patch.mutateAsync({ id: item.id, active: !item.active, reason }),
                      })
                    }
                  >
                    {item.active ? "deaktivovať" : "aktivovať"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header fw-semibold">Pridať položku</div>
        <form
          className="card-body row g-2 align-items-end"
          onSubmit={(event) => {
            event.preventDefault();
            addItem();
          }}
        >
          <div className="col-md-3">
            <label className="form-label small mb-1" htmlFor="codelist-code">Kód</label>
            {bound ? (
              // Viazaný číselník: na výber sú len kódy, ktoré ešte nemajú názov.
              <select
                id="codelist-code"
                className="form-select form-select-sm"
                value={form.code}
                onChange={set("code")}
                required
              >
                <option value="">— vyber kód —</option>
                {group.missing.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            ) : (
              <input
                id="codelist-code"
                className="form-control form-control-sm font-monospace"
                value={form.code}
                onChange={set("code")}
                pattern="[a-z0-9][a-z0-9_-]*"
                minLength={2}
                maxLength={60}
                placeholder="os-testovice"
                required
              />
            )}
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-1" htmlFor="codelist-name">Názov</label>
            <input
              id="codelist-name"
              className="form-control form-control-sm"
              value={form.name}
              onChange={set("name")}
              minLength={2}
              maxLength={200}
              placeholder={group.kind === "court" ? "Okresný súd Testovice" : "Verejné obstarávanie"}
              required
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" htmlFor="codelist-short">Skratka</label>
            <input
              id="codelist-short"
              className="form-control form-control-sm"
              value={form.short_name}
              onChange={set("short_name")}
              maxLength={60}
              placeholder="OS Testovice"
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" htmlFor="codelist-note">Poznámka</label>
            <input
              id="codelist-note"
              className="form-control form-control-sm"
              value={form.note}
              onChange={set("note")}
              maxLength={500}
            />
          </div>
          <div className="col-md-1">
            <label className="form-label small mb-1" htmlFor="codelist-sort">Poradie</label>
            <input
              id="codelist-sort"
              className="form-control form-control-sm"
              type="number"
              min={0}
              max={999}
              value={form.sort}
              onChange={set("sort")}
            />
          </div>
          {group.kind === "phase" && (
            <div className="col-md-3">
              <label className="form-label small mb-1" htmlFor="codelist-bucket">Segment metriky</label>
              <select id="codelist-bucket" className="form-select form-select-sm" required
                value={form.bucket} onChange={set("bucket")}>
                <option value="">—</option>
                {BUCKETS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
          )}
          <div className="col-md-1 d-grid">
            <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>
              Pridať
            </button>
          </div>
          {bound && group.missing.length === 0 && (
            <div className="col-12 small text-body-secondary">
              Všetky hodnoty, ktoré databáza pri tomto poli pozná, už názov majú. Ďalšia by sa dala
              pridať len zmenou <code>validate_doc_update</code> — a to je zmena dátového modelu,
              nie číselníka.
            </div>
          )}
        </form>
      </div>

      {pending && (
        <ReasonDialog
          title={pending.title}
          hint={pending.hint ?? "Jedna veta, ktorá zostane v histórii zmien číselníka."}
          busy={busy}
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

export default Codelists;

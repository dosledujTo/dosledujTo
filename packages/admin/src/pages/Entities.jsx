// Osoby a subjekty (zadanie §9).
//
// Profil má odpovedať na „čo s tým človekom bolo", nie vypísať zoznam
// identifikátorov. Preto: mená naviazaných entít, články, a časová os
// poskladaná z rolí a udalostí káuz — API ich vracia hydratované, aby profil
// nestál desiatky requestov.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  useOrg, useOrgs, usePatchPerson, usePerson, usePersons, usePublishPerson,
  useUnpublishPerson,
} from "../api/queries.js";
import { useAuth } from "../auth.jsx";
import {
  CaseRolesPanel, EntityArticlesPanel, LinksPanel, ProceedingsPanel,
} from "../assign.jsx";
import { PageHeader } from "../layout.jsx";
import { SourcedField, emptySourced, unsourcedFields } from "../sourced.jsx";
import {
  ConflictDialog, EmptyState, ErrorState, Notice, PublishBadge, ReasonDialog, RoleBadge,
  Spinner, formatDate,
} from "../ui.jsx";

function EntityList({ title, subtitle, hook, basePath, extraColumn }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data, isLoading, error, refetch } = hook({ q: q || undefined, limit: 100 });

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />

      <input
        className="form-control form-control-sm mb-3" style={{ maxWidth: 360 }}
        defaultValue={q} placeholder="hľadaj podľa mena aj bez diakritiky…"
        onKeyDown={(e) => e.key === "Enter" && setParams({ q: e.currentTarget.value }, { replace: true })}
        onBlur={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
      />

      {isLoading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {data && data.items.length === 0 && (
        <EmptyState title="Nič sa nenašlo" hint="Skús iné meno, alebo bez diakritiky." />
      )}

      {data && data.items.length > 0 && (
        <div className="list-group">
          {data.items.map((item) => (
            <Link className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              to={`${basePath}/${item.id}`} key={item.id}>
              <span>
                <span className="fw-semibold">{item.title}</span>
                {extraColumn && <span className="text-body-secondary small ms-2">{extraColumn(item)}</span>}
              </span>
              <PublishBadge state={item.publish_state} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function Persons() {
  return (
    <EntityList
      title="Osoby" subtitle="Mená, varianty a role naprieč kauzami"
      hook={usePersons} basePath="/osoby"
    />
  );
}

export function Orgs() {
  return (
    <EntityList
      title="Subjekty" subtitle="Politické strany, firmy a inštitúcie"
      hook={useOrgs} basePath="/subjekty"
      extraColumn={(item) => [item.kind, item.ico].filter(Boolean).join(" · ")}
    />
  );
}

/**
 * Časová os osoby: kedy jej vznikla a zanikla rola, a čo sa v jej kauzách dialo.
 * Očakávané udalosti sú odlíšené prerušovaným okrajom, rovnako ako na kauze.
 */
function EntityTimeline({ timeline }) {
  if (timeline.length === 0) {
    return (
      <EmptyState
        title="Zatiaľ žiadny pohyb"
        hint="Časová os sa naplní z rolí a z udalostí káuz, v ktorých osoba figuruje."
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {timeline.map((entry, index) => {
        const future = String(entry.at) > today;
        return (
          <div
            className="card mb-2"
            key={index}
            style={future ? { borderStyle: "dashed", borderWidth: 2 } : undefined}
          >
            <div className="card-body py-2 d-flex justify-content-between gap-3">
              <span>
                {entry.kind === "role" && <RoleBadge role={entry.label} current={entry.current} />}
                {entry.kind === "role_ended" && (
                  <span className="badge text-bg-light border">ukončená rola {entry.label}</span>
                )}
                {(entry.kind === "event" || entry.kind === "event_expected") && (
                  <span className="fw-semibold">{entry.label}</span>
                )}
                <div className="small text-body-secondary">
                  <Link to={`/kauzy/${entry.case_id}`}>{entry.case}</Link>
                  {entry.category && ` · ${entry.category}`}
                </div>
              </span>
              <span className="text-end small text-nowrap">
                {formatDate(entry.at)}
                {future && <div><span className="badge text-bg-info">očakávané</span></div>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Úprava osoby. Rovnaký vzor ako pri kauze: zdrojovaná hodnota s vlastnými
 * zdrojmi, dôvod pri uložení, konflikt verzií ako bežná situácia.
 *
 * Varianty mena zdroj nemajú — nie sú tvrdením o človeku, ale pomôckou pre
 * párovanie (pády, prechyľovanie, iniciály z policajných správ). Preto sú
 * obyčajným zoznamom.
 */
function PersonEditor({ person }) {
  const save = usePatchPerson(person.id);
  const initial = () => ({
    full_name: person.full_name ?? "",
    short_bio: person.short_bio ?? emptySourced(""),
    name_variants: person.name_variants ?? [],
    birth_year: person.birth_year ?? null,
  });

  const [draft, setDraft] = useState(initial);
  const [variant, setVariant] = useState("");
  const [asking, setAsking] = useState(false);
  const [conflict, setConflict] = useState(null);

  useEffect(() => setDraft(initial()), [person._rev]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial()),
    [draft, person],
  );

  const addVariant = () => {
    const value = variant.trim();
    if (!value || draft.name_variants.includes(value)) return;
    setDraft({ ...draft, name_variants: [...draft.name_variants, value] });
    setVariant("");
  };

  async function submit(reason) {
    try {
      await save.mutateAsync({ patch: draft, reason, rev: person._rev });
      setAsking(false);
    } catch (err) {
      setAsking(false);
      if (err instanceof ApiError && err.isConflict) setConflict(err);
      else throw err;
    }
  }

  return (
    <div className="card mb-3">
      <div className="card-header fw-semibold">Úprava profilu</div>
      <div className="card-body">
        <label className="form-label small">Meno</label>
        <input
          className="form-control mb-1"
          required minLength={3}
          value={draft.full_name}
          onChange={(event) => setDraft({ ...draft, full_name: event.target.value })}
        />
        <div className="form-text mb-3">
          Adresa profilu (<code>{person.slug}</code>) sa nemení. Ak ide o iného človeka, nie je to
          oprava mena — založ novú osobu.
        </div>

        <SourcedField
          label="Krátky popis"
          type="textarea"
          field={draft.short_bio}
          onChange={(next) => setDraft({ ...draft, short_bio: next })}
        />

        <label className="form-label small">Rok narodenia</label>
        <input
          className="form-control mb-3"
          type="number" min="1900" max="2100"
          value={draft.birth_year ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, birth_year: event.target.value === "" ? null : Number(event.target.value) })}
        />

        <label className="form-label small">Varianty mena</label>
        <div className="d-flex flex-wrap gap-1 mb-2">
          {draft.name_variants.map((value) => (
            <span className="badge text-bg-light border d-inline-flex align-items-center gap-1" key={value}>
              {value}
              <button
                type="button"
                className="btn-close btn-close-sm"
                style={{ fontSize: ".5rem" }}
                aria-label={`Odobrať variant ${value}`}
                onClick={() => setDraft({
                  ...draft,
                  name_variants: draft.name_variants.filter((v) => v !== value),
                })}
              />
            </span>
          ))}
          {draft.name_variants.length === 0 && <em className="small text-body-secondary">žiadne</em>}
        </div>
        <div className="input-group input-group-sm mb-3">
          <input
            className="form-control"
            value={variant}
            placeholder="napr. Testovacieho"
            onChange={(event) => setVariant(event.target.value)}
            onKeyDown={(event) => {
              // Enter tu pridáva variant, nie odosiela — formulár žiadny nie je,
              // ale zvyk je silnejší ako značkovanie.
              if (event.key === "Enter") {
                event.preventDefault();
                addVariant();
              }
            }}
          />
          <button className="btn btn-outline-secondary" type="button" onClick={addVariant}>
            Pridať
          </button>
        </div>

        <div className="d-flex gap-2 align-items-center">
          <button className="btn btn-primary" type="button" disabled={!dirty} onClick={() => setAsking(true)}>
            Uložiť zmeny
          </button>
          {dirty && <span className="text-body-secondary small">Neuložené zmeny</span>}
          {save.isError && !conflict && <span className="text-danger small">{save.error.message}</span>}
        </div>
      </div>

      {asking && (
        <ReasonDialog busy={save.isPending} onCancel={() => setAsking(false)} onConfirm={submit} />
      )}
      {conflict && (
        <ConflictDialog
          error={conflict}
          onKeepEditing={() => setConflict(null)}
          onReload={() => window.location.reload()}
        />
      )}
    </div>
  );
}

export function PersonDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, isLoading, error } = usePerson(id);
  const publish = usePublishPerson(id);
  const unpublish = useUnpublishPerson(id);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const person = data.person;
  // Rovnaké pravidlo ako pri kauze: údaj bez zdroja sa nezverejňuje, takže
  // osoba s takým údajom sa nedá publikovať.
  const missing = unsourcedFields(person);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Osoby", to: "/osoby" }, { label: person.full_name }]}
        title={person.full_name}
        subtitle={<PublishBadge state={person.publish_state} />}
        actions={
          can("admin") && (
            person.publish_state === "published" ? (
              <button className="btn btn-outline-secondary" type="button" onClick={() => setUnpublishing(true)}>
                Vrátiť do konceptu
              </button>
            ) : (
              <button
                className="btn btn-success"
                type="button"
                disabled={missing.length > 0}
                title={missing.length ? "Najprv doplň zdroje" : undefined}
                onClick={() => setPublishing(true)}
              >
                Publikovať
              </button>
            )
          )
        }
      />

      {person.publish_state === "draft" && (
        <Notice tone="warning">
          <strong>Koncept.</strong> Profil nie je verejný. Verejné API ho nevráti, kým ho
          administrátor nepublikuje.
        </Notice>
      )}
      {missing.length > 0 && (
        <Notice tone="danger">
          <strong>Bez zdroja: {missing.join(", ")}.</strong>{" "}
          Kým to platí, osoba sa nedá publikovať.
        </Notice>
      )}

      {publishing && (
        <ReasonDialog
          title="Publikovať osobu"
          hint="Profil sa stane verejným. Ide o meno konkrétneho človeka — dôvod zostane v histórii."
          busy={publish.isPending}
          onCancel={() => setPublishing(false)}
          onConfirm={async (reason) => {
            await publish.mutateAsync({ reason });
            setPublishing(false);
          }}
        />
      )}
      {unpublishing && (
        <ReasonDialog
          title="Vrátiť osobu do konceptu"
          hint="Profil zmizne z verejnej časti a bude sa dať ďalej upravovať."
          busy={unpublish.isPending}
          onCancel={() => setUnpublishing(false)}
          onConfirm={async (reason) => {
            await unpublish.mutateAsync({ reason });
            setUnpublishing(false);
          }}
        />
      )}

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Varianty mena</div>
            <div className="card-body">
              <p className="small text-body-secondary">
                Kritické pre matching — pády, prechyľovanie, iniciály z policajných správ.
              </p>
              <div className="d-flex flex-wrap gap-1">
                {(person.name_variants ?? []).map((variant) => (
                  <span className="badge text-bg-light border" key={variant}>{variant}</span>
                ))}
                {(person.name_variants ?? []).length === 0 && <em className="small">žiadne</em>}
              </div>
            </div>
          </div>

          <PersonEditor person={person} />

          <CaseRolesPanel entityId={id} entityType="person" cases={data.cases ?? []} />

          <LinksPanel
            entityId={id} entityType="person" links={data.links ?? []} only="org"
            title="Subjekty"
          />

          <LinksPanel
            entityId={id} entityType="person" links={data.links ?? []} only="person"
            title="Osoby"
          />
        </div>

        <div className="col-lg-7">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Časová os</div>
            <div className="card-body">
              <EntityTimeline timeline={data.timeline ?? []} />
            </div>
          </div>

          <ProceedingsPanel
            field="person_ids" valueId={id} items={data.proceedings ?? []}
            hint="Konanie sa zakladá v kauze, kam patrí; tu sa k nemu osoba priradí menovite."
          />

          <EntityArticlesPanel entityId={id} entityType="person" articles={data.articles ?? []} />
        </div>
      </div>

      <Notice tone="info">
        <div className="small">
          Zlúčenie duplicít má API (<code>POST /api/admin/persons/merge</code>), obrazovku k nemu
          zatiaľ nie — je ďalšie v poradí podľa §11 zadania.
        </div>
      </Notice>
    </>
  );
}

export function OrgDetail() {
  const { id } = useParams();
  const { data, isLoading, error } = useOrg(id);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const org = data.org;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Subjekty", to: "/subjekty" }, { label: org.name }]}
        title={org.name}
        subtitle={
          <span className="d-inline-flex gap-2 align-items-center">
            <PublishBadge state={org.publish_state} />
            <span className="badge text-bg-light border">{org.kind}</span>
            {org.ico && <span className="small text-body-secondary">IČO {org.ico}</span>}
          </span>
        }
      />

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Varianty názvu</div>
            <div className="card-body d-flex flex-wrap gap-1">
              {(org.name_variants ?? []).map((variant) => (
                <span className="badge text-bg-light border" key={variant}>{variant}</span>
              ))}
              {(org.name_variants ?? []).length === 0 && <em className="small">žiadne</em>}
            </div>
          </div>

          {/* Priama rola subjektu v kauze je iná väzba než kauzy odvodené
              z členstva jeho ľudí — preto sú to dva bloky, nie jeden zoznam. */}
          <CaseRolesPanel
            entityId={id} entityType="org" cases={data.cases ?? []}
            title="Kauzy a role subjektu"
          />

          <LinksPanel
            entityId={id} entityType="org" links={data.links ?? []} only="person"
            title="Osoby"
          />

          <LinksPanel
            entityId={id} entityType="org" links={data.links ?? []} only="org"
            title="Subjekty"
          />
        </div>

        <div className="col-lg-7">
          <div className="card mb-3">
            <div className="card-header fw-semibold">Kauzy z členstva ľudí</div>
            <ul className="list-group list-group-flush">
              {(data.org_cases ?? []).map((item) => (
                <li className="list-group-item d-flex justify-content-between align-items-center" key={item.id}>
                  <Link to={`/kauzy/${item.id}`}>{item.title}</Link>
                  <PublishBadge state={item.publish_state} />
                </li>
              ))}
              {(data.org_cases ?? []).length === 0 && (
                <li className="list-group-item text-body-secondary small">
                  Žiadne. Pri politickej strane sa táto väzba počíta z členstva jej ľudí — priamu
                  účasť subjektu v kauze zapíš ako rolu vľavo.
                </li>
              )}
            </ul>
          </div>

          <ProceedingsPanel
            field="org_ids" valueId={id} items={data.proceedings ?? []}
            hint="Konanie sa zakladá v kauze, kam patrí; tu sa k nemu subjekt priradí menovite."
          />

          <EntityArticlesPanel entityId={id} entityType="org" articles={data.articles ?? []} />

          <div className="card">
            <div className="card-header fw-semibold">Časová os</div>
            <div className="card-body">
              <EntityTimeline timeline={data.timeline ?? []} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

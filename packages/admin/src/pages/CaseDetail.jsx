// Detail kauzy (zadanie §5.2). Každý tab má vlastnú URL.
//
// Pri každom uložení je povinný dôvod zmeny — dialóg pri uložení, nie voliteľné
// pole na konci formulára. Konflikt verzií sa rieši ako bežná situácia, nie ako
// chyba.

import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  useAddEvent, useAddModerator, useAddProceeding, useAddRole, useArticles, useCase,
  useDeleteEvent, useDeleteProceeding, useDeleteRole, useEndRole, useHideCase,
  usePatchCase, usePatchEvent, usePatchProceeding, usePatchRole, usePublishCase,
  useAttachSource, useDetachSource, useRemoveModerator, useRevisions, useSuggestions,
  useUnpublishCase, useUsers,
} from "../api/queries.js";
import { useAuth } from "../auth.jsx";
import { CodelistSelect, useCodelist } from "../codelist.jsx";
import { PageHeader } from "../layout.jsx";
import { DeleteDialog, EntityPicker, SourcesField } from "../pickers.jsx";
import { SourcePicker, SourcedField, emptySourced, unsourcedFields } from "../sourced.jsx";
import {
  ConflictDialog, EmptyState, ErrorState, Notice, PhaseBadge, PublishBadge, ReasonDialog,
  CASE_KIND_LABELS, RoleBadge, Spinner, formatDate, formatDateTime, formatMoment, money, phaseLabel, roleKindLabel,
} from "../ui.jsx";

const TABS = [
  ["", "Prehľad"], ["ludia", "Ľudia a role"], ["casova-os", "Časová os"],
  ["konania", "Konania"], ["zdroje", "Zdroje"], ["podnety", "Podnety"], ["historia", "História"],
];

const STATUS_OPTIONS = [
  { value: "open", label: "otvorená" },
  { value: "closed", label: "uzavretá" },
];

const PHASE_OPTIONS = [
  "investigation", "charges", "indictment", "trial", "appeal", "convicted", "acquitted", "halted", "lapsed",
].map((value) => ({ value, label: phaseLabel(value) }));
const CASE_KIND_OPTIONS = Object.entries(CASE_KIND_LABELS).map(([value, label]) => ({ value, label }));

export default function CaseDetail() {
  const { id, tab = "" } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data, isLoading, error, refetch } = useCase(id);
  const publish = usePublishCase(id);
  const unpublish = useUnpublishCase(id);
  const hide = useHideCase(id);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [hiding, setHiding] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const doc = data.case;
  const missing = unsourcedFields(doc);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Kauzy", to: "/kauzy" }, { label: doc.title }]}
        title={doc.title}
        subtitle={
          <span className="d-inline-flex gap-2 align-items-center">
            <PublishBadge state={doc.publish_state} />
            <PhaseBadge phase={doc.phase?.value} />
            {doc.amount?.value != null && <span>{money(doc.amount.value)}</span>}
          </span>
        }
        actions={
          can("admin") && (
            <>
              {doc.publish_state !== "published" ? (
                <button
                  className="btn btn-success"
                  type="button"
                  disabled={missing.length > 0}
                  title={missing.length ? "Najprv doplň zdroje" : undefined}
                  onClick={() => setPublishing(true)}
                >
                  Publikovať
                </button>
              ) : (
                // Krok späť v redakčnej práci. Skrytie je niečo iné — to je
                // rozhodnutie, že vec zverejnená byť nemá.
                <button className="btn btn-outline-secondary" type="button" onClick={() => setUnpublishing(true)}>
                  Vrátiť do konceptu
                </button>
              )}
              {doc.publish_state !== "hidden" && (
                <button className="btn btn-outline-danger" type="button" onClick={() => setHiding(true)}>
                  Skryť
                </button>
              )}
            </>
          )
        }
      />

      {doc.publish_state === "draft" && (
        <Notice tone="warning">
          <strong>Koncept.</strong> Táto kauza nie je verejná. Verejné API ju nevráti, kým ju
          administrátor nepublikuje.
        </Notice>
      )}
      {doc.publish_state === "hidden" && (
        <Notice tone="dark">
          <strong>Skryté.</strong> Kauza bola stiahnutá z verejnej časti.
        </Notice>
      )}

      {missing.length > 0 && (
        <Notice tone="danger">
          <div>
            <strong>Bez zdroja: {missing.join(", ")}.</strong>{" "}
            Kým to platí, kauza sa nedá publikovať — údaj bez zdroja sa nezverejňuje.
          </div>
        </Notice>
      )}

      <ul className="nav nav-tabs mb-3">
        {TABS.map(([slug, label]) => (
          <li className="nav-item" key={slug}>
            <NavLink
              end
              to={`/kauzy/${id}${slug ? `/${slug}` : ""}`}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              {label}
              {slug === "podnety" && <SuggestionCount caseId={id} />}
            </NavLink>
          </li>
        ))}
      </ul>

      {tab === "" && (
        <>
          <Moderators caseId={id} moderators={data.moderators ?? []} />
          <Overview doc={doc} />
        </>
      )}
      {tab === "ludia" && <People caseId={id} roles={data.roles} />}
      {tab === "casova-os" && <Timeline caseId={id} events={data.events} proceedings={data.proceedings} />}
      {tab === "konania" && (
        <Proceedings caseId={id} proceedings={data.proceedings} names={data.names ?? {}} />
      )}
      {tab === "zdroje" && <Sources caseId={id} />}
      {tab === "podnety" && <CaseSuggestions caseId={id} />}
      {tab === "historia" && <History caseId={id} />}

      {publishing && (
        <ReasonDialog
          title="Publikovať kauzu"
          hint="Kauza sa stane verejnou. Dôvod zostane v histórii."
          busy={publish.isPending}
          onCancel={() => setPublishing(false)}
          onConfirm={async (reason) => {
            await publish.mutateAsync({ reason });
            setPublishing(false);
            navigate(`/kauzy/${id}`);
          }}
        />
      )}
      {unpublishing && (
        <ReasonDialog
          title="Vrátiť kauzu do konceptu"
          hint="Kauza zmizne z verejnej časti a bude sa dať ďalej upravovať. Dôvod zostane v histórii."
          busy={unpublish.isPending}
          onCancel={() => setUnpublishing(false)}
          onConfirm={async (reason) => {
            await unpublish.mutateAsync({ reason });
            setUnpublishing(false);
          }}
        />
      )}
      {hiding && (
        <ReasonDialog
          title="Skryť kauzu"
          hint="Kauza zmizne z verejnej časti. Dôvod je povinný — skrytie bez vysvetlenia vyzerá ako upratovanie."
          busy={hide.isPending}
          onCancel={() => setHiding(false)}
          onConfirm={async (reason) => {
            await hide.mutateAsync({ reason });
            setHiding(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Priradení moderátori (zadanie §5.3). Prideľuje a odoberá admin; moderátor
 * vidí len stav.
 */
function Moderators({ caseId, moderators }) {
  const { can } = useAuth();
  const { data: users } = useUsers({});
  const add = useAddModerator(caseId);
  const remove = useRemoveModerator(caseId);
  const [picking, setPicking] = useState(false);

  const candidates = (users?.items ?? []).filter(
    (u) => u.role !== "user" && !moderators.some((m) => m.id === u.id),
  );

  return (
    <div className="card mb-3">
      <div className="card-body d-flex flex-wrap align-items-center gap-2">
        <span className="fw-semibold me-2">Moderátori</span>

        {moderators.length === 0 && (
          <span className="text-body-secondary small">
            Nikto nie je priradený — kauza nemá gestora.
          </span>
        )}

        {moderators.map((m) => (
          <span className="badge text-bg-light border d-inline-flex align-items-center gap-1" key={m.id}>
            {m.display_name || m.email}
            {can("admin") && (
              <button
                type="button" className="btn-close btn-close-sm ms-1" style={{ fontSize: ".5rem" }}
                aria-label={`Odobrať ${m.email}`}
                onClick={() => remove.mutate(m.id)}
              />
            )}
          </span>
        ))}

        {can("admin") && (
          picking ? (
            <select
              className="form-select form-select-sm w-auto" autoFocus defaultValue=""
              onChange={async (e) => {
                if (e.target.value) await add.mutateAsync({ user_id: e.target.value });
                setPicking(false);
              }}
            >
              <option value="">— vyber moderátora —</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name || u.email} ({u.role})</option>
              ))}
            </select>
          ) : (
            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setPicking(true)}>
              + priradiť
            </button>
          )
        )}

        {(add.isError || remove.isError) && (
          <span className="text-danger small">{(add.error ?? remove.error).message}</span>
        )}
      </div>
    </div>
  );
}

function SuggestionCount({ caseId }) {
  const { data } = useSuggestions({ target_type: "case", status: "pending", limit: 50 });
  const count = (data?.items ?? []).filter((s) => s.target?.id === caseId).length;
  if (!count) return null;
  return <span className="badge text-bg-danger ms-2">{count}</span>;
}

/**
 * Nepovinné zdrojované polia, ktoré kauza zatiaľ nemá a moderátor ich nechal
 * prázdne, sa neukladajú. Inak by v kauze pribudlo pole bez zdroja a kauza by
 * sa nedala zverejniť kvôli údaju, ktorý nikto netvrdí.
 */
const OPTIONAL_SOURCED = ["amount", "impact", "recovered_amount", "kind"];
const isBlank = (v) => v === null || v === "" || (Array.isArray(v) && v.length === 0);
function withoutEmptyOptional(draft, doc) {
  const patch = { ...draft };
  for (const key of OPTIONAL_SOURCED) {
    const field = patch[key];
    if (!doc[key] && field && isBlank(field.value) && field.sources.length === 0) {
      delete patch[key];
    }
  }
  return patch;
}

/** Prehľad: zdrojované hodnoty kauzy. */
function Overview({ doc }) {
  const patchCase = usePatchCase(doc.id);
  // Názov a štítky nie sú zdrojované hodnoty — sú to naše pomenovanie a naše
  // triedenie, nie tvrdenie o niekom. Preto obyčajné polia.
  const initial = () => ({
    title: doc.title ?? "",
    tags: doc.tags ?? [],
    summary: doc.summary ?? emptySourced(""),
    status: doc.status ?? emptySourced("open"),
    phase: doc.phase ?? emptySourced("investigation"),
    amount: doc.amount ?? emptySourced(null),
    kind: doc.kind ?? emptySourced([]),
    impact: doc.impact ?? emptySourced(null),
    recovered_amount: doc.recovered_amount ?? emptySourced(null),
  });

  const [draft, setDraft] = useState(initial);
  const [tag, setTag] = useState("");
  const [asking, setAsking] = useState(false);
  const [conflict, setConflict] = useState(null);

  // Po prijatí cudzej verzie sa formulár prekreslí na jej hodnoty.
  useEffect(() => setDraft(initial()), [doc._rev]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial()),
    [draft, doc],
  );

  const { items: tags, label: tagLabel } = useCodelist("case_tag");

  const addTag = () => {
    const value = tag.trim().toLowerCase();
    if (!value || draft.tags.includes(value)) return;
    setDraft({ ...draft, tags: [...draft.tags, value] });
    setTag("");
  };

  async function save(reason) {
    try {
      await patchCase.mutateAsync({ patch: withoutEmptyOptional(draft, doc), reason, rev: doc._rev });
      setAsking(false);
    } catch (err) {
      setAsking(false);
      if (err instanceof ApiError && err.isConflict) setConflict(err);
      else throw err;
    }
  }

  return (
    <>
      <div className="card mb-3">
        <div className="card-body">
          <label className="form-label fw-semibold">Názov kauzy</label>
          <input
            className="form-control"
            required minLength={3}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <div className="form-text">
            Adresa kauzy (<code>{doc.slug}</code>) sa nemení — odkazy, ktoré už niekto poslal ďalej,
            musia fungovať.
          </div>

          <label className="form-label fw-semibold mt-3">Štítky</label>
          <div className="d-flex flex-wrap gap-1 mb-2">
            {draft.tags.map((value) => (
              <span className="badge text-bg-light border d-inline-flex align-items-center gap-1" key={value}>
                {/* V dokumente je kód; na obrazovke názov z číselníka. Kód, ktorý
                    v číselníku nie je, sa ukáže tak, ako je zapísaný. */}
                {tagLabel(value)}
                <button
                  type="button"
                  className="btn-close btn-close-sm"
                  style={{ fontSize: ".5rem" }}
                  aria-label={`Odobrať štítok ${value}`}
                  onClick={() => setDraft({ ...draft, tags: draft.tags.filter((t) => t !== value) })}
                />
              </span>
            ))}
            {draft.tags.length === 0 && <em className="small text-body-secondary">žiadne</em>}
          </div>
          <div className="input-group input-group-sm" style={{ maxWidth: 360 }}>
            <input
              className="form-control"
              list="case-tags"
              value={tag}
              placeholder="napr. doprava"
              onChange={(event) => setTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
            />
            <button className="btn btn-outline-secondary" type="button" onClick={addTag}>Pridať</button>
            <datalist id="case-tags">
              {tags.map((item) => (
                <option key={item.id} value={item.code}>{item.name}</option>
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <SourcedField
        label="Popis kauzy" type="textarea" field={draft.summary}
        onChange={(next) => setDraft({ ...draft, summary: next })}
      />
      <div className="row">
        <div className="col-md-6">
          <SourcedField
            label="Stav" type="select" options={STATUS_OPTIONS} field={draft.status}
            onChange={(next) => setDraft({ ...draft, status: next })}
          />
        </div>
        <div className="col-md-6">
          <SourcedField
            label="Fáza" type="select" options={PHASE_OPTIONS} field={draft.phase}
            onChange={(next) => setDraft({ ...draft, phase: next })}
          />
        </div>
      </div>
      <SourcedField
        label="Druh kauzy" type="multiselect" options={CASE_KIND_OPTIONS} field={draft.kind}
        onChange={(next) => setDraft({ ...draft, kind: next })}
      />
      <SourcedField
        label="Suma" type="money" field={draft.amount}
        onChange={(next) => setDraft({ ...draft, amount: next })}
      />
      <SourcedField
        label="Dopad (kauza bez sumy)" type="impact" field={draft.impact}
        onChange={(next) => setDraft({ ...draft, impact: next })}
      />
      <SourcedField
        label="Vrátené alebo zaistené" type="money" field={draft.recovered_amount}
        onChange={(next) => setDraft({ ...draft, recovered_amount: next })}
      />

      <div className="d-flex gap-2 align-items-center sticky-bottom bg-body py-3 border-top">
        <button className="btn btn-primary" type="button" disabled={!dirty} onClick={() => setAsking(true)}>
          Uložiť zmeny
        </button>
        {dirty && <span className="text-body-secondary small">Neuložené zmeny</span>}
        {patchCase.isError && !conflict && (
          <span className="text-danger small">{patchCase.error.message}</span>
        )}
      </div>

      {asking && (
        <ReasonDialog busy={patchCase.isPending} onCancel={() => setAsking(false)} onConfirm={save} />
      )}
      {conflict && (
        <ConflictDialog
          error={conflict}
          onKeepEditing={() => setConflict(null)}
          onReload={() => window.location.reload()}
        />
      )}
    </>
  );
}

const ROLE_KINDS = [
  "suspect", "accused", "indicted", "convicted", "acquitted", "witness", "victim",
  "investigator", "prosecutor", "judge", "other",
];

const EVENT_CATEGORIES = ["charge", "hearing", "verdict", "appeal", "seizure", "other"];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Ľudia v kauze. Rola má tri osudy a každý znamená niečo iné:
 *   - **ukončiť** — status sa zmenil, rola zostáva v histórii (bežná cesta),
 *   - **upraviť** — oprava údaja o tej istej role,
 *   - **zmazať** — rola sem nikdy nemala patriť.
 * Preto to nie je jedno tlačidlo „odobrať“.
 */
function People({ caseId, roles }) {
  const [showHistory, setShowHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ending, setEnding] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const endRole = useEndRole(caseId);
  const removeRole = useDeleteRole(caseId);

  const visible = showHistory ? roles : roles.filter((role) => !role.valid_to);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group">
          <button
            className={`btn btn-outline-secondary ${!showHistory ? "active" : ""}`}
            type="button" onClick={() => setShowHistory(false)}
          >
            Aktuálne role
          </button>
          <button
            className={`btn btn-outline-secondary ${showHistory ? "active" : ""}`}
            type="button" onClick={() => setShowHistory(true)}
          >
            Celá história
          </button>
        </div>
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(true)}>
          Pridať osobu alebo subjekt
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Zatiaľ tu nie je nikto"
          hint="Osoby, subjekty a ich role sa pridávajú ručne, každá s vlastným zdrojom."
          action={
            <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
              Pridať osobu alebo subjekt
            </button>
          }
        />
      ) : (
        <div className="list-group">
          {visible.map((role) => (
            <div className="list-group-item d-flex justify-content-between align-items-center gap-3" key={role.id}>
              <div className="min-w-0">
                {/* Rola viaže ku kauze osobu alebo subjekt — aj firma môže byť
                    obvinená. Odkaz musí viesť tam, kde záznam naozaj býva. */}
                <Link
                  to={`${role.entity_type === "org" ? "/subjekty" : "/osoby"}/${role.entity_id ?? role.person_id}`}
                  className="fw-semibold text-decoration-none"
                >
                  {role.entity?.name ?? role.person?.name ?? role.entity_id ?? role.person_id}
                </Link>
                {role.entity_type === "org" && (
                  <span className="badge text-bg-light border ms-2">subjekt</span>
                )}
                <div className="small text-body-secondary">
                  od {formatDate(role.valid_from)}
                  {role.valid_to && ` do ${formatDate(role.valid_to)}`}
                  {role.note && ` · ${role.note}`}
                </div>
              </div>

              <div className="d-flex gap-2 align-items-center flex-shrink-0">
                <span className="badge text-bg-light border">{(role.sources ?? []).length} zdroj(e)</span>
                <RoleBadge role={role.role} current={!role.valid_to} />

                <div className="btn-group btn-group-sm">
                  {!role.valid_to && (
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setEnding(role)}>
                      Ukončiť
                    </button>
                  )}
                  <button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(role)}>
                    Upraviť
                  </button>
                  <button className="btn btn-outline-danger" type="button" onClick={() => setDeleting(role)}>
                    Zmazať
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <RoleForm caseId={caseId} roles={roles} onClose={() => setAdding(false)} />}
      {editing && <RoleEditForm caseId={caseId} role={editing} onClose={() => setEditing(null)} />}

      {ending && (
        <EndRoleDialog
          role={ending}
          busy={endRole.isPending}
          error={endRole.error}
          onCancel={() => setEnding(null)}
          onConfirm={async (body) => {
            await endRole.mutateAsync({ id: ending.id, ...body });
            setEnding(null);
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          title="Zmazať rolu"
          warning={
            "Mazanie je na opravu omylu. Ak sa status naozaj zmenil — napríklad z obvineného na " +
            "oslobodeného — použi „Ukončiť“ a pridaj novú rolu. Inak z registra zmizne, že človek " +
            "obvinený bol, hoci to tak bolo."
          }
          busy={removeRole.isPending}
          error={removeRole.error}
          onCancel={() => setDeleting(null)}
          onConfirm={async (reason) => {
            await removeRole.mutateAsync({ id: deleting.id, reason });
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

/** Ukončenie role k dátumu — rola zostáva, len prestáva byť aktuálna. */
function EndRoleDialog({ role, onConfirm, onCancel, busy, error }) {
  const [form, setForm] = useState({ valid_to: today(), reason: "" });

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog">
        <form
          className="modal-content"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm({ valid_to: form.valid_to, reason: form.reason || undefined });
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">Ukončiť rolu</h5>
            <button className="btn-close" type="button" onClick={onCancel} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <p className="small text-body-secondary">
              Rola <strong>{role.role}</strong> pre {role.person?.name ?? role.person_id} sa uzavrie
              k dátumu a <strong>zostane v histórii</strong>.
            </p>
            <label className="form-label">Platná do</label>
            <input
              className="form-control" type="date" required autoFocus value={form.valid_to}
              onChange={(event) => setForm({ ...form, valid_to: event.target.value })}
            />
            <label className="form-label mt-3">Dôvod (nepovinné)</label>
            <input
              className="form-control" value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              placeholder="napr. súd rozhodol o oslobodení"
            />
            {error && <div className="alert alert-danger py-2 mt-3 mb-0">{error.message}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Zrušiť</button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Ukladám…" : "Ukončiť rolu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Zmena role nikdy neprepisuje starú (zadanie §5.2): formulár to hovorí nahlas
 * a doterajšia rola sa uzavrie k dátumu, nie zmaže.
 */
function RoleForm({ caseId, roles, onClose }) {
  const addRole = useAddRole(caseId);
  // Rola patrí osobe alebo subjektu — práve jednému z nich, nikdy obom.
  const [entityType, setEntityType] = useState("person");
  const [form, setForm] = useState({
    entity_id: "", role: "suspect", valid_from: today(),
    sources: [], note: "", supersedes: "",
  });

  const openRoles = roles.filter(
    (r) => !r.valid_to && (r.entity_id ?? r.person_id) === form.entity_id,
  );
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-lg">
        <form
          className="modal-content"
          onSubmit={async (event) => {
            event.preventDefault();
            await addRole.mutateAsync({
              [entityType === "org" ? "org_id" : "person_id"]: form.entity_id,
              role: form.role,
              valid_from: form.valid_from,
              sources: form.sources,
              note: form.note || null,
              ...(form.supersedes ? { supersedes: form.supersedes } : {}),
            });
            onClose();
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">Pridať do kauzy</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <div className="btn-group btn-group-sm mb-2" role="group">
                {[["person", "osoba"], ["org", "subjekt"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`btn btn-outline-secondary ${entityType === value ? "active" : ""}`}
                    onClick={() => {
                      setEntityType(value);
                      setForm({ ...form, entity_id: "", supersedes: "" });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <EntityPicker
                kind={entityType}
                autoFocus
                allowCreate
                value={form.entity_id}
                onChange={(id) => setForm({ ...form, entity_id: id, supersedes: "" })}
              />
              <div className="form-text">
                Záznam, ktorý v registri ešte nie je, sa dá založiť rovno tu — vznikne ako koncept
                a doplní sa neskôr.
              </div>
            </div>

            {openRoles.length > 0 && (
              <div className="alert alert-warning py-2 small">
                Táto osoba má v kauze otvorenú rolu <strong>{openRoles[0].role}</strong>. Ak ide o zmenu
                statusu, vyber ju nižšie — uzavrie sa k dátumu a <strong>zostane v histórii</strong>.
                Nikdy sa neprepisuje.
                <select className="form-select form-select-sm mt-2" value={form.supersedes} onChange={set("supersedes")}>
                  <option value="">nová samostatná rola</option>
                  {openRoles.map((role) => (
                    <option key={role.id} value={role.id}>uzavrieť doterajšiu „{role.role}“</option>
                  ))}
                </select>
              </div>
            )}

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Rola</label>
                <select className="form-select" value={form.role} onChange={set("role")}>
                  {ROLE_KINDS.map((value) => (
                    <option key={value} value={value}>{roleKindLabel(value)}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Platná od</label>
                <input className="form-control" type="date" required value={form.valid_from} onChange={set("valid_from")} />
              </div>
              <div className="col-12">
                <label className="form-label">Poznámka</label>
                <input className="form-control" value={form.note} onChange={set("note")} />
              </div>
              <div className="col-12">
                <SourcesField
                  value={form.sources}
                  onChange={(sources) => setForm({ ...form, sources })}
                  hint="Rola bez zdroja sa nezapíše — je to tvrdenie o konkrétnom človeku."
                />
              </div>
            </div>

            {addRole.isError && <div className="alert alert-danger mt-3 py-2">{addRole.error.message}</div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onClose}>Zrušiť</button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={addRole.isPending || !form.entity_id || form.sources.length === 0}
            >
              Uložiť rolu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Oprava údajov o role. Osoba sa nemení — to by bola iná rola. */
function RoleEditForm({ caseId, role, onClose }) {
  const save = usePatchRole(caseId);
  const [form, setForm] = useState({
    role: role.role,
    valid_from: String(role.valid_from ?? "").slice(0, 10),
    valid_to: role.valid_to ? String(role.valid_to).slice(0, 10) : "",
    note: role.note ?? "",
    sources: role.sources ?? [],
    reason: "",
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-lg">
        <form
          className="modal-content"
          onSubmit={async (event) => {
            event.preventDefault();
            await save.mutateAsync({
              id: role.id,
              role: form.role,
              valid_from: form.valid_from,
              valid_to: form.valid_to || null,
              note: form.note || null,
              sources: form.sources,
              reason: form.reason,
            });
            onClose();
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">Upraviť rolu — {role.person?.name ?? role.person_id}</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>
          <div className="modal-body row g-3">
            <div className="col-md-4">
              <label className="form-label">Rola</label>
              <select className="form-select" value={form.role} onChange={set("role")}>
                {ROLE_KINDS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Platná od</label>
              <input className="form-control" type="date" required value={form.valid_from} onChange={set("valid_from")} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Platná do</label>
              <input className="form-control" type="date" value={form.valid_to} onChange={set("valid_to")} />
            </div>
            <div className="col-12">
              <label className="form-label">Poznámka</label>
              <input className="form-control" value={form.note} onChange={set("note")} />
            </div>
            <div className="col-12">
              <SourcesField value={form.sources} onChange={(sources) => setForm({ ...form, sources })} />
            </div>
            <div className="col-12">
              <label className="form-label">Dôvod úpravy</label>
              <input className="form-control" required minLength={3} value={form.reason} onChange={set("reason")} />
              <div className="form-text">Zapíše sa do histórie kauzy.</div>
            </div>
            {save.isError && <div className="col-12"><div className="alert alert-danger py-2 mb-0">{save.error.message}</div></div>}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline-secondary" type="button" onClick={onClose}>Zrušiť</button>
            <button className="btn btn-primary" type="submit" disabled={save.isPending || form.sources.length === 0}>
              Uložiť zmenu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Časová os: minulé aj očakávané v jednom prúde, oddelené čiarou „dnes". */
function Timeline({ caseId, events, proceedings = [] }) {
  const addEvent = useAddEvent(caseId);
  const removeEvent = useDeleteEvent(caseId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const now = today();

  const sorted = [...events].sort((a, b) => String(a.occurred_on).localeCompare(String(b.occurred_on)));
  const past = sorted.filter((e) => e.occurred_on <= now);
  const future = sorted.filter((e) => e.occurred_on > now);

  const row = (event) => (
    <EventRow
      key={event.id}
      event={event}
      onEdit={() => setEditing(event)}
      onDelete={() => setDeleting(event)}
    />
  );

  return (
    <>
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(!adding)}>
          {adding ? "Zavrieť formulár" : "Pridať udalosť"}
        </button>
      </div>

      {adding && (
        <EventForm
          proceedings={proceedings}
          busy={addEvent.isPending}
          error={addEvent.error}
          onCancel={() => setAdding(false)}
          onSubmit={async (body) => { await addEvent.mutateAsync(body); setAdding(false); }}
        />
      )}

      {sorted.length === 0 && !adding && (
        <EmptyState
          title="Časová os je prázdna"
          hint="Pridaj, čo sa už stalo, aj čo sa očakáva — termín pojednávania je to, prečo ľudia kauzu sledujú."
        />
      )}

      <div className="position-relative">
        {past.map(row)}

        {future.length > 0 && (
          <div className="d-flex align-items-center gap-2 my-3">
            <hr className="flex-grow-1 m-0" />
            <span className="badge text-bg-dark">dnes</span>
            <hr className="flex-grow-1 m-0" />
          </div>
        )}

        {future.map(row)}
      </div>

      {editing && (
        <EventEditModal caseId={caseId} event={editing} proceedings={proceedings} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <DeleteDialog
          title="Zmazať udalosť"
          warning={`„${deleting.title}“ zmizne z časovej osi. Ak sa termín len presunul, uprav dátum — zmazanie je na omyl.`}
          busy={removeEvent.isPending}
          error={removeEvent.error}
          onCancel={() => setDeleting(null)}
          onConfirm={async (reason) => {
            await removeEvent.mutateAsync({ id: deleting.id, reason });
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

function EventRow({ event, onEdit, onDelete }) {
  const expected = event.kind === "expected";
  return (
    <div
      className="card mb-2"
      style={expected ? { borderStyle: "dashed", borderWidth: 2 } : undefined}
    >
      <div className="card-body py-2 d-flex justify-content-between gap-3 align-items-start">
        <div>
          <div className="fw-semibold">{event.title}</div>
          {event.description && <div className="small text-body-secondary">{event.description}</div>}
          <div className="btn-group btn-group-sm mt-2">
            <button className="btn btn-outline-secondary py-0" type="button" onClick={onEdit}>Upraviť</button>
            <button className="btn btn-outline-danger py-0" type="button" onClick={onDelete}>Zmazať</button>
          </div>
        </div>
        <div className="text-end flex-shrink-0">
          <div className="small">{formatDate(event.occurred_on)}</div>
          <span className={`badge ${expected ? "text-bg-info" : "text-bg-light border"}`}>
            {expected ? "očakávané" : event.category}
          </span>
          <div className="small text-body-secondary mt-1">{(event.sources ?? []).length} zdroj(e)</div>
        </div>
      </div>
    </div>
  );
}

/** Úprava udalosti — ten istý formulár, v dialógu a s dôvodom zmeny. */
function EventEditModal({ caseId, event, proceedings, onClose }) {
  const save = usePatchEvent(caseId);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upraviť udalosť</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <EventForm
              initial={event}
              proceedings={proceedings}
              requireReason
              submitLabel="Uložiť zmenu"
              busy={save.isPending}
              error={save.error}
              onCancel={onClose}
              onSubmit={async (body) => {
                await save.mutateAsync({ id: event.id, ...body });
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {any} [props.initial]        udalosť pri úprave
 * @param {boolean} [props.requireReason]
 * @param {Array<any>} [props.proceedings]  konania kauzy, k jednému sa udalosť môže viazať
 */
function EventForm({
  onSubmit, busy, error, onCancel, initial = null, requireReason = false, proceedings = [],
  submitLabel = "Pridať udalosť",
}) {
  const [form, setForm] = useState({
    occurred_on: String(initial?.occurred_on ?? today()).slice(0, 10),
    kind: initial?.kind ?? "past",
    category: initial?.category ?? "hearing",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    sources: initial?.sources ?? [],
    proceeding_id: initial?.proceeding_id ?? "",
    reason: "",
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const { label: categoryLabel } = useCodelist("event_category");

  return (
    <form
      className={initial ? "" : "card mb-3"}
      onSubmit={(e) => {
        e.preventDefault();
        const { reason, ...rest } = form;
        onSubmit({
          ...rest,
          description: form.description || undefined,
          proceeding_id: form.proceeding_id || null,
          ...(initial ? { reason } : { person_ids: [] }),
        });
      }}
    >
      <div className={`row g-3 ${initial ? "" : "card-body"}`}>
        <div className="col-md-4">
          <label className="form-label small">Dátum</label>
          <input className="form-control" type="date" required value={form.occurred_on} onChange={set("occurred_on")} />
        </div>
        <div className="col-md-4">
          <label className="form-label small">Typ</label>
          <select className="form-select" value={form.kind} onChange={set("kind")}>
            <option value="past">už sa stalo</option>
            <option value="expected">očakáva sa</option>
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label small">Kategória</label>
          {/* Zoznam hodnôt drží databáza, slovenský názov číselník — preto sa
              tu berú kódy z enumu a názvy z neho. */}
          <select className="form-select" value={form.category} onChange={set("category")}>
            {EVENT_CATEGORIES.map((v) => <option key={v} value={v}>{categoryLabel(v)}</option>)}
          </select>
        </div>
        <div className="col-12">
          <label className="form-label small">Názov</label>
          <input className="form-control" required minLength={3} value={form.title} onChange={set("title")} />
        </div>
        <div className="col-12">
          <label className="form-label small">Popis</label>
          <textarea className="form-control" rows={2} value={form.description} onChange={set("description")} />
        </div>
        {proceedings.length > 0 && (
          <div className="col-12">
            {/* Kalendár podľa konania filtruje súd; udalosť mimo súdu konanie nemá. */}
            <label className="form-label small" htmlFor="event-proceeding">Konanie</label>
            <select id="event-proceeding" className="form-select" value={form.proceeding_id} onChange={set("proceeding_id")}>
              <option value="">— mimo súdneho konania —</option>
              {proceedings.map((p) => (
                <option key={p.id} value={p.id}>{p.court} · {p.file_number}</option>
              ))}
            </select>
          </div>
        )}
        <div className="col-12">
          <SourcesField value={form.sources} onChange={(sources) => setForm({ ...form, sources })} />
        </div>

        {requireReason && (
          <div className="col-12">
            <label className="form-label small">Dôvod úpravy</label>
            <input className="form-control" required minLength={3} value={form.reason} onChange={set("reason")} />
          </div>
        )}

        {error && <div className="col-12"><div className="alert alert-danger py-2 mb-0">{error.message}</div></div>}

        <div className="col-12 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={busy || form.sources.length === 0}>
            {submitLabel}
          </button>
          {onCancel && (
            <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Zrušiť</button>
          )}
        </div>
      </div>
    </form>
  );
}

function Proceedings({ caseId, proceedings, names = {} }) {
  const add = useAddProceeding(caseId);
  const remove = useDeleteProceeding(caseId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [copied, setCopied] = useState(null);

  return (
    <>
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(!adding)}>
          {adding ? "Zavrieť" : "Pridať konanie"}
        </button>
      </div>

      {adding && (
        <ProceedingForm
          busy={add.isPending}
          error={add.error}
          onCancel={() => setAdding(false)}
          onSubmit={async (body) => {
            await add.mutateAsync({ ...body, decisions: [] });
            setAdding(false);
          }}
        />
      )}

      {proceedings.length === 0 && !adding ? (
        <EmptyState title="Žiadne súdne konanie" hint="Spisová značka je jediný praktický kľúč na spárovanie anonymizovaného rozhodnutia." />
      ) : (
        <div className="list-group">
          {proceedings.map((p) => (
            <div className="list-group-item" key={p.id}>
              <div className="d-flex justify-content-between align-items-start gap-3">
                <div>
                  <div className="fw-semibold">{p.court}</div>
                  {/* Konanie visí na kauze, ale obvinení sú menovite — priradenie
                      z profilu osoby musí byť vidieť aj tu. */}
                  {[...(p.person_ids ?? []), ...(p.org_ids ?? [])].length > 0 && (
                    <div className="small text-body-secondary">
                      vedené proti:{" "}
                      {[...(p.person_ids ?? []), ...(p.org_ids ?? [])]
                        .map((entityId) => names[entityId]?.name ?? entityId)
                        .join(", ")}
                    </div>
                  )}
                  <div className="d-flex align-items-center gap-2 mt-1">
                    <code className="fs-6">{p.file_number}</code>
                    <button
                      className="btn btn-sm btn-outline-secondary py-0"
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(p.file_number);
                        setCopied(p.id);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      {copied === p.id ? "skopírované" : "kopírovať"}
                    </button>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <PhaseBadge phase={p.phase} />
                  <div className="btn-group btn-group-sm">
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setEditing(p)}>
                      Upraviť
                    </button>
                    <button className="btn btn-outline-danger" type="button" onClick={() => setDeleting(p)}>
                      Odstrániť
                    </button>
                  </div>
                </div>
              </div>
              {(p.decisions ?? []).length > 0 && (
                <ul className="small mt-2 mb-0">
                  {p.decisions.map((d, i) => (
                    <li key={i}>{formatDate(d.decided_on)} — {d.outcome} {d.final ? "(právoplatné)" : ""}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProceedingEditModal caseId={caseId} proceeding={editing} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <DeleteDialog
          title="Odstrániť konanie"
          warning={`Konanie ${deleting.file_number} sa odpojí od kauzy a zmizne aj zo sekcie Konania.`}
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

function ProceedingEditModal({ caseId, proceeding, onClose }) {
  const save = usePatchProceeding(caseId);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upraviť konanie</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <ProceedingForm
              initial={proceeding}
              requireReason
              submitLabel="Uložiť zmenu"
              busy={save.isPending}
              error={save.error}
              onCancel={onClose}
              onSubmit={async (body) => {
                await save.mutateAsync({ id: proceeding.id, ...body });
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Formulár konania — zakladanie aj úprava, aj v samostatnej sekcii Konania. */
export function ProceedingForm({
  onSubmit, busy, error, onCancel, initial = null, requireReason = false,
  submitLabel = "Pridať konanie",
}) {
  const [form, setForm] = useState({
    court: initial?.court ?? "",
    file_number: initial?.file_number ?? "",
    phase: initial?.phase ?? "trial",
    sources: initial?.sources ?? [],
    reason: "",
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const { items: courts } = useCodelist("court");
  const [manualCourt, setManualCourt] = useState(false);

  return (
    <form
      className={initial ? "" : "card mb-3"}
      onSubmit={(event) => {
        event.preventDefault();
        const { reason, ...rest } = form;
        onSubmit(requireReason ? { ...rest, reason } : rest);
      }}
    >
      <div className={`row g-3 ${initial ? "" : "card-body"}`}>
        <div className="col-md-5">
          <label className="form-label small">Súd</label>
          {/* Číselník súdov ponúka; neblokuje. Súd, ktorý v ňom ešte nie je, sa
              zapíše ručne — a na obrazovke Číselníky je potom vidieť, že tam
              chýba. */}
          {courts.length > 0 && !manualCourt ? (
            <CodelistSelect
              kind="court" by="name" required
              value={form.court}
              onChange={(court) => setForm({ ...form, court })}
            />
          ) : (
            <input className="form-control" required minLength={3} value={form.court} onChange={set("court")} />
          )}
          <div className="form-text">
            {courts.length === 0 ? (
              <>Číselník súdov je prázdny — zapíš názov ručne a doplň ho v Číselníkoch.</>
            ) : (
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                onClick={() => setManualCourt(!manualCourt)}
              >
                {manualCourt ? "vybrať z číselníka" : "súd nie je v číselníku — napísať ručne"}
              </button>
            )}
          </div>
        </div>
        <div className="col-md-4">
          <label className="form-label small">Spisová značka</label>
          <input
            className="form-control font-monospace" required minLength={3}
            value={form.file_number} onChange={set("file_number")} placeholder="2T/45/2025"
          />
        </div>
        <div className="col-md-3">
          <label className="form-label small">Fáza</label>
          <select className="form-select" value={form.phase} onChange={set("phase")}>
            {PHASE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="col-12">
          <SourcesField
            value={form.sources}
            onChange={(sources) => setForm({ ...form, sources })}
            hint="Konanie musí mať zdroj — najlepšie úradný dokument."
          />
        </div>

        {requireReason && (
          <div className="col-12">
            <label className="form-label small">Dôvod úpravy</label>
            <input className="form-control" required minLength={3} value={form.reason} onChange={set("reason")} />
          </div>
        )}

        {error && <div className="col-12"><div className="alert alert-danger py-2 mb-0">{error.message}</div></div>}

        <div className="col-12 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={busy || form.sources.length === 0}>
            {submitLabel}
          </button>
          {onCancel && (
            <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Zrušiť</button>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * Zdroje kauzy. Pridávajú sa vyhľadaním medzi už uloženými článkami — to isté
 * okno, aké má editor zdrojovanej hodnoty, aby moderátor nemal dva spôsoby
 * podľa toho, na ktorej záložke stojí. Ak zdroj v systéme nie je, dá sa v tom
 * okne rovno založiť.
 */
function Sources({ caseId }) {
  const [kind, setKind] = useState("");
  const [picking, setPicking] = useState(false);
  const [detaching, setDetaching] = useState(null);

  // Filtruje index, nie prehliadač: inak by sa zdroj mimo prvej stránky
  // článkov na kauze vôbec neukázal.
  const { data, isLoading } = useArticles({ limit: 100, case_id: caseId, kind: kind || undefined });
  const attach = useAttachSource(caseId);
  const detach = useDetachSource(caseId);

  const items = data?.items ?? [];

  return (
    <>
      <div className="d-flex gap-2 mb-3 align-items-center">
        <select className="form-select form-select-sm w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">všetky zdroje</option>
          <option value="media">médiá</option>
          <option value="official">úradné dokumenty</option>
        </select>
        <button className="btn btn-sm btn-primary ms-auto" type="button" onClick={() => setPicking(true)}>
          Pridať zdroj
        </button>
      </div>

      {attach.isError && <div className="alert alert-danger py-2">{attach.error.message}</div>}

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="Ku kauze nie je priradený žiadny zdroj"
          hint="Zdroj sa vyhľadá medzi uloženými článkami; úradný dokument sa dá založiť priamo v tom okne."
          action={
            <button className="btn btn-primary" type="button" onClick={() => setPicking(true)}>
              Pridať zdroj
            </button>
          }
        />
      ) : (
        <div className="list-group">
          {items
            .slice()
            .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
            .map((article) => (
              <div className="list-group-item d-flex justify-content-between gap-3" key={article.id}>
                <div>
                  <a href={article.url} target="_blank" rel="noreferrer noopener" className="fw-semibold">
                    {article.title}
                  </a>
                  <div className="small text-body-secondary">
                    {article.publisher} · {formatMoment(article.published_at)}
                  </div>
                </div>
                <div className="text-end flex-shrink-0">
                  {article.kind === "official"
                    ? <span className="badge text-bg-primary">úradný dokument</span>
                    : <span className="badge text-bg-light border">médium</span>}
                  <div className="mt-1 d-flex gap-2 justify-content-end">
                    <Link to={`/clanky/${article.id}`} className="small">otvoriť</Link>
                    <button
                      className="btn btn-link btn-sm p-0 text-danger"
                      type="button"
                      onClick={() => setDetaching(article)}
                    >
                      odpojiť
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {picking && (
        <SourcePicker
          onPick={(id) => attach.mutate({ id })}
          onClose={() => setPicking(false)}
        />
      )}

      {detaching && (
        <ReasonDialog
          title="Odpojiť zdroj od kauzy"
          hint={`„${detaching.title}“ zostane v registri článkov, len prestane patriť k tejto kauze. Údaje, ktoré sa naň odvolávajú, ostanú bez zmeny — skontroluj ich.`}
          busy={detach.isPending}
          onCancel={() => setDetaching(null)}
          onConfirm={async (reason) => {
            await detach.mutateAsync({ id: detaching.id, reason });
            setDetaching(null);
          }}
        />
      )}
    </>
  );
}

function CaseSuggestions({ caseId }) {
  const { data, isLoading } = useSuggestions({ limit: 50 });
  if (isLoading) return <Spinner />;

  const items = (data?.items ?? []).filter((s) => s.target?.id === caseId);
  if (items.length === 0) {
    return <EmptyState title="Ku kauze zatiaľ neprišiel žiadny podnet" hint="Podnety chodia z verejnej stránky kauzy." />;
  }

  return (
    <div className="list-group">
      {items.map((s) => (
        <Link className="list-group-item list-group-item-action" to={`/podnety/${s.id}`} key={s.id}>
          <div className="d-flex justify-content-between">
            <span>{s.comment ?? <em>bez komentára</em>}</span>
            <span className="badge text-bg-light border">{s.status}</span>
          </div>
          <div className="small text-body-secondary">
            {s.origin === "bot" ? "návrh bota" : "podnet používateľa"} · {formatDateTime(s.created_at)}
            {s.target?.path && ` · pole ${s.target.path}`}
          </div>
        </Link>
      ))}
    </div>
  );
}

function History({ caseId }) {
  const { data, isLoading, error } = useRevisions({ target_id: caseId, limit: 100 });
  const [open, setOpen] = useState(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="list-group">
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
            <div className="small text-body-secondary">
              {revision.actor_role} · {revision.actor_id}
              {revision.suggestion_id && " · na základe podnetu"}
              {" · "}{(revision.diff ?? []).length} zmien
            </div>
          </button>

          {open === revision.id && (
            <pre className="bg-body-tertiary p-2 mt-2 mb-0 small" style={{ maxHeight: 300, overflow: "auto" }}>
              {JSON.stringify(revision.diff, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

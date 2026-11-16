// Priraďovanie záznamov k sebe: kauzy, osoby, subjekty, články, konania.
//
// Tie isté štyri väzby sa vypĺňajú z troch strán — z článku, z profilu osoby aj
// z profilu subjektu. Keby mala každá obrazovka vlastný formulár, tri miesta by
// sa rozišli v tom, čo je povinné a čo sa zapíše. Preto sú tu spoločné bloky
// a obrazovky im len povedia, čoho sa väzba týka.
//
// Dve pravidlá, ktoré držia všetky:
//   - **priradiť je lacné, odpojiť sa pýta dôvod.** Pripojenie sa dá odklikať
//     späť; odpojenie je rozhodnutie, že tam väzba nepatrí, a to patrí do
//     auditu (rovnako ako pri zdrojoch kauzy);
//   - **rola a prepojenie majú vždy zdroj.** Sú to tvrdenia o konkrétnom
//     človeku alebo firme; bez zdroja ich databáza ani neprijme.

import { useState } from "react";
import { Link } from "react-router-dom";

import {
  useAddRoleAnywhere, useCreateLink, useDeleteLink, useLinkArticle, useLinkProceeding,
  useProceedings,
} from "./api/queries.js";
import { useCodelist } from "./codelist.jsx";
import { EntityPicker, SourcesField } from "./pickers.jsx";
import { SourcePicker } from "./sourced.jsx";
import {
  ReasonDialog, RoleBadge, ROLE_KIND_OPTIONS, formatDate, formatMoment, useEscape,
} from "./ui.jsx";

/** Kde entita býva a ako sa volá jej pole na článku a na konaní. */
export const ENTITY = {
  case: { path: "/kauzy", field: "case_ids", label: "kauza", labelAcc: "kauzu" },
  person: { path: "/osoby", field: "person_ids", label: "osoba", labelAcc: "osobu" },
  org: { path: "/subjekty", field: "org_ids", label: "subjekt", labelAcc: "subjekt" },
};

const today = () => new Date().toISOString().slice(0, 10);

function Card({ title, count, children, footer }) {
  return (
    <div className="card mb-3">
      <div className="card-header fw-semibold d-flex justify-content-between align-items-center">
        <span>{title}</span>
        {count > 0 && <span className="badge text-bg-light border">{count}</span>}
      </div>
      {children}
      {footer && <div className="card-footer bg-body-tertiary">{footer}</div>}
    </div>
  );
}

/**
 * Priradenie kauz, osôb alebo subjektov k článku.
 *
 * @param {object} props
 * @param {"case"|"person"|"org"} props.kind
 * @param {string} props.articleId
 * @param {string[]} props.ids
 * @param {Record<string, {name: string}>} props.names
 * @param {(id: string) => React.ReactNode} [props.renderExtra]  napr. rola v kauze
 */
export function ArticleEntities({ kind, articleId, ids = [], names = {}, title, hint, renderExtra }) {
  const config = ENTITY[kind];
  const link = useLinkArticle();
  const [detaching, setDetaching] = useState(null);

  return (
    <Card
      title={title}
      count={ids.length}
      footer={
        <>
          <EntityPicker
            kind={kind}
            value=""
            allowCreate
            onChange={(id) => {
              if (id && !ids.includes(id)) {
                link.mutate({
                  articleId, field: config.field, add: id,
                  reason: `priradenie zdroja (${config.label})`,
                });
              }
            }}
          />
          {hint && <div className="form-text">{hint}</div>}
          {link.isError && <div className="alert alert-danger py-2 mt-2 mb-0">{link.error.message}</div>}
        </>
      }
    >
      <ul className="list-group list-group-flush">
        {ids.map((id) => (
          <li className="list-group-item d-flex justify-content-between align-items-start gap-2" key={id}>
            <span>
              <Link to={`${config.path}/${id}`}>{names[id]?.name ?? id}</Link>
              {names[id]?.publish_state === "draft" && (
                <span className="badge text-bg-secondary ms-2">koncept</span>
              )}
              {renderExtra && <div className="mt-1">{renderExtra(id)}</div>}
            </span>
            <button
              className="btn btn-link btn-sm p-0 text-danger flex-shrink-0"
              type="button"
              onClick={() => setDetaching(id)}
            >
              odpojiť
            </button>
          </li>
        ))}
        {ids.length === 0 && (
          <li className="list-group-item text-body-secondary small">
            Zatiaľ nič. Vyhľadaj nižšie — alebo záznam rovno založ.
          </li>
        )}
      </ul>

      {detaching && (
        <ReasonDialog
          title="Odpojiť od zdroja"
          hint="Väzba zmizne, samotný záznam zostáva. Údaje, ktoré sa na tento zdroj odvolávajú, sa nemenia — skontroluj ich."
          busy={link.isPending}
          onCancel={() => setDetaching(null)}
          onConfirm={async (reason) => {
            await link.mutateAsync({ articleId, field: config.field, remove: detaching, reason });
            setDetaching(null);
          }}
        />
      )}
    </Card>
  );
}

/** Našepkávač nad konaniami — spisová značka je to, čo má moderátor v ruke. */
export function ProceedingPicker({ onPick, onClose }) {
  const [q, setQ] = useState("");
  const { data, isFetching } = useProceedings({ q: q.length >= 2 ? q : undefined, limit: 20 });
  useEscape(onClose);

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Vybrať konanie</h5>
            <button className="btn-close" type="button" onClick={onClose} aria-label="Zavrieť" />
          </div>
          <div className="modal-body">
            <input
              className="form-control mb-3"
              autoFocus
              value={q}
              placeholder="spisová značka alebo súd…"
              onChange={(event) => setQ(event.target.value)}
            />
            <div className="list-group">
              {(data?.items ?? []).map((item) => (
                <button
                  className="list-group-item list-group-item-action text-start"
                  type="button"
                  key={item.id}
                  onClick={() => {
                    onPick(item);
                    onClose();
                  }}
                >
                  <span className="font-monospace fw-semibold">{item.file_number}</span>
                  <div className="small text-body-secondary">
                    {item.court}
                    {item.case && ` · ${item.case.name}`}
                  </div>
                </button>
              ))}
              {(data?.items ?? []).length === 0 && (
                <div className="list-group-item text-body-secondary small">
                  {isFetching ? "Hľadám…" : "Také konanie nemáme. Konanie sa zakladá v kauze, kam patrí."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Konania, v ktorých záznam figuruje.
 *
 * Pri článku je väzbou `sources` konania — úradný dokument je jeho zdrojom.
 * Pri osobe a subjekte sú to `person_ids` / `org_ids`: konanie visí na kauze,
 * ale obvinení sú menovite.
 */
export function ProceedingsPanel({ field, valueId, items = [], title = "Súdne konania", hint }) {
  const link = useLinkProceeding();
  const [picking, setPicking] = useState(false);
  const [detaching, setDetaching] = useState(null);

  return (
    <Card
      title={title}
      count={items.length}
      footer={
        <>
          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => setPicking(true)}>
            Priradiť ku konaniu
          </button>
          {hint && <div className="form-text">{hint}</div>}
          {link.isError && <div className="alert alert-danger py-2 mt-2 mb-0">{link.error.message}</div>}
        </>
      }
    >
      <ul className="list-group list-group-flush">
        {items.map((item) => (
          <li className="list-group-item d-flex justify-content-between align-items-start gap-2" key={item.id}>
            <span>
              <span className="font-monospace fw-semibold">{item.file_number}</span>
              <div className="small text-body-secondary">
                {item.court}
                {item.case && (
                  <> · <Link to={`/kauzy/${item.case_id}`}>{item.case.name}</Link></>
                )}
              </div>
            </span>
            <button
              className="btn btn-link btn-sm p-0 text-danger flex-shrink-0"
              type="button"
              onClick={() => setDetaching(item)}
            >
              odpojiť
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="list-group-item text-body-secondary small">
            Zatiaľ v žiadnom konaní.
          </li>
        )}
      </ul>

      {picking && (
        <ProceedingPicker
          onClose={() => setPicking(false)}
          onPick={(item) =>
            link.mutate({
              proceedingId: item.id,
              field,
              add: valueId,
              reason: "priradenie ku konaniu",
            })
          }
        />
      )}

      {detaching && (
        <ReasonDialog
          title="Odpojiť od konania"
          hint={
            field === "sources"
              ? "Konanie sa prestane opierať o tento zdroj. Konanie bez jediného zdroja sa nedá uložiť — v tom prípade najprv pripoj iný."
              : "Väzba zmizne, konanie zostáva."
          }
          busy={link.isPending}
          onCancel={() => setDetaching(null)}
          onConfirm={async (reason) => {
            await link.mutateAsync({ proceedingId: detaching.id, field, remove: valueId, reason });
            setDetaching(null);
          }}
        />
      )}
    </Card>
  );
}

/**
 * Kauzy a rola v nich. Rola je tvrdenie o konkrétnom človeku alebo firme:
 * povinný zdroj, dátum, od kedy platí, a vlastný dokument pri každej zmene —
 * oslobodenie nikdy neprepisuje obvinenie.
 */
export function CaseRolesPanel({ entityId, entityType, cases = [], title = "Kauzy a role" }) {
  const addRole = useAddRoleAnywhere();
  const [adding, setAdding] = useState(false);

  return (
    <Card
      title={title}
      count={cases.length}
      footer={
        adding ? (
          <RoleForm
            entityId={entityId}
            entityType={entityType}
            busy={addRole.isPending}
            error={addRole.error}
            onCancel={() => setAdding(false)}
            onSubmit={async (body) => {
              await addRole.mutateAsync(body);
              setAdding(false);
            }}
          />
        ) : (
          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => setAdding(true)}>
            Pridať do kauzy
          </button>
        )
      }
    >
      <ul className="list-group list-group-flush">
        {cases.map(({ case_id, case: caseInfo, role }) => (
          <li className="list-group-item d-flex justify-content-between align-items-center gap-2" key={role.id}>
            <Link to={`/kauzy/${case_id}`} className="text-decoration-none">
              {caseInfo?.name ?? case_id}
            </Link>
            <span className="text-end">
              <RoleBadge role={role.role} current={!role.valid_to} />
              <div className="small text-body-secondary">
                od {formatDate(role.valid_from)}{role.valid_to && ` do ${formatDate(role.valid_to)}`}
              </div>
            </span>
          </li>
        ))}
        {cases.length === 0 && (
          <li className="list-group-item text-body-secondary small">Zatiaľ v žiadnej kauze.</li>
        )}
      </ul>
    </Card>
  );
}

/** Formulár novej role — z profilu osoby, subjektu alebo z článku. */
export function RoleForm({
  entityId, entityType, caseId = "", caseOptions = null, sources: initialSources = [],
  busy, error, onSubmit, onCancel,
}) {
  const [form, setForm] = useState({
    case_id: caseId,
    role: "suspect",
    valid_from: today(),
    sources: initialSources,
  });

  const idField = entityType === "org" ? "org_id" : "person_id";

  return (
    <form
      className="row g-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          case_id: form.case_id,
          [idField]: entityId,
          role: form.role,
          valid_from: form.valid_from,
          sources: form.sources,
        });
      }}
    >
      <div className="col-12">
        <label className="form-label small mb-1">Kauza</label>
        {caseOptions ? (
          // Pri článku sa vyberá spomedzi kauz, ku ktorým je priradený: rola
          // patrí do kauzy, nie k článku samotnému.
          <select
            className="form-select form-select-sm"
            value={form.case_id}
            required
            onChange={(event) => setForm({ ...form, case_id: event.target.value })}
          >
            <option value="">— vyber kauzu —</option>
            {caseOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
        ) : (
          <EntityPicker
            kind="case"
            value={form.case_id}
            allowCreate
            onChange={(id) => setForm({ ...form, case_id: id })}
          />
        )}
      </div>

      <div className="col-sm-6">
        <label className="form-label small mb-1">Rola</label>
        <select
          className="form-select form-select-sm"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value })}
        >
          {ROLE_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="col-sm-6">
        <label className="form-label small mb-1">Platí od</label>
        <input
          className="form-control form-control-sm"
          type="date"
          required
          value={form.valid_from}
          onChange={(event) => setForm({ ...form, valid_from: event.target.value })}
        />
      </div>

      <div className="col-12">
        <SourcesField
          value={form.sources}
          onChange={(sources) => setForm({ ...form, sources })}
          hint="Rola bez zdroja sa nezapíše — je to tvrdenie o konkrétnom subjekte."
        />
      </div>

      {error && <div className="col-12"><div className="alert alert-danger py-2 mb-0">{error.message}</div></div>}

      <div className="col-12 d-flex gap-2">
        <button
          className="btn btn-sm btn-primary"
          type="submit"
          disabled={busy || !form.case_id || form.sources.length === 0}
        >
          Pridať rolu
        </button>
        {onCancel && (
          <button className="btn btn-sm btn-outline-secondary" type="button" onClick={onCancel}>
            Zrušiť
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Prepojenia na iné entity. Typ prepojenia je rola, v akej entita vystupuje —
 * člen, štatutár, vlastník, konečný užívateľ výhod.
 *
 * Ukončiť a zmazať sú dve rôzne veci: členstvo, ktoré skončilo, dostane
 * `valid_to` a zostáva v histórii; prepojenie, ktoré tam nikdy nepatrilo, sa
 * zmaže. Tu je zatiaľ pridanie a zmazanie — ukončenie má API, obrazovku dostane
 * s editorom prepojenia.
 */
export function LinksPanel({ entityId, entityType, links = [], only = null, title = "Prepojenia" }) {
  const create = useCreateLink();
  const remove = useDeleteLink();
  const { label: kindLabel, items: kinds } = useCodelist("link_type");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ other_id: "", kind: "member", sources: [], valid_from: "" });

  const shown = only ? links.filter((link) => String(link.other_id).startsWith(`${only}:`)) : links;
  const pickerKind = only ?? (entityType === "person" ? "org" : "person");

  return (
    <Card
      title={title}
      count={shown.length}
      footer={
        adding ? (
          <form
            className="row g-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await create.mutateAsync({
                from_id: entityId,
                to_id: form.other_id,
                kind: form.kind,
                valid_from: form.valid_from || null,
                sources: form.sources,
              });
              setForm({ other_id: "", kind: "member", sources: [], valid_from: "" });
              setAdding(false);
            }}
          >
            <div className="col-12">
              <label className="form-label small mb-1">
                {pickerKind === "org" ? "Subjekt" : "Osoba"}
              </label>
              <EntityPicker
                kind={pickerKind}
                value={form.other_id}
                allowCreate
                onChange={(id) => setForm({ ...form, other_id: id })}
              />
            </div>
            <div className="col-sm-6">
              <label className="form-label small mb-1">Typ prepojenia</label>
              <select
                className="form-select form-select-sm"
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value })}
              >
                {(kinds.length > 0
                  ? kinds.map((item) => [item.code, item.name])
                  : [["member", "member"], ["statutory", "statutory"], ["owner", "owner"],
                     ["ubo", "ubo"], ["family", "family"], ["business", "business"], ["other", "other"]]
                ).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="col-sm-6">
              <label className="form-label small mb-1">Platí od</label>
              <input
                className="form-control form-control-sm"
                type="date"
                value={form.valid_from}
                onChange={(event) => setForm({ ...form, valid_from: event.target.value })}
              />
            </div>
            <div className="col-12">
              <SourcesField
                value={form.sources}
                onChange={(sources) => setForm({ ...form, sources })}
                hint="Prepojenie bez zdroja sa nezapíše."
              />
            </div>
            {create.isError && (
              <div className="col-12"><div className="alert alert-danger py-2 mb-0">{create.error.message}</div></div>
            )}
            <div className="col-12 d-flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                type="submit"
                disabled={create.isPending || !form.other_id || form.sources.length === 0}
              >
                Pridať prepojenie
              </button>
              <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setAdding(false)}>
                Zrušiť
              </button>
            </div>
          </form>
        ) : (
          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => setAdding(true)}>
            {pickerKind === "org" ? "Pridať subjekt" : "Pridať osobu"}
          </button>
        )
      }
    >
      <ul className="list-group list-group-flush">
        {shown.map((link) => {
          const path = String(link.other_id).startsWith("person:") ? "/osoby" : "/subjekty";
          return (
            <li className="list-group-item d-flex justify-content-between align-items-start gap-2" key={link.id}>
              <span>
                <span className="badge text-bg-light border me-2">{kindLabel(link.kind)}</span>
                {link.other ? (
                  <Link to={`${path}/${link.other_id}`}>{link.other.name}</Link>
                ) : (
                  <span className="font-monospace small">{link.other_id}</span>
                )}
                <div className="small text-body-secondary">
                  {link.valid_from ? `od ${formatDate(link.valid_from)}` : "bez dátumu"}
                  {link.valid_to ? ` do ${formatDate(link.valid_to)}` : link.valid_from ? " — trvá" : ""}
                </div>
              </span>
              <span className="text-end flex-shrink-0">
                {/* Odvodené prepojenie je naše tvrdenie, nie citácia — musí to
                    byť vidieť skôr, než ho niekto začne brať ako zdrojované. */}
                {link.derived
                  ? <span className="badge text-bg-warning">odvodené nami</span>
                  : <span className="badge text-bg-light border">{(link.sources ?? []).length} zdroj(e)</span>}
                <div>
                  <button
                    className="btn btn-link btn-sm p-0 text-danger"
                    type="button"
                    onClick={() => setDeleting(link)}
                  >
                    zmazať
                  </button>
                </div>
              </span>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="list-group-item text-body-secondary small">Žiadne prepojenia.</li>
        )}
      </ul>

      {deleting && (
        <ReasonDialog
          title="Zmazať prepojenie"
          hint="Mazanie je oprava omylu. Ak prepojenie len skončilo, patrí mu dátum do — to sa robí v editore prepojenia, nie tu."
          busy={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={async (reason) => {
            await remove.mutateAsync({ id: deleting.id, reason });
            setDeleting(null);
          }}
        />
      )}
    </Card>
  );
}

/**
 * Články priradené k osobe alebo subjektu. Väzba je uložená na článku, takže
 * pripojenie aj odpojenie mení článok — nie profil.
 */
export function EntityArticlesPanel({ entityId, entityType, articles = [], title = "Priradené články" }) {
  const link = useLinkArticle();
  const [picking, setPicking] = useState(false);
  const [detaching, setDetaching] = useState(null);
  const field = ENTITY[entityType].field;

  return (
    <Card
      title={title}
      count={articles.length}
      footer={
        <>
          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => setPicking(true)}>
            Priradiť článok
          </button>
          {link.isError && <div className="alert alert-danger py-2 mt-2 mb-0">{link.error.message}</div>}
        </>
      }
    >
      <ul className="list-group list-group-flush">
        {articles.map((article) => (
          <li className="list-group-item d-flex justify-content-between gap-2" key={article.id}>
            <span>
              <a href={article.url} target="_blank" rel="noreferrer noopener" className="fw-semibold">
                {article.title}
              </a>
              <div className="small text-body-secondary">
                {article.publisher} · {formatMoment(article.published_at)}
                {article.kind === "official" && (
                  <span className="badge text-bg-primary ms-2">úradný dokument</span>
                )}
              </div>
            </span>
            <span className="text-end flex-shrink-0">
              <Link className="small" to={`/clanky/${article.id}`}>otvoriť</Link>
              <div>
                <button
                  className="btn btn-link btn-sm p-0 text-danger"
                  type="button"
                  onClick={() => setDetaching(article)}
                >
                  odpojiť
                </button>
              </div>
            </span>
          </li>
        ))}
        {articles.length === 0 && (
          <li className="list-group-item text-body-secondary small">
            Žiadne priradené články. Zdroj sa vyhľadá medzi uloženými článkami — úradný dokument sa
            dá založiť priamo v tom okne.
          </li>
        )}
      </ul>

      {picking && (
        <SourcePicker
          onClose={() => setPicking(false)}
          onPick={(articleId) =>
            link.mutate({ articleId, field, add: entityId, reason: "priradenie článku" })
          }
        />
      )}

      {detaching && (
        <ReasonDialog
          title="Odpojiť článok"
          hint={`„${detaching.title}“ zostane v registri článkov, len prestane patriť k tomuto záznamu. Údaje, ktoré sa naň odvolávajú, ostávajú — skontroluj ich.`}
          busy={link.isPending}
          onCancel={() => setDetaching(null)}
          onConfirm={async (reason) => {
            await link.mutateAsync({ articleId: detaching.id, field, remove: entityId, reason });
            setDetaching(null);
          }}
        />
      )}
    </Card>
  );
}

/**
 * Rola priamo z článku. Toto je najkratšia cesta od zdroja k tvrdeniu: článok,
 * ktorý sa práve číta, je zdrojom role — nie je dôvod ho hľadať znova
 * v pickeri na inej obrazovke.
 *
 * Rola patrí do kauzy, takže sa dá pridať len vtedy, keď je článok pri nejakej
 * priradený; inak by nebolo kam ju zapísať.
 */
export function ArticleRoleButton({ articleId, entityId, entityType, caseOptions = [] }) {
  const addRole = useAddRoleAnywhere();
  const [open, setOpen] = useState(false);
  useEscape(() => setOpen(false));

  if (caseOptions.length === 0) {
    return (
      <span className="small text-body-secondary">
        rolu pridáš, keď bude článok priradený ku kauze
      </span>
    );
  }

  return (
    <>
      <button className="btn btn-link btn-sm p-0" type="button" onClick={() => setOpen(true)}>
        + rola v kauze
      </button>

      {open && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,.5)" }} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Rola v kauze</h5>
                <button className="btn-close" type="button" onClick={() => setOpen(false)} aria-label="Zavrieť" />
              </div>
              <div className="modal-body">
                <p className="small text-body-secondary">
                  Zdrojom role bude tento článok. Zmena statusu sa neskôr rieši novou rolou —
                  táto zostane v histórii.
                </p>
                <RoleForm
                  entityId={entityId}
                  entityType={entityType}
                  caseOptions={caseOptions}
                  sources={[articleId]}
                  busy={addRole.isPending}
                  error={addRole.error}
                  onCancel={() => setOpen(false)}
                  onSubmit={async (body) => {
                    await addRole.mutateAsync(body);
                    setOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

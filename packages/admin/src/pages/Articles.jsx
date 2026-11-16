// Fronta článkov a ich spracovanie (zadanie §7).
//
// Matcher zatiaľ neexistuje — worker vie články len stiahnuť. Blok „Zistenia
// z parsovania" preto nie je prázdny rámik, ale text, ktorý hovorí, že sa
// priraďuje ručne. Ručné priradenie funguje samo o sebe.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useArticle, useArticles, usePatchArticle } from "../api/queries.js";
import { ArticleEntities, ArticleRoleButton, ProceedingsPanel } from "../assign.jsx";
import { PageHeader } from "../layout.jsx";
import {
  EmptyState, ErrorState, Notice, ReasonDialog, Spinner, formatDateTime, formatMoment,
} from "../ui.jsx";

const STATUSES = [
  ["candidate", "Nespracované"],
  ["processed", "Spracované"],
  ["linked", "Priradené"],
  ["rejected", "Zamietnuté"],
];

export function ArticleQueue() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "candidate";
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";

  const { data, isLoading, error, refetch } = useArticles({
    status, q: q || undefined, kind: kind || undefined, limit: 50,
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Články" subtitle="Zdroje stiahnuté crawlerom a ručne pridané úradné dokumenty" />

      <ul className="nav nav-pills mb-3">
        {STATUSES.map(([value, label]) => (
          <li className="nav-item" key={value}>
            <button
              type="button"
              className={`nav-link ${status === value ? "active" : ""}`}
              onClick={() => setParam("status", value)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      <div className="d-flex gap-2 mb-3">
        <input
          className="form-control form-control-sm" style={{ maxWidth: 320 }}
          defaultValue={q} placeholder="hľadaj v titulkoch a perexoch…"
          onKeyDown={(e) => e.key === "Enter" && setParam("q", e.currentTarget.value)}
          onBlur={(e) => setParam("q", e.target.value)}
        />
        <select className="form-select form-select-sm w-auto" value={kind} onChange={(e) => setParam("kind", e.target.value)}>
          <option value="">médiá aj úradné</option>
          <option value="media">médiá</option>
          <option value="official">úradné dokumenty</option>
        </select>
      </div>

      {isLoading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="Fronta je prázdna"
          hint="Články sa objavia, keď crawler nabehne na feedy — alebo keď niekto pridá úradný dokument."
        />
      )}

      {data && data.items.length > 0 && (
        <div className="list-group">
          {data.items.map((article) => (
            <Link className="list-group-item list-group-item-action" to={`/clanky/${article.id}`} key={article.id}>
              <div className="d-flex justify-content-between gap-3">
                <span className="fw-semibold">{article.title}</span>
                {/* Čas, nie len dátum: vo fronte je bežné mať z jedného dňa
                    desať článkov a poradie je informácia. */}
                <span className="text-nowrap small text-body-secondary">{formatMoment(article.published_at)}</span>
              </div>
              <div className="d-flex flex-wrap gap-2 align-items-center mt-1 small text-body-secondary">
                <span>{article.publisher}</span>
                {article.kind === "official" && <span className="badge text-bg-primary">úradný</span>}
                {article.paywall && <span className="badge text-bg-warning">paywall</span>}
                {!article.has_body && <span className="badge text-bg-light border">len perex</span>}
                {(article.case_ids ?? []).length > 0 && (
                  <span className="badge text-bg-success">{article.case_ids.length} kauza</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function ArticleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useArticle(id);
  const patch = usePatchArticle(id);

  const [kind, setKind] = useState("media");
  const [asking, setAsking] = useState(null); // null | "kind" | "reject"

  const article = data?.article;

  useEffect(() => {
    if (article) setKind(article.kind ?? "media");
  }, [article?._rev]);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const names = data.names ?? {};
  const caseIds = article.case_ids ?? [];
  // Rola patrí do kauzy; ponuka je preto z kauz, ku ktorým je článok priradený.
  const caseOptions = caseIds.map((caseId) => ({ id: caseId, name: names[caseId]?.name ?? caseId }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Články", to: "/clanky" }, { label: article.title }]}
        title={article.title}
        subtitle={
          <>
            {article.publisher} · vydané {formatMoment(article.published_at)}
            {article.fetched_at && (
              <span className="text-body-secondary"> · stiahnuté {formatDateTime(article.fetched_at)}</span>
            )}
          </>
        }
        actions={
          <a className="btn btn-outline-secondary" href={article.url} target="_blank" rel="noreferrer noopener">
            Otvoriť originál
          </a>
        }
      />

      <div className="row g-3">
        <div className="col-lg-7">
          <Notice tone="warning">
            <div className="small">
              <strong>Plný text je interný pracovný podklad.</strong> Verejné API ho nikdy nevracia —
              von ide len titulok, vydavateľ, dátum, odkaz a krátky výňatok.
            </div>
          </Notice>

          <div className="card mb-3">
            <div className="card-body">
              {article.body ? (
                <p style={{ whiteSpace: "pre-wrap" }}>{article.body}</p>
              ) : (
                <>
                  <p className="text-body-secondary">
                    Plný text nie je stiahnutý — crawler zatiaľ ukladá len to, čo médium syndikuje vo
                    feede. Perex:
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{article.excerpt || <em>bez perexu</em>}</p>
                </>
              )}
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-header fw-semibold">Zistenia z parsovania</div>
            <div className="card-body text-body-secondary small">
              Matcher zatiaľ nebeží, takže z článku nie sú automatické zistenia. Priraďuje sa ručne
              vpravo — funguje to nezávisle od neho.
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <label className="form-label">Typ zdroja</label>
              <select className="form-select" value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="media">médium</option>
                <option value="official">úradný dokument</option>
              </select>
              <div className="d-flex gap-2 mt-3">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={kind === article.kind}
                  onClick={() => setAsking("kind")}
                >
                  Uložiť typ
                </button>
                <button className="btn btn-outline-danger ms-auto" type="button" onClick={() => setAsking("reject")}>
                  Zamietnuť článok
                </button>
              </div>
              {patch.isError && <div className="alert alert-danger mt-3 py-2 mb-0">{patch.error.message}</div>}
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          {/* Priradenie sa ukladá hneď, nie až tlačidlom: každá väzba je vlastný
              zápis s dôvodom v audite. Uložiť naraz by znamenalo jeden dôvod na
              päť rôznych rozhodnutí. */}
          <ArticleEntities
            kind="case" title="Priradenie ku kauzám"
            articleId={id} ids={caseIds} names={names}
            hint="Kauza, ktorá ešte nie je v registri, sa dá založiť rovno tu — vznikne ako koncept."
          />

          <ArticleEntities
            kind="person" title="Priradenie k osobám"
            articleId={id} ids={article.person_ids ?? []} names={names}
            hint="Priradenie znamená „článok o nej hovorí“. Čím v kauze je, povie rola."
            renderExtra={(personId) => (
              <ArticleRoleButton
                articleId={id} entityId={personId} entityType="person" caseOptions={caseOptions}
              />
            )}
          />

          <ArticleEntities
            kind="org" title="Priradenie k subjektom"
            articleId={id} ids={article.org_ids ?? []} names={names}
            hint="Firmy, strany a inštitúcie. Aj subjekt môže mať v kauze rolu."
            renderExtra={(orgId) => (
              <ArticleRoleButton
                articleId={id} entityId={orgId} entityType="org" caseOptions={caseOptions}
              />
            )}
          />

          <ProceedingsPanel
            field="sources" valueId={id} items={data.proceedings ?? []}
            title="Priradenie k súdnym konaniam"
            hint="Uznesenie alebo rozsudok je zdrojom konania — pripojením sa oň konanie začne opierať."
          />
        </div>
      </div>

      {asking === "kind" && (
        <ReasonDialog
          title="Zmeniť typ zdroja"
          busy={patch.isPending}
          onCancel={() => setAsking(null)}
          onConfirm={async (reason) => {
            await patch.mutateAsync({ kind, reason });
            setAsking(null);
          }}
        />
      )}
      {asking === "reject" && (
        <ReasonDialog
          title="Zamietnuť článok"
          hint="Článok sa nezmaže, len vypadne z frontu. Dôvod zostane v histórii."
          busy={patch.isPending}
          onCancel={() => setAsking(null)}
          onConfirm={async (reason) => {
            await patch.mutateAsync({ status: "rejected", reason });
            setAsking(null);
            navigate("/clanky");
          }}
        />
      )}
    </>
  );
}

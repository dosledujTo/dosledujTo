// Prehľad (zadanie §4). Nie sklad grafov — štyri bloky v poradí naliehavosti.
//
// Podiel údajov bez zdroja nie je metrika ako každá iná: ak nie je 100 %, blok
// sa zvýrazní ako chyba. Je to jediný ukazovateľ, ktorý smie kričať.

import { Link } from "react-router-dom";
import { useSummary } from "../api/queries.js";
import { PageHeader } from "../layout.jsx";
import { ErrorState, Spinner } from "../ui.jsx";

function WaitingCard({ count, label, hint, to, tone = "primary" }) {
  return (
    <div className="col-md-4">
      <Link to={to} className="text-decoration-none">
        <div className={`card h-100 border-${count ? tone : "light"}`}>
          <div className="card-body">
            <div className={`display-6 ${count ? `text-${tone}` : "text-body-secondary"}`}>{count ?? 0}</div>
            <div className="fw-semibold text-body">{label}</div>
            <div className="small text-body-secondary">{hint}</div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function CoverageBlock({ coverage }) {
  const ratio = coverage?.ratio;
  const perfect = ratio === 1;
  const percent = ratio === null || ratio === undefined ? "—" : `${(ratio * 100).toFixed(1)} %`;

  return (
    <div className={`card mb-4 ${perfect ? "" : "border-danger"}`}>
      <div className="card-header d-flex justify-content-between align-items-center">
        <span className="fw-semibold">Kvalita dát</span>
        {!perfect && <span className="badge text-bg-danger">vyžaduje pozornosť</span>}
      </div>
      <div className="card-body">
        <div className="row g-4">
          <div className="col-md-4">
            <div className={`h3 mb-0 ${perfect ? "text-success" : "text-danger"}`}>{percent}</div>
            <div className="small text-body-secondary">
              údajov s funkčným zdrojom (cieľ 100 %)
            </div>
            <div className="small text-body-secondary">
              {coverage?.published_fields_with_source ?? 0} z {coverage?.published_fields ?? 0} publikovaných polí
            </div>
          </div>

          <div className="col-md-8">
            <table className="table table-sm mb-0 align-middle">
              <thead>
                <tr className="text-body-secondary small">
                  <th>typ</th><th className="text-end">dokumentov</th>
                  <th className="text-end">polí</th><th className="text-end">so zdrojom</th>
                  <th className="text-end">odvodených</th><th className="text-end">sporných</th>
                </tr>
              </thead>
              <tbody>
                {(coverage?.by_type ?? [])
                  .filter((row) => row.fields > 0)
                  .map((row) => (
                    <tr key={`${row.type}-${row.bucket}`}>
                      <td>{row.type} <span className="text-body-secondary small">{row.bucket}</span></td>
                      <td className="text-end">{row.documents}</td>
                      <td className="text-end">{row.fields}</td>
                      <td className={`text-end ${row.with_source < row.fields ? "text-danger fw-semibold" : ""}`}>
                        {row.with_source}
                      </td>
                      <td className="text-end">{row.derived}</td>
                      <td className="text-end">{row.disputed}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="small text-body-secondary mb-0 mt-3">
          Podiel údajov podložených <em>úradným</em> zdrojom sa tu zatiaľ nepočíta — view
          <code className="mx-1">stats/coverage</code> vidí vždy len jeden dokument a druh zdroja je na
          článku. Treba to dopočítať v API (viď <code>couch/README.md</code>).
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error, refetch } = useSummary();

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const queue = data?.queue ?? {};

  return (
    <>
      <PageHeader title="Prehľad" subtitle="Čo čaká na spracovanie a v akom stave sú dáta" />

      <h2 className="h6 text-body-secondary text-uppercase mb-2">Čaká na mňa</h2>
      <div className="row g-3 mb-4">
        <WaitingCard
          count={queue.pending} to="/podnety" tone="danger"
          label="podnetov na rozhodnutie"
          hint={queue.pending_bot ? `z toho ${queue.pending_bot} od bota` : "od používateľov"}
        />
        <WaitingCard
          count={queue.unprocessed_articles} to="/clanky" tone="warning"
          label="nespracovaných článkov"
          hint="stiahnuté crawlerom, čakajú na priradenie"
        />
        <WaitingCard
          count={0} to="/kauzy" tone="secondary"
          label="káuz bez pohybu 60+ dní"
          hint="metriku zatiaľ backend nepočíta"
        />
      </div>

      <CoverageBlock coverage={data?.coverage} />

      <div className="card">
        <div className="card-header fw-semibold">Posledný pohyb</div>
        <div className="card-body text-body-secondary">
          Prehľad zmien za posledných 7 dní potrebuje dotaz na revízie podľa obdobia — dnes sa
          revízie čítajú len podľa cieľa alebo autora. Je to jedna z vecí zo zoznamu v §12 zadania.
        </div>
      </div>
    </>
  );
}

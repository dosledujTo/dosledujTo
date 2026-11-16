// Zoznam subjektov: firmy, politické strany a inštitúcie.
//
// Prečo vlastná sekcia a nie len položky vo vyhľadávaní: firma sa v kauzách
// opakuje rovnako ako meno, len je menej vidieť. Zoznam odpovedá na otázku,
// ktorú si nad jednou kauzou nepoloží nikto — *kde všade ešte tento subjekt
// figuruje*.

import { Link, useSearchParams } from "react-router";
import { GetForm } from "../components/GetForm.jsx";
import { api } from "../api.js";
import { Empty } from "../components/chrome.jsx";
import { orgKindLabel, plural } from "../format.js";

const KINDS = [
  ["", "všetky"],
  ["party", "politické strany"],
  ["company", "firmy"],
  ["institution", "inštitúcie"],
];

export async function load({ query }) {
  const result = await api("/orgs", { q: query.q, kind: query.kind, limit: 60 });
  return { result };
}

export const meta = () => ({
  title: "Subjekty — Dosleduj.to",
  description: "Firmy, politické strany a inštitúcie, ktoré figurujú v evidovaných kauzách.",
  canonical: "/subjekty",
});

export default function Orgs({ data }) {
  const [params] = useSearchParams();
  const { result } = data;
  const total = result.total ?? result.items.length;

  return (
    <main id="obsah" className="wrap">
      <section style={{ padding: "40px 0 8px" }}>
        <div className="kicker">Register</div>
        <h1 className="h1" style={{ fontSize: 48, margin: "16px 0 12px" }}>Subjekty</h1>
        <p className="dek prose">
          Firmy, politické strany a inštitúcie. Pri strane je vidieť aj kauzy, ktoré sa jej týkajú
          cez jej ľudí — to nie je tvrdenie o strane, ale súvislosť, ktorá inde zapadne.
        </p>
      </section>

      <GetForm className="filters" action="/subjekty">
        <div>
          <label htmlFor="o-q">Názov</label>
          <input
            id="o-q" type="search" name="q"
            defaultValue={params.get("q") ?? ""} placeholder="aj bez diakritiky"
          />
        </div>
        <div>
          <label htmlFor="o-kind">Druh</label>
          <select id="o-kind" name="kind" defaultValue={params.get("kind") ?? ""}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-line btn-gold" style={{ padding: "8px 18px", fontSize: 13 }}>
          Hľadať
        </button>
        <span className="count tnum" style={{ marginLeft: "auto" }}>
          {total} {plural(total, "subjekt", "subjekty", "subjektov")}
        </span>
      </GetForm>

      {result.items.length === 0 ? (
        <Empty>Nič také sa nenašlo.</Empty>
      ) : (
        <div className="people-grid">
          {result.items.map((item) => (
            <div className="person-row" key={item.id}>
              <Link to={`/subjekt/${item.slug}`}>{item.title}</Link>
              <p>
                {orgKindLabel(item.kind)}
                {item.ico && <span className="tnum"> · IČO {item.ico}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

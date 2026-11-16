import { Link, useSearchParams } from "react-router";
import { GetForm } from "../components/GetForm.jsx";
import { api } from "../api.js";
import { Empty } from "../components/chrome.jsx";
import { plural } from "../format.js";

export async function load({ query }) {
  const result = await api("/persons", { q: query.q, limit: 60 });
  return { result };
}

export const meta = () => ({
  title: "Ľudia — Dosleduj.to",
  description: "Ľudia, ktorí figurujú v evidovaných kauzách, a ich role.",
  canonical: "/osoby",
});

export default function Persons({ data }) {
  const [params] = useSearchParams();
  const { result } = data;
  const total = result.total ?? result.items.length;

  return (
    <main id="obsah" className="wrap">
      <section style={{ padding: "40px 0 8px" }}>
        <div className="kicker">Register</div>
        <h1 className="h1" style={{ fontSize: 48, margin: "16px 0 12px" }}>Ľudia</h1>
        <p className="dek prose">
          Hlavná pridaná hodnota registra: z jedného miesta je vidieť, či sa meno opakuje
          naprieč viacerými kauzami.
        </p>
      </section>

      <GetForm className="filters" action="/osoby">
        <div>
          <label htmlFor="p-q">Meno</label>
          <input id="p-q" type="search" name="q" defaultValue={params.get("q") ?? ""} placeholder="aj bez diakritiky" />
        </div>
        <button type="submit" className="btn-line btn-gold" style={{ padding: "8px 18px", fontSize: 13 }}>
          Hľadať
        </button>
        <span className="count tnum" style={{ marginLeft: "auto" }}>
          {total} {plural(total, "osoba", "osoby", "osôb")}
        </span>
      </GetForm>

      {result.items.length === 0 ? (
        <Empty>Nikto taký sa nenašiel.</Empty>
      ) : (
        <div className="people-grid">
          {result.items.map((item) => (
            <div className="person-row" key={item.id}>
              <Link to={`/osoba/${item.slug}`}>{item.title}</Link>
              {item.summary && <p>{String(item.summary).slice(0, 120)}…</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

import { Link, useSearchParams } from "react-router";
import { GetForm } from "../components/GetForm.jsx";
import { api } from "../api.js";
import { Empty } from "../components/chrome.jsx";
import { formatDate, safeUrl } from "../format.js";

export async function load({ query }) {
  const q = (query.q ?? "").trim();
  if (!q) return { q: "", entities: [], articles: [] };

  const [entities, articles] = await Promise.all([
    api("/search", { q, limit: 20 }),
    api("/search", { q, type: "article", limit: 8 }),
  ]);
  return { q, entities: entities.items, articles: articles.items };
}

export const meta = ({ data }) => ({
  title: data.q ? `Hľadanie: ${data.q} — Dosleduj.to` : "Hľadanie — Dosleduj.to",
  noindex: true,
});

const GROUPS = [
  { type: "case", title: "Kauzy", path: "kauza" },
  { type: "person", title: "Ľudia", path: "osoba" },
  { type: "org", title: "Subjekty", path: "subjekt" },
];

export default function Search({ data }) {
  const [params] = useSearchParams();
  const groups = GROUPS
    .map((group) => ({ ...group, items: data.entities.filter((e) => e.type === group.type) }))
    .filter((group) => group.items.length > 0);

  return (
    <main id="obsah" className="wrap">
      <section style={{ padding: "40px 0 8px" }}>
        <div className="kicker">Hľadanie</div>
        <h1 className="h1" style={{ fontSize: 48, margin: "16px 0 20px" }}>
          {data.q ? `„${data.q}"` : "Čo hľadáte?"}
        </h1>
        <GetForm className="search-row" action="/hladat" role="search">
          <label className="vh" htmlFor="s-q">Hľadaný výraz</label>
          <input id="s-q" type="search" name="q" defaultValue={params.get("q") ?? ""}
            placeholder="meno, názov kauzy alebo firmy" />
          <button type="submit">Hľadať</button>
        </GetForm>
        <p className="note" style={{ marginTop: 12 }}>Diakritika nie je potrebná.</p>
      </section>

      {data.q && groups.length === 0 && data.articles.length === 0 && (
        <Empty>
          Nenašlo sa nič. Register má zatiaľ obmedzený počet dôkladne spracovaných káuz —
          kvalita je dôležitejšia ako pokrytie.
        </Empty>
      )}

      {groups.map((group) => (
        <section className="section" key={group.type}>
          <h2 className="h2-sm" style={{ marginBottom: 16 }}>{group.title}</h2>
          <ul className="aside-list">
            {group.items.map((item) => (
              <li key={item.id}>
                <Link to={`/${group.path}/${item.slug ?? item.id}`}>{item.title}</Link>
                {item.summary && (
                  <span className="aside-role" style={{ textTransform: "none", letterSpacing: 0 }}>
                    {String(item.summary).slice(0, 70)}…
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {data.articles.length > 0 && (
        <section className="section" style={{ borderBottom: "none" }}>
          <h2 className="h2-sm" style={{ marginBottom: 16 }}>Zdroje</h2>
          <ol className="srcs-list tnum">
            {data.articles.map((article, index) => (
              <li key={article.id}>
                <span className="n">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <a className="t" href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer nofollow">
                    {article.title}
                  </a>
                  <span className="meta">{article.publisher} · {formatDate(article.published_at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

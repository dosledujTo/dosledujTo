import { Link } from "react-router";

export async function load() { return {}; }
export const meta = () => ({ title: "Stránka neexistuje — Dosleduj.to", noindex: true, status: 404 });

export default function NotFound() {
  return (
    <main id="obsah" className="wrap">
      <section style={{ padding: "80px 0 120px", maxWidth: "52ch" }}>
        <div className="kicker">404</div>
        <h1 className="h1" style={{ fontSize: 48, margin: "16px 0 20px" }}>Toto tu nie je</h1>
        <p className="dek prose">
          Adresa nesedí na žiadnu kauzu ani osobu. Mohla sa zmeniť, alebo záznam nie je
          zverejnený — údaj bez zdroja sa nezverejňuje.
        </p>
        <p><Link to="/kauzy">Prejsť na zoznam káuz</Link> alebo <Link to="/">na titulku</Link>.</p>
      </section>
    </main>
  );
}

// Ako počítame (handoff „Červená niť" kap. 6). Pravidlá metrík sú rozhodnutia
// registra, nie fakty — preto sú vypísané celé, na jednom mieste. Ich
// implementácia je `packages/shared/src/metrics.js` a testy `test/metrics.test.js`;
// keď sa zmení jedno, musí sa zmeniť aj toto.

import { Link } from "react-router";
import { api } from "../api.js";
import { BUCKET_LABELS } from "../format.js";

export async function load({ signal }) {
  // Prahy „zabudnutej" kauzy sú v konfigurácii; text ich berie z API, aby
  // stránka netvrdila iné čísla, než aké platia.
  const forgotten = await api("/cases/forgotten", { limit: 1 }, { signal });
  return { rules: forgotten.rules };
}

export const meta = () => ({
  title: "Ako počítame — Dosleduj.to",
  description: "Pravidlá, podľa ktorých register počíta peniaze v kauzách, rebríček najčastejšie spomínaných káuz a zabudnuté kauzy.",
  canonical: "/ako-pocitame",
});

export default function HowWeCount({ data }) {
  const r = data.rules ?? { min_articles: 20, silence_days: 365 };
  return (
    <main id="obsah" className="wrap prose-page">
      <nav className="crumbs"><Link to="/">Titulka</Link> / Ako počítame</nav>
      <h1 className="h1-case">Ako počítame</h1>
      <p className="lead">
        Čísla na titulke sú súčty a poradia, ktoré register skladá z údajov so zdrojom. Spôsob výpočtu je
        naše rozhodnutie — preto je tu celý. Údaj bez zdroja sa nezapočíta, rovnako ako sa nezverejní.
      </p>

      <section className="section">
        <h2 className="h2-sm">Peniaze v kauzách</h2>
        <ol className="rules">
          <li>
            <b>Suma kauzy je najvyššia suma, ktorá má zdroj.</b> Pri spornej sume sa ráta vyššia verzia. Na
            stránke kauzy sú vidieť všetky verzie, každá so svojím zdrojom — register medzi nimi nerozhoduje.
          </li>
          <li>
            <b>Kauza sa zaradí podľa najďalšej fázy, ktorú dosiahla.</b> Ktorá fáza patrí do ktorého segmentu,
            určuje číselník fáz, nie program — dá sa upraviť bez zásahu do kódu.
          </li>
          <li>
            <b>Viac obvinených s rôznym koncom.</b> Kauza ide do stavu, ktorý sa týka najväčšej časti sumy. Zdroje
            to zvyčajne neuvádzajú; vtedy rozhoduje najzávažnejší uzavretý výsledok v poradí odsúdenie &gt;
            oslobodenie &gt; zastavené &gt; premlčané. Takéto zaradenie je náš odvodený údaj a je tak označené.
          </li>
          <li>
            <b>„Vrátené alebo zaistené"</b> je súčet súm, ktoré zdroj uvádza ako vrátené alebo zaistené. Bez zdroja
            sa nezapočítajú.
          </li>
          <li>
            <b>Kauzy, ktoré nie sú o peniazoch</b> (zásah do vyšetrovania, zneužitie právomoci a podobne), nemajú
            sumu, ale dopad. Do grafu peňazí sa nezapočítavajú a nikde sa neukazujú ako „0 €".
          </li>
        </ol>
        <h3 className="h3" style={{ marginTop: 24 }}>Segmenty</h3>
        <dl className="rules-dl">
          {Object.entries(BUCKET_LABELS).map(([key, [label, hint]]) => (
            <div key={key}><dt><span className={`mk b-${key}`} aria-hidden="true" /> {label}</dt><dd>{hint}</dd></div>
          ))}
        </dl>
      </section>

      <section className="section">
        <h2 className="h2-sm">O čom sa najviac píše</h2>
        <p>
          Skóre = počet článkov a úradných dokumentov ku kauze za obdobie × (počet rôznych vydavateľov / počet
          článkov)<sup>0,5</sup>. Kauzu tak nevytiahne jedno médium, ktoré o nej píše každý deň: tridsať článkov
          z jedného média má skóre asi 5,5, desať článkov z desiatich médií má skóre 10. Zmena v percentách
          porovnáva obdobie s predchádzajúcim obdobím rovnakej dĺžky.
        </p>
      </section>

      <section className="section">
        <h2 className="h2-sm">Zabudnuté, ale nevyriešené</h2>
        <p>
          Kauza je otvorená (nie je v uzavretom segmente), má aspoň {r.min_articles} článkov celkovo a za
          posledných {r.silence_days} dní k nej nevyšiel žiadny článok. Udalosti zo súdu sa nerátajú — ráta sa
          len mediálne ticho.
        </p>
      </section>

      <section className="section">
        <h2 className="h2-sm">Mená v najviac kauzách</h2>
        <p>
          Počet káuz, v ktorých má osoba alebo subjekt rolu so zdrojom — aj ukončenú, aj svedka. <b>Výskyt
          v kauze nie je vina.</b> Rola sa zobrazuje pri každom mene na stránke osoby.
        </p>
      </section>
    </main>
  );
}

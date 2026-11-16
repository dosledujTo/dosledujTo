// Profil osoby a subjektu so štyrmi záložkami (handoff „Červená niť" kap. 3, 5.3).
//
//   /osoba/:slug            Mapa (1 krok)        /subjekt/:slug            …
//   /osoba/:slug/v-case     V čase               /subjekt/:slug/v-case
//   /osoba/:slug/siet       Sieť (2 kroky)       /subjekt/:slug/siet
//   /osoba/:slug/zdroje     Zdroje               /subjekt/:slug/zdroje
//
// Každá záložka má vlastnú adresu a `load`, ktorý volá len to API, ktoré
// potrebuje. Renderuje sa na serveri; dá sa na ňu poslať odkaz.
//
// Subjekt navyše oddeľuje **vlastnú rolu v kauze** od kauz, ktoré sa ho týkajú
// **cez jeho ľudí**: prvé je tvrdenie o subjekte, druhé súvislosť odvodená
// z členstva alebo funkcie. Na Mape sú to dva štýly čiar a pod Mapou to legenda
// hovorí slovom.

import { Link } from "react-router";
import { api } from "../api.js";
import { ConnectionMap } from "../components/ConnectionMap.jsx";
import { Network } from "../components/Network.jsx";
import { ProfileHead, ProfileTabs, Seg, SourceNos, SOURCES_PER_PAGE, qs } from "../components/profile.jsx";
import { SourcesTab } from "../components/SourcesTab.jsx";
import { TimeChart } from "../components/TimeChart.jsx";
import { formatDate, linkLabel, orgKindLabel, plural, todayIso } from "../format.js";

const KINDS = {
  person: {
    api: "/persons",
    path: "/osoba",
    list: { to: "/osoby", label: "Ľudia" },
    name: (doc) => doc.full_name,
    kicker: (doc) => `Osoba${doc.birth_year ? ` · nar. ${doc.birth_year}` : ""}`,
    lead: (doc) => doc.short_bio,
  },
  org: {
    api: "/orgs",
    path: "/subjekt",
    list: { to: "/subjekty", label: "Firmy a strany" },
    name: (doc) => doc.name,
    kicker: (doc) => `${orgKindLabel(doc.kind) || "Subjekt"}${doc.ico ? ` · IČO ${doc.ico}` : ""}`,
    lead: (doc) => doc.summary,
  },
};

/** Filtre Siete v URL → parametre API. */
const netParams = (query) => ({
  depth: 2,
  active: query.platne === "1" ? 1 : undefined,
  derived: query["bez-odvodenych"] === "1" ? 0 : undefined,
  cases_only: query["len-kauzy"] === "1" ? 1 : undefined,
});

/**
 * `load` pre jednu záložku jedného druhu profilu.
 *
 * @param {"person"|"org"} kind
 * @param {"mapa"|"v-case"|"siet"|"zdroje"} tab
 */
export function loadProfile(kind, tab) {
  const k = KINDS[kind];
  return async ({ params, query = {}, signal }) => {
    const slug = encodeURIComponent(params.slug);
    const base = `${k.api}/${slug}`;
    const detail = api(base, {}, { signal });
    let view;
    if (tab === "mapa") view = api(`${base}/graph`, { depth: 2 }, { signal });
    else if (tab === "v-case") view = api(`${base}/graph`, { depth: 1, events: 1 }, { signal });
    else if (tab === "siet") view = api(`${base}/graph`, netParams(query), { signal });
    else {
      view = api(`${base}/articles`, {
        page: Number(query.strana) > 0 ? Number(query.strana) : 1,
        per_page: SOURCES_PER_PAGE,
        type: query.typ === "urad" ? "official" : query.typ === "media" ? "media" : undefined,
        case: query.kauza,
        sort: query.zoradit === "najstarsie" ? "asc" : "desc",
      }, { signal });
    }
    const [doc, data] = await Promise.all([detail, view]);
    return { kind, tab, doc, data, query, today: todayIso() };
  };
}

const TAB_TITLES = { mapa: "Mapa prepojení", "v-case": "Prepojenia v čase", siet: "Sieť do 2 krokov", zdroje: "Zdroje" };

/** @param {"person"|"org"} kind @param {string} tab */
export const metaProfile = (kind, tab) => ({ data }) => {
  const k = KINDS[kind];
  const name = k.name(data.doc);
  const lead = k.lead(data.doc);
  return {
    title: `${name}${tab === "mapa" ? "" : ` · ${TAB_TITLES[tab]}`} — Dosleduj.to`,
    description: lead?.value
      ? String(lead.value).slice(0, 180)
      : `${name} v registri káuz — kauzy, firmy, strany a ľudia v okolí, každé prepojenie so zdrojom.`,
    canonical: `${k.path}/${data.doc.slug}${tab === "mapa" ? "" : `/${tab}`}`,
  };
};

/** Rozsah rokov na záložke V čase, z prepojení, ktoré profil už má. */
function yearsHint(doc, today) {
  const years = (doc.links ?? []).map((l) => l.valid_from).filter(Boolean).map((d) => Number(String(d).slice(0, 4)));
  if (years.length === 0) return "";
  return `${Math.min(...years)}–${Number(today.slice(0, 4)) + 1}`;
}

export default function Profile({ data }) {
  const k = KINDS[data.kind];
  const doc = data.doc;
  const name = k.name(doc);
  const base = `${k.path}/${doc.slug}`;
  const lead = k.lead(doc);
  const leadNos = (lead?.sources ?? []).map((id) => doc.source_nos?.[id] ?? null);

  return (
    <main id="obsah" className="wrap">
      <nav className="crumbs"><Link to={k.list.to}>{k.list.label}</Link> / {name}</nav>
      <ProfileHead
        kicker={k.kicker(doc)}
        title={name}
        lead={lead?.value ?? null}
        leadNos={leadNos}
        base={base}
        counts={doc.counts}
      />
      <p className="prof-fix">
        Niečo tu nesedí?{" "}
        <Link to={`/podnet?${data.kind === "person" ? "osoba" : "subjekt"}=${doc.slug}`}>Poslať podnet so zdrojom →</Link>
      </p>
      <ProfileTabs
        base={base}
        tab={data.tab}
        hints={{ mapa: "1 krok", "v-case": yearsHint(doc, data.today), siet: "2 kroky", zdroje: String(doc.counts?.sources ?? "") }}
      />

      {data.tab === "mapa" && <MapPanel data={data} name={name} base={base} />}
      {data.tab === "v-case" && <TimePanel data={data} name={name} base={base} />}
      {data.tab === "siet" && <NetPanel data={data} name={name} base={base} />}
      {data.tab === "zdroje" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Všetky zdroje</h2>
              <p className="hint">
                Každý článok a úradný dokument, ktorý sa týka {data.kind === "person" ? "tejto osoby" : "tohto subjektu"}.
                Pri každom je uvedené, ktorý údaj podopiera. Úradné dokumenty sú pri rozpore nadradené článkom.
              </p>
            </div>
          </div>
          <SourcesTab data={data.data} base={base} query={data.query} subject={name} />
        </section>
      )}
    </main>
  );
}

function MapPanel({ data, name, base }) {
  const isOrg = data.kind === "org";
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Mapa prepojení</h2>
          <p className="hint">
            {isOrg
              ? "Vľavo ľudia, vpravo kauzy, dole firmy a strany, s ktorými ho spájajú spoloční ľudia."
              : "Vľavo firmy a strany, vpravo kauzy, dole ľudia, s ktorými sa stretáva."}{" "}
            Pri každej čiare je rola, obdobie a číslo zdroja. Kliknutím na uzol sa presunieš na jeho profil.
          </p>
        </div>
        <div className="legend">
          <span><i className="sw" />platí</span>
          <span><i className="sw e" />ukončené</span>
          <span><i className="sw d" />odvodené</span>
          <span><i className="sw c" />{isOrg ? "vlastná rola v kauze" : "rola v kauze"}</span>
          {isOrg && <span><i className="sw c d" />cez svojich ľudí</span>}
        </div>
      </div>
      <ConnectionMap
        graph={data.data}
        centerId={data.doc.id}
        base={base}
        label={`Mapa prepojení: ${name}`}
        subtitle={data.kind === "person" ? (data.doc.birth_year ? `nar. ${data.doc.birth_year}` : null) : orgKindLabel(data.doc.kind)}
      />
      {isOrg && (
        <p className="hint map-note">
          <b>Vlastná rola v kauze</b> je tvrdenie o subjekte — so zdrojom a s platnosťou v čase.{" "}
          <b>Cez svojich ľudí</b> znamená, že v kauze figuruje niekto, kto je so subjektom spojený
          (člen, štatutár, vlastník). To nie je tvrdenie o subjekte, len súvislosť.
        </p>
      )}
    </section>
  );
}

function TimePanel({ data, name, base }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Prepojenia v čase</h2>
          <p className="hint">
            Riadok pre každú firmu, stranu a kauzu. Pruh ukazuje, odkedy dokedy väzba trvala — hneď vidno, čo sa prekrývalo.
          </p>
        </div>
        <div className="legend">
          <span><i className="sw org-bar" />funkcia vo firme alebo strane</span>
          <span><i className="sw case-bar" />rola v kauze</span>
          <span><i className="dia" />udalosť</span>
          <span><i className="dia future" />očakávaná udalosť</span>
        </div>
      </div>
      <TimeChart graph={data.data} centerId={data.doc.id} base={base} today={data.today} label={`Prepojenia v čase: ${name}`} />
      {(data.data.insights ?? []).map((o) => (
        <div className="insight" key={`${o.link.id}-${o.case.id}`}>
          <b>Prekrytie</b>
          <span>
            <Link to={`/subjekt/${o.org.slug}`}>{o.org.name}</Link> mala vlastnú rolu v kauze{" "}
            <Link to={`/kauza/${o.case.slug}`}>{o.case.name}</Link> — „{o.event.title}" ({formatDate(o.event.occurred_on)}) —
            v čase, keď bol {name} podľa zdroja jej {linkLabel(o.link.kind)}. Je to <u>odvodený údaj</u>: dva zdroje
            spojil register, nie médiá. <SourceNos base={base} nos={o.source_nos} derived derivation={o.derivation} />
          </span>
        </div>
      ))}
    </section>
  );
}

function NetPanel({ data, name, base }) {
  const q = data.query;
  const toggle = (key) => `${base}/siet${qs({ ...pick(q), [key]: q[key] === "1" ? undefined : "1" })}`;
  const g = data.data;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Sieť do 2 krokov</h2>
          <p className="hint">
            Všetci a všetko do dvoch krokov. Uzol sa dá ťahať, plátno posúvať a približovať; klik otvorí profil.
            Ľudia sú spojení priamo len vtedy, ak to tvrdí zdroj — spoločná kauza alebo firma vedie vždy cez jej uzol.
          </p>
        </div>
        <div className="legend">
          <span><i className="shape person" />osoba</span>
          <span><i className="shape org" />firma alebo strana</span>
          <span><i className="shape case" />kauza</span>
        </div>
      </div>
      <div className="src-tools">
        <Seg
          label="Filtre siete"
          options={[
            { label: "len platné väzby", href: toggle("platne"), current: q.platne === "1" },
            { label: "bez odvodených", href: toggle("bez-odvodenych"), current: q["bez-odvodenych"] === "1" },
            { label: "len kauzy", href: toggle("len-kauzy"), current: q["len-kauzy"] === "1" },
          ]}
        />
        {g.truncated && (
          <span className="net-trunc" role="status">
            {`Zobrazených ${g.truncated.shown} z ${g.truncated.total}. Zúž filter.`}
          </span>
        )}
      </div>
      {g.nodes.length <= 1 ? (
        <p className="empty">Pre tento filter tu nie je žiadne prepojenie.</p>
      ) : (
        <Network graph={g} centerId={data.doc.id} base={base} label={`Sieť prepojení: ${name}, ${g.nodes.length - 1} ${plural(g.nodes.length - 1, "uzol", "uzly", "uzlov")}`} />
      )}
    </section>
  );
}

const pick = (q) => ({ platne: q.platne, "bez-odvodenych": q["bez-odvodenych"], "len-kauzy": q["len-kauzy"] });

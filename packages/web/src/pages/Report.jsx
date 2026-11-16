// Podnet na opravu (handoff „Červená niť" kap. 5.5).
//
//   /podnet                 návrh novej kauzy (komentár je povinný)
//   /podnet?kauza=<slug>    podnet ku kauze
//   /podnet?osoba=<slug>    podnet k osobe
//   /podnet?subjekt=<slug>  podnet k firme, strane alebo inštitúcii
//
// Odosiela sa na existujúce `/api/{cases,persons}/:id/suggestions` alebo
// `/api/suggestions`, s Turnstile a CSRF hlavičkou — preto to bez JavaScriptu
// nejde a stránka to povie. Odkaz na zdroj je povinný: podnet bez zdroja
// register neprijme, rovnako ako údaj bez zdroja nezverejní.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../api.js";

export async function load({ query = {}, signal }) {
  const [config, target] = await Promise.all([
    api("/public-config", {}, { signal }),
    query.kauza
      ? api(`/cases/${encodeURIComponent(query.kauza)}`, {}, { signal }).then((c) => ({ type: "case", id: c.id, slug: c.slug, name: c.title }))
      : query.osoba
        ? api(`/persons/${encodeURIComponent(query.osoba)}`, {}, { signal }).then((p) => ({ type: "person", id: p.id, slug: p.slug, name: p.full_name }))
        : query.subjekt
          ? api(`/orgs/${encodeURIComponent(query.subjekt)}`, {}, { signal }).then((o) => ({ type: "org", id: o.id, slug: o.slug, name: o.name }))
          : Promise.resolve(null),
  ]);
  return { siteKey: config.turnstile_site_key, target };
}

export const meta = ({ data }) => ({
  title: `Poslať podnet${data.target ? ` — ${data.target.name}` : ""} — Dosleduj.to`,
  description: "Našli ste chybu alebo ste dotknutá osoba? Pošlite podnet so zdrojom.",
  canonical: "/podnet",
  noindex: true,
});

const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Turnstile widget — načíta sa až v prehliadači. */
function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!siteKey) return undefined;
    let widget = null;
    const render = () => {
      if (!window.turnstile || !ref.current || widget !== null) return;
      widget = window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, "expired-callback": () => onToken(null) });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement("script");
      script.src = TURNSTILE;
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      if (widget !== null && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey]);
  return <div ref={ref} className="captcha" />;
}

export default function Report({ data }) {
  const { target, siteKey } = data;
  const [sources, setSources] = useState([""]);
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(null);
  const [state, setState] = useState({ busy: false, error: null, done: null });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const urls = sources.map((s) => s.trim()).filter(Boolean);
  const needsComment = !target;
  const ready = urls.length > 0 && (!needsComment || comment.trim().length >= 10) && (!siteKey || token);

  async function submit(event) {
    event.preventDefault();
    if (!ready) return;
    setState({ busy: true, error: null, done: null });
    try {
      const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin" }).then((r) => r.json());
      const url = target?.type === "case" ? `/api/cases/${target.id}/suggestions`
        : target?.type === "person" ? `/api/persons/${target.id}/suggestions`
          : target?.type === "org" ? `/api/orgs/${target.id}/suggestions`
            : "/api/suggestions";
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.csrf_token },
        body: JSON.stringify({
          source_urls: urls,
          comment: comment.trim() || undefined,
          submitter_email: email.trim() || undefined,
          captcha_token: token ?? undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Podnet sa nepodarilo odoslať.");
      setState({ busy: false, error: null, done: body.suggestion });
    } catch (err) {
      setState({ busy: false, error: err.message, done: null });
    }
  }

  if (state.done) {
    const number = String(state.done.id).split("-").at(-1).replace(/^0+/, "").slice(-8).toUpperCase();
    return (
      <main id="obsah" className="wrap prose-page">
        <section style={{ padding: "60px 0 100px", maxWidth: "60ch" }}>
          <div className="kicker">Podnet prijatý</div>
          <h1 className="h1-case">Ďakujeme. Podnet č. {number}</h1>
          <p className="lead">
            Moderátor ho posúdi podľa zdroja, ktorý ste uviedli. Údaj bez zdroja register nezverejní — ani po podnete.
            {email && " Ak ste uviedli e-mail, ozveme sa, keď bude podnet vybavený."}
          </p>
          <p>{target ? <Link to={`/${target.type === "case" ? "kauza" : target.type === "org" ? "subjekt" : "osoba"}/${target.slug}`}>Späť na {target.name}</Link> : <Link to="/">Späť na titulku</Link>}</p>
        </section>
      </main>
    );
  }

  return (
    <main id="obsah" className="wrap prose-page">
      <nav className="crumbs"><Link to="/">Titulka</Link> / Poslať podnet</nav>
      <h1 className="h1-case">Poslať podnet</h1>
      <p className="lead">
        {target
          ? <>Podnet k {target.type === "case" ? "kauze" : target.type === "org" ? "subjektu" : "osobe"} <b>{target.name}</b>. </>
          : "Návrh novej kauzy alebo oprava, ktorá sa netýka jednej stránky. "}
        Podnet môže poslať ktokoľvek — musí však obsahovať odkaz na zdroj. Bez neho ho nevieme overiť.
      </p>

      <noscript>
        <p className="report-note">Formulár potrebuje JavaScript (overenie, že nie ste robot). Podnet nám môžete poslať aj e-mailom.</p>
      </noscript>

      <form className="report" onSubmit={submit} aria-describedby="report-rules">
        <fieldset disabled={!mounted || state.busy}>
          <label htmlFor="r-src-0">Odkaz na zdroj <span className="req">povinný</span></label>
          {sources.map((value, i) => (
            <input
              key={i} id={`r-src-${i}`} type="url" inputMode="url" placeholder="https://…" required={i === 0}
              value={value}
              onChange={(e) => setSources(sources.map((s, j) => (j === i ? e.target.value : s)))}
            />
          ))}
          {sources.length < 5 && (
            <button type="button" className="btn-sm" onClick={() => setSources([...sources, ""])}>+ ďalší zdroj</button>
          )}

          <label htmlFor="r-comment">
            Čo nesedí {needsComment ? <span className="req">povinné</span> : <span className="opt">nepovinné</span>}
          </label>
          <textarea
            id="r-comment" rows={6} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={needsComment ? "Aká kauza chýba alebo čo treba opraviť (aspoň pár slov)." : "Napríklad: suma je iná, osoba bola oslobodená…"}
          />

          <label htmlFor="r-email">E-mail <span className="opt">nepovinný, ak chcete odpoveď</span></label>
          <input id="r-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <Turnstile siteKey={siteKey} onToken={setToken} />

          {state.error && <p className="report-error" role="alert">{state.error}</p>}
          <button type="submit" className="btn-line btn-gold" disabled={!ready}>
            {state.busy ? "Odosiela sa…" : "Odoslať podnet"}
          </button>
        </fieldset>
      </form>
      <p id="report-rules" className="fine" style={{ maxWidth: "60ch" }}>
        Podnet číta moderátor. Ak ho prijme, zmena sa zapíše do histórie záznamu aj s dôvodom.
      </p>
    </main>
  );
}

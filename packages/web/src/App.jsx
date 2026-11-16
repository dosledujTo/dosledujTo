import { Component, useEffect, useState } from "react";
import { Route, Routes, useLocation, matchPath } from "react-router";

import { routes } from "./routes.jsx";
import { Header, Footer } from "./components/chrome.jsx";
import { ThemeProvider } from "./theme.jsx";
import { ApiError } from "./api.js";
import NotFound from "./pages/NotFound.jsx";

/**
 * Nájde rout pre danú cestu. Používa to server pred vykreslením aj klient pri
 * navigácii — jedna tabuľka, jedna odpoveď.
 *
 * @param {string} pathname
 */
export function matchRoute(pathname) {
  for (const route of routes) {
    const match = matchPath({ path: route.path, end: true }, pathname);
    if (match) return { route, params: match.params };
  }
  return { route: routes.at(-1), params: {} };
}

/**
 * Dáta pre aktuálnu cestu. Prvé zobrazenie ich dostane zo servera; pri
 * client-side navigácii sa dotiahnu tým istým `load`.
 *
 * Kľúčové je, že `<Routes location={state.key}>` dostáva **cestu, ku ktorej dáta patria**, nie
 * aktuálnu. Router sa prepne okamžite, dáta prídu o krok neskôr — bez tohto by
 * sa nová stránka na okamih vykreslila so starými dátami a spadla na tvare,
 * ktorý nečaká. Stará stránka teda zostane na obrazovke (stlmená), kým nové
 * dáta nedorazia.
 */
function Page({ initialData, initialPath }) {
  const location = useLocation();
  const key = location.pathname + location.search;

  const [state, setState] = useState(() => ({
    key: initialPath,
    data: initialData,
    error: null,
    loading: false,
  }));

  useEffect(() => {
    if (state.key === key) return;

    const controller = new AbortController();
    const { route, params } = matchRoute(location.pathname);
    const query = Object.fromEntries(new URLSearchParams(location.search));

    setState((previous) => ({ ...previous, loading: true }));

    route
      .load({ params, query, signal: controller.signal })
      .then((data) => setState({ key, data, error: null, loading: false }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ key, data: null, error, loading: false });
      });

    return () => controller.abort();
  }, [key, location.pathname, location.search, state.key]);

  if (state.error) {
    return state.error instanceof ApiError && state.error.isNotFound
      ? <NotFound />
      : <main id="obsah" className="wrap"><p className="empty">Načítanie zlyhalo. Skúste to znova.</p></main>;
  }

  if (!state.data) {
    return <main id="obsah" className="wrap"><p className="empty">Načítava sa…</p></main>;
  }

  return (
    <div className="page" data-loading={state.loading ? "" : undefined}>
      {/* `location={state.key}` — vykresli tú stránku, ku ktorej patria dáta. */}
      <Routes location={state.key}>
        {routes.map(({ path, Component }) => (
          <Route key={path} path={path} element={<Component data={state.data} />} />
        ))}
      </Routes>
    </div>
  );
}

/**
 * Chyba pri vykresľovaní nesmie skončiť bielou stránkou. Register čítajú ľudia,
 * ktorí naň prišli z odkazu — prázdne okno je pre nich to isté ako výpadok.
 */
class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // V prehliadači to skončí v konzole; server-side render sem nedôjde, tam
    // chybu zachytáva Express.
    console.error("chyba pri vykresľovaní stránky", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="obsah" className="wrap">
        <section style={{ padding: "80px 0 120px", maxWidth: "52ch" }}>
          <div className="kicker">Chyba</div>
          <h1 className="h1" style={{ fontSize: 44, margin: "16px 0 20px" }}>
            Stránku sa nepodarilo zobraziť
          </h1>
          <p className="dek prose">
            Niečo sa pokazilo na našej strane. Skúste stránku načítať znova; ak to bude
            pretrvávať, dajte nám vedieť.
          </p>
          <p><a href="/">Späť na titulku</a></p>
        </section>
      </main>
    );
  }
}

export default function App({ initialData, initialPath }) {
  return (
    <ThemeProvider>
      <a className="skip" href="#obsah">Preskočiť na obsah</a>
      <Header />
      <ErrorBoundary>
        <Page initialData={initialData} initialPath={initialPath} />
      </ErrorBoundary>
      <Footer />
    </ThemeProvider>
  );
}

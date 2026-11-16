// Tabuľka routov so `load` funkciou pri každom.
//
// Server nájde zhodu, zavolá `load`, vykreslí a dáta priloží do stránky; klient
// ich pri prvom zobrazení použije rovno a `load` volá až pri navigácii. Tá istá
// funkcia na oboch stranách — takže server a klient nemôžu skončiť s odlišnými
// dátami.

import Home, { load as loadHome, meta as metaHome } from "./pages/Home.jsx";
import Cases, { load as loadCases, meta as metaCases } from "./pages/Cases.jsx";
import Case, { loadCaseTab, metaCaseTab } from "./pages/Case.jsx";
import Persons, { load as loadPersons, meta as metaPersons } from "./pages/Persons.jsx";
import Orgs, { load as loadOrgs, meta as metaOrgs } from "./pages/Orgs.jsx";
import Profile, { loadProfile, metaProfile } from "./pages/Profile.jsx";
import Search, { load as loadSearch, meta as metaSearch } from "./pages/Search.jsx";
import HowWeCount, { load as loadHow, meta as metaHow } from "./pages/HowWeCount.jsx";
import Calendar, { load as loadCalendar, meta as metaCalendar } from "./pages/Calendar.jsx";
import Report, { load as loadReport, meta as metaReport } from "./pages/Report.jsx";
import NotFound, { load as loadNotFound, meta as metaNotFound } from "./pages/NotFound.jsx";

/**
 * Profil osoby alebo subjektu: štyri záložky, každá s vlastnou adresou a
 * vlastným `load` (handoff „Červená niť" kap. 3).
 *
 * @param {"person"|"org"} kind
 * @param {string} path
 */
function profileRoutes(kind, path) {
  return [
    ["mapa", ""], ["v-case", "/v-case"], ["siet", "/siet"], ["zdroje", "/zdroje"],
  ].map(([tab, suffix]) => ({
    path: `${path}/:slug${suffix}`,
    Component: Profile,
    load: loadProfile(kind, tab),
    meta: metaProfile(kind, tab),
  }));
}

export const routes = [
  { path: "/", Component: Home, load: loadHome, meta: metaHome },
  { path: "/kauzy", Component: Cases, load: loadCases, meta: metaCases },
  // Kauza: Prehľad, Prepojenia, Zdroje — každá záložka s vlastnou adresou.
  ...[["prehlad", ""], ["prepojenia", "/prepojenia"], ["zdroje", "/zdroje"]].map(([tab, suffix]) => ({
    path: `/kauza/:slug${suffix}`, Component: Case, load: loadCaseTab(tab), meta: metaCaseTab(tab),
  })),
  { path: "/osoby", Component: Persons, load: loadPersons, meta: metaPersons },
  ...profileRoutes("person", "/osoba"),
  { path: "/subjekty", Component: Orgs, load: loadOrgs, meta: metaOrgs },
  ...profileRoutes("org", "/subjekt"),
  { path: "/hladat", Component: Search, load: loadSearch, meta: metaSearch },
  { path: "/ako-pocitame", Component: HowWeCount, load: loadHow, meta: metaHow },
  { path: "/kalendar", Component: Calendar, load: loadCalendar, meta: metaCalendar },
  { path: "/podnet", Component: Report, load: loadReport, meta: metaReport },
  { path: "*", Component: NotFound, load: loadNotFound, meta: metaNotFound },
];

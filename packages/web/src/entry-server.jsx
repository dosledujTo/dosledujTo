// SSR: rovnaký strom komponentov ako v prehliadači, len s `StaticRouter`.

import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App.jsx";
import { matchRoute } from "./App.jsx";

export { matchRoute };
// Re-export cez zostavený balík: `ssr.js` je obyčajný Node modul a `.jsx`
// naimportovať nevie.
export { NO_FLASH_SCRIPT } from "./theme.jsx";

/**
 * @param {string} url        cesta vrátane query
 * @param {unknown} data      výsledok `load`
 * @param {string} [dataPath] cesta, ku ktorej dáta patria — pri 404 je to
 *   stránka „nenájdené", nie adresa v prehliadači
 * @returns {string} HTML tela stránky
 */
export function render(url, data, dataPath = url) {
  return renderToString(
    <StaticRouter location={url}>
      <App initialData={data} initialPath={dataPath} />
    </StaticRouter>,
  );
}

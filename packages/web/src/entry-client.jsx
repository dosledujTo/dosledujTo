// Hydratácia. Dáta prišli so stránkou, takže prvé zobrazenie nič nedoťahuje.

import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import { seedApiCache } from "./api.js";
import "./styles.css";

const initialData = window.__DATA__ ?? null;
const initialPath = window.__PATH__ ?? window.location.pathname + window.location.search;
delete window.__DATA__;
// Odpovede, z ktorých server stránku zložil — prvá navigácia ich nesťahuje znova.
seedApiCache(window.__API__);
delete window.__API__;

hydrateRoot(
  document.getElementById("root"),
  <StrictMode>
    <BrowserRouter>
      <App initialData={initialData} initialPath={initialPath} />
    </BrowserRouter>
  </StrictMode>,
);

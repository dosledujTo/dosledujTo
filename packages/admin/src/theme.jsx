// Svetlý a tmavý režim administrácie.
//
// Bootstrap 5.3 (a s ním AdminLTE 4) prepína tému atribútom `data-bs-theme` na
// `<html>` — nič sa nepreklikáva cez triedy komponentov. Tri veci, ktoré to
// robia použiteľným a ktoré sa dajú ľahko pokaziť:
//
//   - **voľba sa aplikuje pred prvým vykreslením**, inline skriptom v
//     `index.html`; keby ju nastavoval až React, na tmavom režime by pri každom
//     načítaní bliklo biele pozadie;
//   - **kým si moderátor nevybral, riadi sa systémom** — aj keď ho prepne za
//     behu (macOS to robí podľa času). Vlastná voľba systém prebije;
//   - **prepnutie prežije reload** cez `localStorage`. V okne bez úložiska
//     (súkromné okno, zamknuté cookies) prepnutie stále funguje, len na jednu
//     reláciu — preto je zápis v `try`.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Ten istý kľúč používa aj no-flash skript v `index.html`. */
export const STORAGE_KEY = "dosleduj-admin-theme";

const ThemeContext = createContext({ dark: false, toggle: () => {}, followsSystem: true });

const isDark = () => document.documentElement.getAttribute("data-bs-theme") === "dark";

function apply(dark) {
  document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");
}

function stored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }) {
  // Počiatočný stav berieme z toho, čo už nastavil no-flash skript — nie
  // z vlastného výpočtu, aby sa tie dve miesta nemohli rozísť.
  const [dark, setDark] = useState(() => (typeof document === "undefined" ? false : isDark()));
  const [followsSystem, setFollowsSystem] = useState(() => stored() === null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => {
      if (stored() !== null) return; // vlastná voľba prebíja systém
      apply(event.matches);
      setDark(event.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setDark((previous) => {
      const next = !previous;
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // Okno bez úložiska — prepnutie platí aspoň pre túto reláciu.
      }
      setFollowsSystem(false);
      return next;
    });
  }, []);

  /** Návrat k systému: voľba sa zabudne, nie prepne na svetlý. */
  const followSystem = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Bez úložiska nie je čo zabudnúť.
    }
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches;
    apply(system);
    setDark(system);
    setFollowsSystem(true);
  }, []);

  return (
    <ThemeContext.Provider value={{ dark, toggle, followSystem, followsSystem }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Prepínač do horného pruhu. Ikona hovorí, čo prepnutie urobí, nie v akom
 * režime práve sme — a text pre čítačky obrazovky to hovorí slovom.
 */
export function ThemeToggle({ className = "btn btn-sm btn-outline-secondary" }) {
  const { dark, toggle, followSystem, followsSystem } = useTheme();
  const label = dark ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim";

  return (
    <span className="d-inline-flex align-items-center gap-1">
      <button
        className={className}
        type="button"
        onClick={toggle}
        aria-pressed={dark}
        title={followsSystem ? `${label} (teraz podľa systému)` : label}
      >
        <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
        <span className="visually-hidden">{label}</span>
      </button>
      {!followsSystem && (
        <button
          className="btn btn-sm btn-link p-0 text-body-secondary"
          type="button"
          onClick={followSystem}
          title="Riadiť sa nastavením systému"
        >
          <span className="visually-hidden">Riadiť sa nastavením systému</span>
          <span aria-hidden="true">⟳</span>
        </button>
      )}
    </span>
  );
}

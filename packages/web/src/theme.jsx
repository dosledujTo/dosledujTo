// Svetlý a tmavý režim — jediný kus klientského stavu na celom webe.
//
// Voľba sa drží v `localStorage` a **číta sa inline skriptom v <head> ešte
// pred prvým vykreslením**, inak by na tmavom režime bliklo biele pozadie.
// Keď nie je nič uložené, riadi sa `prefers-color-scheme`.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "dosleduj-theme";
const ThemeContext = createContext({ dark: false, toggle: () => {} });

/**
 * Skript, ktorý beží pred prvým paintom. Nesmie závisieť od ničoho ostatného,
 * preto je to obyčajný reťazec vložený do <head>.
 */
export const NO_FLASH_SCRIPT = `(function(){try{
var s=localStorage.getItem('${STORAGE_KEY}');
var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-theme',d?'dark':'light');
}catch(e){}})();`;

export function ThemeProvider({ children }) {
  // Server nevie, čo má návštevník uložené — vykreslí svetlý a klient si to
  // po hydratácii zrovná s tým, čo už nastavil no-flash skript.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  const toggle = useCallback(() => {
    setDark((previous) => {
      const next = !previous;
      document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // Súkromné okno bez úložiska — prepnutie platí aspoň pre túto reláciu.
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

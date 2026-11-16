// Formulár filtrov s method="get", ktorý s JavaScriptom nenačíta stránku znova.
//
// Bez JS (a pred hydratáciou) je to obyčajný GET formulár — filtre sú v URL a
// server stránku vykreslí. S JS sa odoslanie zmení na navigáciu v routeri:
// `load` novej adresy beží v prehliadači a vďaka medzipamäti v api.js stiahne
// len to, čo sa naozaj zmenilo. Prázdne polia sa do adresy nepíšu.

import { useLocation, useNavigate } from "react-router";

/**
 * @param {{ action: string } & import("react").FormHTMLAttributes<HTMLFormElement>} props
 */
export function GetForm({ action, children, ...rest }) {
  const navigate = useNavigate();
  // Nová adresa (aj z odkazu, nie z formulára) = polia s jej hodnotami.
  const { search } = useLocation();

  /** @param {import("react").FormEvent<HTMLFormElement>} event */
  function onSubmit(event) {
    event.preventDefault();
    const submitter = /** @type {any} */ (event.nativeEvent).submitter ?? null;
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget, submitter)) {
      if (typeof value === "string" && value !== "") query.append(key, value);
    }
    const qs = query.toString();
    navigate(qs ? `${action}?${qs}` : action);
  }

  return (
    <form key={search} method="get" action={action} onSubmit={onSubmit} {...rest}>
      {children}
    </form>
  );
}

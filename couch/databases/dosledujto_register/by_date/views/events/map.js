// Udalosti naprieč všetkými kauzami, zoradené v čase.
//
// Toto je view, na ktorom stojí titulka: **najbližšie pojednávania**. Časová os
// dopredu je dôvod, prečo si niekto register otvorí druhýkrát — bez nej je to
// archív. Cez `by_case/children` sa to spočítať nedá, ten je viazaný na jednu
// kauzu.
//
//   ?startkey="2026-08-09"&endkey="9999"&limit=10        najbližšie
//   ?endkey="2026-08-09"&descending=true&limit=10        posledný pohyb
//
// Kľúč je dátum ako reťazec (ISO), takže rozsah funguje bez konverzie a
// `descending` sa správa očakávane.

export default function (doc) {
  if (doc.type !== "event" || !doc.occurred_on || !doc.case_id) return;

  emit(String(doc.occurred_on).slice(0, 10), {
    case_id: doc.case_id,
    kind: doc.kind || "past",
    category: doc.category || "other",
    title: doc.title || null,
    sources: doc.sources || [],
  });
}

// @vitest-environment jsdom
//
// Číselník vo formulári. Dve pravidlá, ktoré sa dajú ľahko porušiť a ktoré by
// pri porušení ticho prepísali cudzí údaj:
//   - hodnota, ktorá už v dokumente je, zostane vybratá, aj keď ju medzitým
//     niekto deaktivoval alebo v číselníku nikdy nebola;
//   - prázdny číselník neblokuje prácu.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CodelistSelect } from "../packages/admin/src/codelist.jsx";

const COURTS = {
  groups: [
    {
      kind: "court",
      label: "Súdy",
      hint: "",
      field: "proceeding.court",
      bound_to_enum: null,
      missing: [],
      items: [
        { id: "codelist:1", code: "os-testovice", name: "Okresný súd Testovice", active: true, usage: 1 },
        { id: "codelist:2", code: "ks-zruseny", name: "Krajský súd Zrušený", active: false, usage: 0 },
      ],
    },
  ],
  unlisted_courts: [],
};

global.fetch = vi.fn(async () =>
  new Response(JSON.stringify(COURTS), { status: 200, headers: { "Content-Type": "application/json" } }));

function wrap(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("CodelistSelect", () => {
  it("ponúka aktívne položky číselníka", async () => {
    wrap(<CodelistSelect kind="court" by="name" value="" onChange={() => {}} />);

    await waitFor(() => expect(screen.getByText("Okresný súd Testovice")).toBeTruthy());
    // Neaktívna položka sa neponúka, kým ju dokument nenesie.
    expect(screen.queryByText(/Krajský súd Zrušený/)).toBeNull();
  });

  it("zapísaná hodnota mimo číselníka zostane vybratá a je označená", async () => {
    wrap(<CodelistSelect kind="court" by="name" value="Okresný súd Neznámy" onChange={() => {}} />);

    await waitFor(() => expect(screen.getByText(/mimo číselníka/)).toBeTruthy());
    expect(screen.getByRole("combobox").value).toBe("Okresný súd Neznámy");
  });

  it("deaktivovaná hodnota, ktorú dokument nesie, sa nestratí", async () => {
    wrap(<CodelistSelect kind="court" by="name" value="Krajský súd Zrušený" onChange={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Krajský súd Zrušený \(neaktívne\)/)).toBeTruthy());
    expect(screen.getByRole("combobox").value).toBe("Krajský súd Zrušený");
  });
});

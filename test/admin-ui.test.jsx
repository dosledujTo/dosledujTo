// @vitest-environment jsdom
//
// Editor zdrojovanej hodnoty je nosný komponent administrácie. Ak prestane
// kričať pri poli bez zdroja, produkt stratí to jediné pravidlo, na ktorom
// stojí — preto má vlastné testy.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SourcedField, emptySourced, unsourcedFields } from "../packages/admin/src/sourced.jsx";
import { RoleBadge, SourceState, money } from "../packages/admin/src/ui.jsx";

// Komponent si dopytuje metadáta článkov; v teste nechceme sieť.
global.fetch = vi.fn(async () => new Response("{}", { status: 200 }));

function wrap(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// Bez `globals: true` sa Testing Library neupratuje sama a DOM by sa medzi
// testami hromadil.
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("SourcedField", () => {
  it("pole bez zdroja je vizuálne rozbité, nie ticho neplatné", () => {
    const { container } = wrap(
      <SourcedField label="Suma" type="money" field={emptySourced(null)} onChange={() => {}} />,
    );

    expect(screen.getByText(/bez zdroja — nezverejní sa/)).toBeTruthy();
    expect(screen.getByText(/Kauzu s ním nepôjde publikovať/)).toBeTruthy();
    // Nie len farbou: stav je aj slovom (prístupnosť, zadanie §10).
    expect(container.querySelector(".border-danger")).toBeTruthy();
  });

  it("so zdrojom sa varovanie stratí", () => {
    wrap(
      <SourcedField
        label="Suma" type="money"
        field={{ ...emptySourced(1000), sources: ["article:0192a1b0-7c02-7000-8000-000000000001"] }}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText(/bez zdroja/)).toBeNull();
    expect(screen.getByText(/1 zdroj/)).toBeTruthy();
  });

  it("prepínač odvodenia vyžiada popis postupu", async () => {
    const user = userEvent.setup();
    let field = { ...emptySourced("x"), sources: ["article:a"] };
    const onChange = vi.fn((next) => { field = next; });

    const { rerender } = wrap(
      <SourcedField label="Popis" field={field} onChange={onChange} />,
    );

    await user.click(screen.getByLabelText(/odvodili sami/));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].derived).toBe(true);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <SourcedField label="Popis" field={{ ...field, derived: true, derivation: "" }} onChange={onChange} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/naše tvrdenie, nie citácia/)).toBeTruthy();
    expect(screen.getByText(/odvodené nami/)).toBeTruthy();
  });

  it("rozpor pridá alternatívnu hodnotu ako rovnocennú, nie ako poznámku", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    wrap(
      <SourcedField
        label="Suma" type="money"
        field={{ ...emptySourced(1000), sources: ["article:a"] }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText("Zdroje sa rozchádzajú"));
    expect(onChange.mock.calls[0][0].disputed).toHaveLength(1);
  });

  it("v režime čítania sa needitovateľné akcie nezobrazujú", () => {
    wrap(
      <SourcedField
        label="Popis" readOnly
        field={{ ...emptySourced("text"), sources: ["article:a"] }}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText("Zdroje sa rozchádzajú")).toBeNull();
    expect(screen.queryByText("+ zdroj")).toBeNull();
  });
});

describe("kontrola pred publikovaním", () => {
  it("vymenuje polia bez zdroja", () => {
    const doc = {
      _id: "case:1",
      title: "Kauza",
      summary: { value: "x", sources: [] },
      status: { value: "open", sources: ["article:a"] },
      amount: { value: 1, sources: [] },
      tags: ["a"],
    };

    expect(unsourcedFields(doc).sort()).toEqual(["amount", "summary"]);
  });

  it("technické polia nepovažuje za zdrojovateľné", () => {
    expect(unsourcedFields({ tags: [], title: "x", person_ids: [] })).toEqual([]);
  });
});

describe("vizuálny slovník", () => {
  it("oslobodenie má vlastné slovo, nie spoločný červený štítok", () => {
    const { container: acquitted } = render(<RoleBadge role="acquitted" />);
    const { container: indicted } = render(<RoleBadge role="indicted" />);

    expect(acquitted.textContent).toContain("oslobodený");
    expect(indicted.textContent).toContain("obžalovaný");
    expect(acquitted.querySelector(".text-bg-success")).toBeTruthy();
    expect(indicted.querySelector(".text-bg-danger")).toBeTruthy();
  });

  it("ukončená rola je označená slovom, nie len priehľadnosťou", () => {
    const { container } = render(<RoleBadge role="suspect" current={false} />);
    expect(container.textContent).toContain("ukončená");
  });

  it("stav zdrojovania rozlišuje tri stavy", () => {
    expect(render(<SourceState sources={[]} />).container.textContent).toContain("bez zdroja");
    expect(render(<SourceState sources={["a"]} />).container.textContent).toContain("1 zdroj");
    expect(render(<SourceState sources={["a"]} derived />).container.textContent).toContain("odvodené nami");
  });

  it("suma sa formátuje z centov na eurá", () => {
    expect(money(1250000000).replace(/ /g, " ")).toMatch(/12 500 000/);
    expect(money(null)).toBe("—");
  });
});

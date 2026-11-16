// @vitest-environment jsdom
//
// Vyhľadávacie polia vo formulároch.
//
// Predtým sa osoba vyberala z rozbaľovacieho zoznamu prvých sto osôb a zdroje
// sa vpisovali ako `article:0192…` oddelené čiarkou. Testy tu držia, že sa to
// nevráti: moderátor píše meno, nie identifikátor.

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EntityPicker, SourcesField } from "../packages/admin/src/pickers.jsx";

const PERSONS = [
  { id: "person:0192a1b0-7c02-7000-8000-000000000001", title: "Ján Testovací", publish_state: "published" },
  { id: "person:0192a1b0-7c02-7000-8000-000000000002", title: "Eva Skúšobná", publish_state: "draft" },
];

const CREATED_PERSON = {
  id: "person:0192a1b0-7c02-7000-8000-0000000000cc",
  full_name: "Nová Testovacia",
  slug: "nova-testovacia",
  publish_state: "draft",
};

const ARTICLE = {
  id: "article:0192a1b0-7c02-7000-8000-0000000000aa",
  title: "Uznesenie okresného súdu",
  publisher: "Okresný súd Testovice",
  published_at: "2026-01-01T00:00:00Z",
  kind: "official",
  url: "https://sud.example/a",
};

// Jediné, čo sa mockuje, je sieť — komponenty sa testujú tak, ako bežia.
global.fetch = vi.fn(async (input, init) => {
  // Klient volá `fetch` s objektom `URL`, nie s reťazcom — `input.url` by tu
  // bolo undefined a mock by ticho vracal prázdno. Metóda je v druhom
  // argumente, nie na URL.
  const url = String(input?.href ?? input?.url ?? input);
  const method = String(init?.method ?? "GET").toUpperCase();
  const body = url.includes("/admin/persons") && method === "POST"
    ? { person: CREATED_PERSON }
    : url.includes("/admin/persons")
    ? { items: PERSONS, total: PERSONS.length }
    : url.includes(`/admin/articles/${ARTICLE.id}`)
      ? { article: ARTICLE }
      : url.includes("/admin/articles")
        ? { items: [ARTICLE], total: 1 }
        : {};
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

function wrap(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("EntityPicker", () => {
  it("našepkáva podľa mena a vráti id, nie text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<EntityPicker kind="person" value="" onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "Ján");

    const option = await screen.findByRole("option", { name: /Ján Testovací/ });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith(PERSONS[0].id, expect.objectContaining({ title: "Ján Testovací" }));
  });

  it("po výbere ukáže meno, nie identifikátor", async () => {
    const user = userEvent.setup();
    // Komponent je riadený: bez rodiča, ktorý si výber pamätá, sa čip neukáže.
    // Presne tak ho používajú formuláre.
    function Harness() {
      const [id, setId] = useState("");
      return <EntityPicker kind="person" value={id} onChange={setId} />;
    }
    wrap(<Harness />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Eva Skúšobná/ }));

    expect(screen.getByText("Eva Skúšobná")).toBeTruthy();
    expect(screen.queryByText(/person:0192/)).toBeNull();
  });

  it("Enter vyberie zvýraznenú položku a neodošle formulár", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onChange = vi.fn();

    wrap(
      <form onSubmit={onSubmit}>
        <EntityPicker kind="person" value="" onChange={onChange} />
      </form>,
    );

    await user.click(screen.getByRole("combobox"));
    await screen.findByRole("option", { name: /Ján Testovací/ });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(PERSONS[1].id, expect.anything());
    // Bez ošetrenia by Enter odoslal formulár s prázdnym výberom.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("výber sa dá zrušiť", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<EntityPicker kind="person" value={PERSONS[0].id} valueLabel="Ján Testovací" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Zrušiť výber/ }));
    expect(onChange).toHaveBeenCalledWith("", null);
  });
});

describe("SourcesField", () => {
  it("prázdny zoznam kričí hneď, nie až po odoslaní", () => {
    const { container } = wrap(<SourcesField value={[]} onChange={() => {}} />);

    expect(screen.getByText(/Bez zdroja sa záznam nezapíše/)).toBeTruthy();
    expect(container.querySelector(".border-danger")).toBeTruthy();
  });

  it("zdroj sa pridá vyhľadaním, nie vpísaním identifikátora", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<SourcesField value={[]} onChange={onChange} />);

    // Žiadne textové pole na id — jediná cesta je vyhľadávacie okno.
    expect(screen.queryByPlaceholderText(/article:/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "+ zdroj" }));
    await user.click(await screen.findByText("Uznesenie okresného súdu"));

    expect(onChange).toHaveBeenCalledWith([ARTICLE.id]);
  });

  it("pripojený zdroj sa dá odobrať", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(<SourcesField value={[ARTICLE.id]} onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Odobrať zdroj" })).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Odobrať zdroj" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("EntityPicker — založenie záznamu z našepkávača", () => {
  it("ponúkne založiť to, čo sa nenašlo, a po založení ho rovno vyberie", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    wrap(<EntityPicker kind="person" value="" onChange={onChange} allowCreate />);

    const input = screen.getByRole("combobox");
    await user.type(input, "Nová Testovacia");

    // Ponuka mien, ktoré mock vracia, aj cesta von z nej: založiť.
    const create = await screen.findByText(/založiť novú osobu/);
    await user.click(create);

    // Dialóg predvyplní meno, ktoré moderátor už napísal — nepíše sa dvakrát.
    const name = screen.getByLabelText("Celé meno");
    expect(name.value).toBe("Nová Testovacia");

    await user.click(screen.getByRole("button", { name: "Založiť" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)[0]).toBe(CREATED_PERSON.id);
  });
});

// @vitest-environment jsdom
//
// Samostatná sekcia Konania. Moderátor má v ruke rozhodnutie so spisovou
// značkou a potrebuje zistiť, ku ktorej kauze patrí — takže zoznam musí ukázať
// názov kauzy a odkaz, ktorý vedie rovno na jej záložku Konania.

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Proceedings from "../packages/admin/src/pages/Proceedings.jsx";

global.fetch = vi.fn(async () => new Response(JSON.stringify({
  items: [{ id: "proceeding:1", court: "Okresný súd Testovice", file_number: "2T/45/2025",
            phase: "trial", sources: ["article:a"], case_id: "case:1", case: { name: "Kauza X" } }],
  total: 1, courts: ["Okresný súd Testovice"],
}), { status: 200, headers: { "Content-Type": "application/json" } }));

describe("stránka Konania", () => {
  it("vykreslí zoznam s názvom kauzy", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><Proceedings /></MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("2T/45/2025")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Kauza X" }).getAttribute("href")).toBe("/kauzy/case:1/konania");
    expect(screen.getByRole("heading", { name: "Súdne konania" })).toBeTruthy();
  });
});

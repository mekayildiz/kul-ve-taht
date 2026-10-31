import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPanel } from "./AdminPanel";
import { ApiClient } from "../api/client";
import { getDictionary } from "../i18n";

const t = getDictionary("tr");

function clientWith(handler: (path: string, init?: RequestInit) => Response): ApiClient {
  return new ApiClient({
    baseUrl: "https://api.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url.replace("https://api.test", ""), init);
    }) as typeof fetch,
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const overview = {
  accounts: 3,
  characters: 5,
  aliveCharacters: 4,
  settlements: 130,
  kingdoms: 5,
  totalGold: 1234,
  properties: 7,
  companies: 2,
  auctionsOpen: 1,
  gameDay: 42,
  gameYear: 3,
};

const characters = {
  characters: [
    { id: "ch-1", givenName: "Kael", surname: "Veyr", accountId: "a1", alive: true, gold: 20, reputation: 5, currentSettlement: "varkhenn-drahkmar" },
    { id: "ch-2", givenName: "Elif", surname: "Veyr", accountId: "a2", alive: false, gold: 0, reputation: 1, currentSettlement: null },
  ],
};

const economy = { economy: [{ settlementId: "varkhenn-drahkmar", itemId: "wheat", supply: 120, demand: 90, price: 2 }] };

describe("AdminPanel (belge 20)", () => {
  it("ozet ve karakter listesini gosterir", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" />);
    await waitFor(() => expect(screen.getByText(t.admin.adminTitle)).toBeTruthy());
    expect(screen.getByText("130")).toBeTruthy();
    expect(screen.getByText("Kael Veyr")).toBeTruthy();
    expect(screen.getByText("wheat")).toBeTruthy();
  });

  it("karakter durumunu degistirme aksiyonunu gonderir", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/status")) {
        sent.push(JSON.parse(String(init?.body)));
        return json({ ok: true });
      }
      if (path.startsWith("/api/admin/overview")) return json(overview);
      if (path.startsWith("/api/admin/characters")) return json(characters);
      if (path.startsWith("/api/admin/economy")) return json(economy);
      return json({}, 404);
    });
    render(<AdminPanel t={t} client={client} token="tok" />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: `${t.admin.markDead}: Kael Veyr` }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0] as { status: string }).status).toBe("dead");
  });

  it("yetkisiz oturumda uyari gosterir", async () => {
    const client = clientWith(() => json({ error: { code: "forbidden", message: "yok" } }, 403));
    render(<AdminPanel t={t} client={client} token="tok" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(t.admin.adminOnly)).toBeTruthy();
  });
});

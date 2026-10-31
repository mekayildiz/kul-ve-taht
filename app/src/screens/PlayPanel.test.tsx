import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayPanel } from "./PlayPanel";
import { ApiClient } from "../api/client";
import { getDictionary } from "../i18n";
import type { CharacterDto } from "../api/client";

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

const character: CharacterDto = {
  id: "ch-1",
  given_name: "Kael",
  surname: "Veyr",
  birth_settlement: "varkhenn-drahkmar",
  current_settlement: "varkhenn-drahkmar",
  age_years: 16,
  generation: 1,
};

function playState(overrides: Record<string, unknown> = {}) {
  return {
    characterId: "ch-1",
    health: { health: 100, hunger: 10, fatigue: 0, alive: true, injuries: [], diseases: [] },
    inventory: [{ itemId: "bread", quantity: 3, condition: 1 }],
    gold: 20,
    debts: 0,
    reputation: 0,
    weapon: "unarmed",
    weaponMastery: 0,
    strength: 8,
    ...overrides,
  };
}

const stateResponse = {
  state: playState(),
  items: [{ id: "bread", name: "Ekmek", category: "food", baseValue: 2, nutrition: 25 }],
  recipes: [{ id: "craft-bread", output: "bread", outputQuantity: 4, baseChance: 90 }],
  explorationSites: ["forest", "cave"],
};

describe("PlayPanel", () => {
  it("durum yüklenince sağlık, açlık ve altını gösterir", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getAllByText(/Ekmek/).length).toBeGreaterThan(0);
  });

  it("keşif aksiyonu gönderir ve durumu günceller", async () => {
    let called = false;
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.endsWith("/action")) {
        called = true;
        const body = JSON.parse(String(init?.body)) as { action: string };
        expect(body.action).toBe("explore");
        return json({ ok: true, state: playState({ gold: 35 }), detail: { site: "forest" } });
      }
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: /forest/ }));
    await waitFor(() => expect(called).toBe(true));
    await waitFor(() => expect(screen.getByText("35")).toBeTruthy());
  });

  it("altın yetmezse hata mesajı gösterir", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.endsWith("/action")) return json({ error: { code: "not_enough_gold", message: "yok" } }, 402);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: t.play.rest }));
    await waitFor(() => expect(screen.getByText(t.play.errorNoGold)).toBeTruthy());
  });

  it("ölü karakterde ölüm bildirir ve aksiyon düğmelerini kapatır", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state"))
        return json({ ...stateResponse, state: playState({ health: { health: 0, hunger: 90, fatigue: 50, alive: false, injuries: [], diseases: [] } }) });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.deadBanner)).toBeTruthy());
    expect(screen.getByRole("button", { name: t.play.rest }).hasAttribute("disabled")).toBe(true);
  });
});

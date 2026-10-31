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
  units: [],
  ships: [],
  properties: [],
  loan: null,
  prison: null,
  social: [],
  office: null,
  diplomacy: [{ from: "varkhenn", to: "player", stance: "neutral" }],
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
    let gold = 20;
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json({ ...stateResponse, state: playState({ gold }) });
      if (path.endsWith("/action")) {
        called = true;
        const body = JSON.parse(String(init?.body)) as { action: string };
        expect(body.action).toBe("explore");
        gold = 35;
        return json({ ok: true, state: playState({ gold }), detail: { site: "forest" } });
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

  it("katalog geldiğinde tarım, büyü ve yeraltı panellerini gösterir (E8)", async () => {
    const catalog = {
      crops: [{ id: "wheat", name: "Buğday", season: "spring" }],
      livestock: [{ id: "cattle", name: "Sığır" }],
      animals: [{ id: "deer", name: "Geyik" }],
      magicPaths: [{ id: "elemental", name: "Element Büyücülüğü", outlawedIn: [] }],
      spells: [{ id: "flame-bolt", name: "Alev Oku", path: "elemental", level: 1 }],
      guilds: [{ id: "smiths", name: "Demirciler Loncası", dues: 15 }],
      activities: [{ kind: "festival", name: "Festival", cost: 5 }],
      templeServices: [{ service: "healing", cost: 10 }],
      underworldActions: [{ action: "theft", name: "Hırsızlık" }],
    };
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path === "/api/catalog") return json(catalog);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Buğday")).toBeTruthy());
    expect(screen.getByText("Geyik")).toBeTruthy();
    expect(screen.getByText("Element Büyücülüğü")).toBeTruthy();
    expect(screen.getByText(/Demirciler Loncası/)).toBeTruthy();
    expect(screen.getByText("Hırsızlık")).toBeTruthy();
  });

  it("ekim aksiyonu sunucuya doğru gövdeyle gider (E8)", async () => {
    const catalog = {
      crops: [{ id: "wheat", name: "Buğday", season: "spring" }],
      livestock: [],
      animals: [],
      magicPaths: [],
      spells: [],
      guilds: [],
      activities: [],
      templeServices: [],
      underworldActions: [],
    };
    let sent: Record<string, unknown> | null = null;
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path === "/api/catalog") return json(catalog);
      if (path.endsWith("/action")) {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({ ok: true, state: playState(), detail: {} });
      }
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Buğday")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: t.play.plant }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.action).toBe("plant");
    expect(sent!.crop).toBe("wheat");
    expect(sent!.season).toBe("spring");
  });

  it("askeri, ekonomi, adalet ve siyaset panellerini gösterir (belge 20)", async () => {
    const withSystems = {
      ...stateResponse,
      units: [{ id: "u1", unitType: "infantry", strength: 20, morale: 100, supply: 100, experience: 0 }],
      ships: [{ id: "s1", shipClass: "galley", condition: 100 }],
      properties: [{ id: "p1", propertyType: "business", settlementId: "varkhenn-drahkmar", value: 800, taxRate: 0.02 }],
      office: { kingdomId: "varkhenn", title: "Vergi Memuru", rank: "soldier", servicePoints: 25 },
    };
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(withSystems);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.military)).toBeTruthy());
    expect(screen.getByText(/infantry/)).toBeTruthy();
    expect(screen.getByText(t.play.economy, { exact: false })).toBeTruthy();
    expect(screen.getByText(/business/)).toBeTruthy();
    expect(screen.getByText(t.play.justice)).toBeTruthy();
    expect(screen.getAllByText(t.play.combat).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vergi Memuru/)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.recruit })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.takeLoan })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.fight })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.seekOffice })).toBeTruthy();
  });

  it("savaş aksiyonu sunucuya doğru gövdeyle gider (belge 20)", async () => {
    let sent: Record<string, unknown> | null = null;
    const withUnits = {
      ...stateResponse,
      units: [{ id: "u1", unitType: "infantry", strength: 20, morale: 100, supply: 100, experience: 0 }],
    };
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(withUnits);
      if (path.endsWith("/action")) {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({ ok: true, state: playState(), detail: {} });
      }
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.battle)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: t.play.battle }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.action).toBe("battle");
    expect(sent!.terrain).toBe("open");
  });
});

import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayPanel } from "./PlayPanel";
import { ApiClient } from "../api/client";
import { getDictionary } from "../i18n";
import type { CharacterDto } from "../api/client";

const t = getDictionary();

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

/** Sekmeye gecer ve aktif oldugunu dogrular (kaydirma yerine bolumlu gezinme). */
async function goto(label: string): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true"));
}

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
  absence: null,
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
  family: null,
  group: null,
  appearance: { faceShape: null, skinTone: null, eyeColor: null, hairColor: null, hairStyle: null, beardStyle: null, heightCm: null, build: null, scars: null, tattoos: null, outfit: null },
  bank: [],
  escrows: [],
  peerLoans: [],
  companies: [],
  rentals: [],
  titleDisputes: [],
  trades: [],
  alliance: null,
  children: [],
  relations: [],
  motions: [],
  notifications: null,
  diplomacy: [{ from: "varkhenn", to: "player", stance: "neutral" }],
  directory: [
    { characterId: "ch-2", givenName: "Mira", surname: "Sol", currentSettlement: "aurelith-velmora", ageYears: 20, generation: 1 },
  ],
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
    await goto(t.play.tabs.hayat);
    expect(screen.getAllByText(/Ekmek/).length).toBeGreaterThan(0);
  });

  it("yokluk raporu geldiğinde kartı gösterir ve kapatılabilir", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state"))
        return json({
          ...stateResponse,
          absence: {
            daysPassed: 3,
            goldDelta: 0,
            healthDelta: 0,
            hungerDelta: 40,
            fatigueDelta: 0,
            injuriesHealed: 1,
            injuriesGained: 0,
            died: false,
          },
        });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.absence.title)).toBeTruthy());
    expect(screen.getByText(/3 oyun günü geçti/)).toBeTruthy();
    expect(screen.getByText(/Açlığın arttı/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "×" }));
    await waitFor(() => expect(screen.queryByText(t.play.absence.title)).toBeNull());
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
    await goto(t.play.tabs.hayat);
    await userEvent.click(screen.getByRole("button", { name: /forest/ }));
    await waitFor(() => expect(called).toBe(true));
    await goto(t.play.tabs.durum);
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
    await goto(t.play.tabs.hayat);
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
    await goto(t.play.tabs.hayat);
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
      appearance: { faceShapes: [], skinTones: [], eyeColors: [], hairColors: [], hairStyles: ["kisa"], beardStyles: [], builds: [], outfits: ["yolcu"], heightMinCm: 120, heightMaxCm: 230 },
    };
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path === "/api/catalog") return json(catalog);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.hayat);
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
      appearance: { faceShapes: [], skinTones: [], eyeColors: [], hairColors: [], hairStyles: [], beardStyles: [], builds: [], outfits: [], heightMinCm: 120, heightMaxCm: 230 },
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
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.hayat);
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
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.guc);
    await waitFor(() => expect(screen.getByText(t.play.military)).toBeTruthy());
    expect(screen.getByText(/infantry/)).toBeTruthy();
    expect(screen.getByText(t.play.justice)).toBeTruthy();
    expect(screen.getAllByText(t.play.combat).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vergi Memuru/)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.recruit })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.fight })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.seekOffice })).toBeTruthy();

    await goto(t.play.tabs.ekonomi);
    await waitFor(() => expect(screen.getAllByText(t.play.economy, { exact: false }).length).toBeGreaterThan(0));
    expect(screen.getByText(/business/)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.play.takeLoan })).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.guc);
    await waitFor(() => expect(screen.getByText(t.play.battle)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: t.play.battle }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.action).toBe("battle");
    expect(sent!.terrain).toBe("open");
  });

  it("aile panelini ve evlilik/kurallarini gosterir (belge 7)", async () => {
    const married = {
      ...stateResponse,
      family: { spouseId: "npc-1", spouseName: "Elara Veyr", marriedDay: 3, children: 1 },
    };
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(married);
      if (path.startsWith("/api/chat")) return json({ channel: "global", scopeId: null, count: 0, messages: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.dunya);
    await waitFor(() => expect(screen.getByText(/Elara Veyr/)).toBeTruthy());
    // evli karakter yeniden evlenemez
    expect(screen.getByRole("button", { name: t.play.marry }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: t.play.haveChild }).hasAttribute("disabled")).toBe(false);
  });

  it("sohbet mesajlarini listeler ve mesaj gonderir (belge 16)", async () => {
    let sent: Record<string, unknown> | null = null;
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/chat"))
        return json({
          channel: "global",
          scopeId: null,
          count: 1,
          messages: [
            { id: "m1", channelKind: "global", channelScope: null, senderId: "ch-9", recipientId: null, body: "Selam", sentAt: 1 },
          ],
        });
      if (path.endsWith("/action")) {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({ ok: true, state: playState(), detail: {} });
      }
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.dunya);
    await waitFor(() => expect(screen.getByText(/Selam/)).toBeTruthy());
    await userEvent.type(screen.getByLabelText(t.play.chat), "Merhaba");
    await userEvent.click(screen.getByRole("button", { name: t.play.sendMessage }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.action).toBe("sendMessage");
    expect(sent!.channel).toBe("global");
    expect(sent!.body).toBe("Merhaba");
  });
});

describe("PlayPanel görev ve açık artırma (belge 12.4, 9.3)", () => {
  const questsResponse = {
    catalog: [
      { id: "side-explore-1", title: "Kayip Yerler", description: "Harabe bul", type: "exploration", rewardGold: 50, solutions: [], objectives: [{ id: "ruins", description: "Harabeleri kesfet", required: 1 }] },
    ],
    log: [
      {
        questId: "side-explore-1",
        title: "Kayip Yerler",
        status: "active",
        stage: 0,
        objectives: [{ id: "ruins", description: "Harabeleri kesfet", progress: 0, required: 1 }],
      },
    ],
  };

  const auctionsResponse = {
    auctions: [{ id: "a-1", itemId: "iron-ore", quantity: 2, reservePrice: 10, currentBid: 12, currentBidderId: null, closesDay: 5 }],
  };

  it("görev günlüğünü ve ödül düğmesini gösterir", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/quests")) return json(questsResponse);
      if (path.startsWith("/api/auctions")) return json(auctionsResponse);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.dunya);
    await waitFor(() => expect(screen.getByText("Kayip Yerler")).toBeInTheDocument());
    expect(screen.getByText(/Ödülü Al/)).toBeInTheDocument();
    expect(screen.getByText(/En Yüksek Teklif: 12/)).toBeInTheDocument();
  });

  it("bildirim ozetini ve okundu isaretlemeyi gosterir (belge 19)", async () => {
    const sent: unknown[] = [];
    const digest = {
      visible: [{ id: "n1", kind: "trade_offer", priority: 2, summary: "Takas teklifi geldi", createdAtMs: 1, read: false }],
      backgroundSummary: "property_growth×2",
      unreadCount: 1,
    };
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/notifications/read")) {
        sent.push(JSON.parse(String(init?.body)));
        return json({ ok: true, marked: 1 });
      }
      if (path.startsWith("/api/notifications")) return json(digest);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.hayat);
    await waitFor(() => expect(screen.getByText("Takas teklifi geldi")).toBeTruthy());
    expect(screen.getByText("property_growth×2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: `${t.play.markRead}: Takas teklifi geldi` }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect((sent[0] as { ids: string[] }).ids).toEqual(["n1"]);
  });

  it("başarımları listeler ve özet panelini açar (belge 19)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());

    // Basarimlar durum sekmesinde gorunur.
    await waitFor(() => expect(screen.getByText(t.play.achievements)).toBeTruthy());
    expect(screen.getByText(t.play.achievementNames.ilkKazanc)).toBeTruthy();

    // Ozet paneli dugmeyle acilir ve kapanir.
    await userEvent.click(screen.getByRole("button", { name: t.play.summaryOpen }));
    expect(screen.getByRole("dialog", { name: t.play.summaryTitle })).toBeTruthy();
    expect(screen.getByText(t.play.summaryItems.kazan)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: t.play.summaryClose }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: t.play.summaryTitle })).toBeNull());
  });

  it("bildirimleri gruplara ayırır ve tümünü gösterir (belge 19)", async () => {
    const digest = {
      visible: [
        { id: "n1", kind: "direct_message", priority: 3, summary: "Mektup geldi", createdAtMs: 1, read: false },
        { id: "n2", kind: "trade_offer", priority: 2, summary: "Takas teklifi", createdAtMs: 2, read: false },
        { id: "n3", kind: "trade_completed", priority: 2, summary: "Takas tamam", createdAtMs: 3, read: true },
        { id: "n4", kind: "trade_offer", priority: 2, summary: "Takas teklifi 2", createdAtMs: 4, read: true },
        { id: "n5", kind: "trade_offer", priority: 2, summary: "Takas teklifi 3", createdAtMs: 5, read: true },
        { id: "n6", kind: "daily_progress", priority: 1, summary: "Gün geçti", createdAtMs: 6, read: true },
      ],
      backgroundSummary: null,
      unreadCount: 2,
    };
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      if (path.startsWith("/api/notifications")) return json(digest);
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.hayat);

    await waitFor(() => expect(screen.getByText(t.play.notificationGroups.messages)).toBeTruthy());
    expect(screen.getByText(t.play.notificationGroups.trades)).toBeTruthy();
    expect(screen.getByText(t.play.notificationGroups.personal)).toBeTruthy();

    // Ticaret grubunda 4 bildirim var; ilk 3'u gosterilir, gerisi dugmeyle acilir.
    expect(screen.queryByText("Takas teklifi 3")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: `${t.play.showAllNotifications} (4)` }));
    expect(screen.getByText("Takas teklifi 3")).toBeTruthy();
  });

  it("hedef secici diger oyunculari listeler ve takas teklifi gonderir (belge 16)", async () => {
    const sent: string[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.endsWith("/action")) {
        const body = JSON.parse(String(init?.body)) as { action: string; toId?: string };
        sent.push(body.action);
        if (body.action === "offerTrade") expect(body.toId).toBe("ch-2");
        return json({ ok: true, state: playState(), detail: {} });
      }
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.siyaset);
    const select = screen.getByLabelText(t.play.target) as HTMLSelectElement;
    await userEvent.selectOptions(select, "ch-2");
    await userEvent.click(screen.getByRole("button", { name: t.play.offerTrade }));
    await waitFor(() => expect(sent).toContain("offerTrade"));
  });

  it("dinamik avatar ve esya ikonlarini gosterir (belge 17)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      return json({}, 404);
    });
    const { container } = render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    // Sabit portre yerine secimlere gore cizilen canli avatar (SVG).
    const avatar = container.querySelector("svg.kvt-avatar-lg");
    expect(avatar).toBeTruthy();
    await goto(t.play.tabs.hayat);
    const icon = container.querySelector("img.kvt-itemicon") as HTMLImageElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute("src")).toBe("/assets/icons/heart.webp");
  });

  it("kiyafet secimi yerine standart pacavra giysi gosterir (belge 20)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path === "/api/catalog") return json({ crops: [], livestock: [], animals: [], magicPaths: [], spells: [], guilds: [], activities: [], templeServices: [], underworldActions: [], appearance: { faceShapes: ["oval"], skinTones: [], eyeColors: [], hairColors: [], hairStyles: [], beardStyles: [], builds: [], outfits: ["pacavra"], heightMinCm: 120, heightMaxCm: 230 } });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.dunya);
    expect(screen.getByText(t.play.outfitRags)).toBeTruthy();
    // Kiyafet secenekleri (soylu/asker vb.) artik sunulmaz.
    expect(screen.queryByRole("button", { name: new RegExp(t.play.outfit) })).toBeNull();
  });

  it("görevi başlatma aksiyonu gönderir", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/quests")) return json({ catalog: questsResponse.catalog, log: [] });
      if (path.startsWith("/api/auctions")) return json({ auctions: [] });
      if (path.startsWith("/api/catalog")) return json({}, 404);
      if (init?.body) sent.push(JSON.parse(String(init.body)));
      return json({ ok: true, state: playState() });
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.dunya);
    await waitFor(() => expect(screen.getByText(/Görevi Başlat/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/Görevi Başlat/));
    await waitFor(() => expect(sent.some((b) => (b as { action: string }).action === "startQuest")).toBe(true));
  });

  it("açık artırmaya teklif gönderir", async () => {
    const sent: unknown[] = [];
    const client = clientWith((path, init) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      if (path.startsWith("/api/auctions")) return json(auctionsResponse);
      if (path.startsWith("/api/catalog")) return json({}, 404);
      if (init?.body) sent.push(JSON.parse(String(init.body)));
      return json({ ok: true, state: playState() });
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    await goto(t.play.tabs.dunya);
    await waitFor(() => expect(screen.getByText("Teklif Ver")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Teklif Ver"));
    await waitFor(() => expect(sent.some((b) => (b as { action: string }).action === "bidAuction")).toBe(true));
  });

  it("durum sekmesinde sıradaki hedefi gösterir (belge 19)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state"))
        return json({
          ...stateResponse,
          state: playState({ health: { health: 90, hunger: 85, fatigue: 0, alive: true, injuries: [], diseases: [] } }),
        });
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.goalTitle)).toBeTruthy());
    expect(screen.getByText(t.play.goals.eat)).toBeTruthy();
  });

  it("hedef kartındaki Git düğmesi ilgili sekmeye geçirir", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state"))
        return json({
          ...stateResponse,
          state: playState({ health: { health: 90, hunger: 85, fatigue: 0, alive: true, injuries: [], diseases: [] } }),
        });
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.goalTitle)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: t.play.goalGo }));
    await waitFor(() => expect(screen.getByRole("button", { name: t.play.tabs.hayat }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("durum sekmesinde gelişim çubuklarını gösterir (belge 5.5)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state"))
        return json({ ...stateResponse, state: playState({ weaponMastery: 7, reputation: 25 }) });
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.progression)).toBeTruthy());
    expect(screen.getByText(t.play.progressionMastery)).toBeTruthy();
    expect(screen.getByText("2/5")).toBeTruthy();
  });

  it("ilk adımlar rehberini gösterir ve gizletilebilir (belge 19)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json({ ...stateResponse, state: playState() });
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText(t.play.guideTitle)).toBeTruthy());
    expect(screen.getByText(t.play.guideSteps.firstAction)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: t.play.guideHide }));
    await waitFor(() => expect(screen.queryByText(t.play.guideTitle)).toBeNull());
  });

  it("ses düğmesi tercihi değiştirir ve hatırlar (belge 19)", async () => {
    const client = clientWith((path) => {
      if (path.endsWith("/state")) return json(stateResponse);
      if (path.startsWith("/api/quests")) return json({ catalog: [], log: [] });
      return json({}, 404);
    });
    render(<PlayPanel t={t} client={client} token="tok" character={character} />);
    await waitFor(() => expect(screen.getByText("Kael Veyr")).toBeTruthy());
    const toggle = screen.getByRole("button", { name: new RegExp(t.play.sound) });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("false"));
    expect(localStorage.getItem("kvt.sound")).toBe("off");
  });
});

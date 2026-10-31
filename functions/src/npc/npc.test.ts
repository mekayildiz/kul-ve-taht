import { describe, expect, it } from "vitest";
import { decideGoal, recordMemory, sentimentToward, advanceNpcDay, simulationIntervalDays, shouldSimulate, emptyNeeds, type Npc } from "./model";
import { neutralPersonality } from "../character/personality";
import { emptyAttributes } from "../character/attributes";

function npc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc1", name: "Aldric", tier: "important", settlementId: "varkhenn-drahkmar",
    attributes: emptyAttributes(), personality: neutralPersonality(), goals: [],
    needs: emptyNeeds(), profession: "merchant", expertise: [{ path: "trade", level: 3 }],
    gold: 100, debts: 0, propertyValue: 0, militaryRank: 0, office: null,
    memory: [], alive: true, ageYears: 40, ...overrides,
  };
}

describe("NPC karar modeli (belge 8.1)", () => {
  it("yoksul NPC servet hedefler", () => {
    expect(decideGoal(npc({ gold: 5 }))).toBe("wealth");
  });

  it("borclu NPC servet hedefler", () => {
    expect(decideGoal(npc({ debts: 300 }))).toBe("wealth");
  });

  it("hirsli NPC guc hedefler", () => {
    expect(decideGoal(npc({ personality: { ...neutralPersonality(), ambition: 90 } }))).toBe("power");
  });

  it("korkak NPC guvenlik hedefler", () => {
    expect(decideGoal(npc({ personality: { ...neutralPersonality(), courage: 10 } }))).toBe("safety");
  });
});

describe("NPC hafizasi (belge 8.2)", () => {
  it("iyilik ve kotuluk hatirlanir, duygu ortalamasi hesaplanir", () => {
    let n = npc();
    n = recordMemory(n, { subjectId: "player1", sentiment: 60, kind: "favor", gameDay: 1, note: "borc verdi" });
    n = recordMemory(n, { subjectId: "player1", sentiment: 40, kind: "favor", gameDay: 2, note: "yardim" });
    expect(sentimentToward(n, "player1")).toBe(50);
  });

  it("hafiza 50 kayitla sinirlidir (performans)", () => {
    let n = npc();
    for (let i = 0; i < 80; i++) n = recordMemory(n, { subjectId: "p", sentiment: 1, kind: "event", gameDay: i, note: "x" });
    expect(n.memory.length).toBe(50);
  });

  it("taninmayan ozne icin notr duygu", () => {
    expect(sentimentToward(npc(), "bilinmeyen")).toBe(0);
  });
});

describe("katmanli simulasyon (belge 8.8)", () => {
  it("onemli NPC her gun, arka plan 30 gunde bir simule edilir", () => {
    expect(simulationIntervalDays("important")).toBe(1);
    expect(simulationIntervalDays("local")).toBe(7);
    expect(simulationIntervalDays("background")).toBe(30);
  });

  it("shouldSimulate katmana gore dogru karar verir", () => {
    expect(shouldSimulate(npc({ tier: "important" }), 5)).toBe(true);
    expect(shouldSimulate(npc({ tier: "local" }), 5)).toBe(false);
    expect(shouldSimulate(npc({ tier: "local" }), 7)).toBe(true);
    expect(shouldSimulate(npc({ tier: "background" }), 30)).toBe(true);
  });
});

describe("NPC gunluk yasam (belge 8.5)", () => {
  it("meslek geliri ihtiyaclari karsilar, borc faizi isler", () => {
    const n = advanceNpcDay(npc({ debts: 100 }), 1);
    expect(n.debts).toBeGreaterThan(100);
    expect(n.gold).toBeGreaterThan(0);
  });

  it("olü NPC ilerlemez", () => {
    const dead = npc({ alive: false });
    expect(advanceNpcDay(dead, 5)).toEqual(dead);
  });
});

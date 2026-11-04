import { describe, expect, it } from "vitest";
import { questComplete, advanceObjective, completeQuest, eventImpact, explore, EXPLORATION_SITES, type Quest, type CharacterQuest, type WorldEvent } from "./system";

const quest: Quest = {
  id: "q1", title: "Kayıp Kervan", description: "Kervanı bul", type: "side", giverNpcId: "npc1",
  objectives: [{ id: "o1", description: "Kervanı bul", required: 3 }],
  rewardGold: 100, solutions: ["savaş", "müzakere", "takip"], longTermEffect: "tüccar ittifakı",
};

describe("gorevler (belge 12.4)", () => {
  it("hedefler tamamlaninca gorev biter", () => {
    let cq: CharacterQuest = { characterId: "c1", questId: "q1", status: "active", progress: {} };
    expect(questComplete(cq, quest)).toBe(false);
    cq = advanceObjective(cq, "o1", 3);
    expect(questComplete(cq, quest)).toBe(true);
  });

  it("tamamlaninca odul ve uzun vadeli sonuc verilir", () => {
    const cq: CharacterQuest = { characterId: "c1", questId: "q1", status: "active", progress: { o1: 3 } };
    const result = completeQuest(cq, quest);
    expect(result.gold).toBe(100);
    expect(result.effect).toBe("tüccar ittifakı");
    expect(result.characterQuest.status).toBe("completed");
  });

  it("tamamlanmamis gorev odul vermez", () => {
    const cq: CharacterQuest = { characterId: "c1", questId: "q1", status: "active", progress: { o1: 1 } };
    expect(completeQuest(cq, quest).gold).toBe(0);
  });
});

describe("dunya olaylari (belge 12.5)", () => {
  it("kitlik fiyatlari artirir, guvenligi dusurur", () => {
    const event: WorldEvent = { id: "e1", type: "famine", settlementId: "x", occurredGameDay: 1, severity: 80, payload: {} };
    const impact = eventImpact(event);
    expect(impact.priceMultiplier).toBeGreaterThan(1);
    expect(impact.securityDelta).toBeLessThan(0);
  });

  it("baris/turnuva fiyatlari dusurur, guvenligi artirir", () => {
    const event: WorldEvent = { id: "e2", type: "peace", settlementId: null, occurredGameDay: 1, severity: 60, payload: {} };
    const impact = eventImpact(event);
    expect(impact.priceMultiplier).toBeLessThan(1);
    expect(impact.securityDelta).toBeGreaterThan(0);
  });

  it("salgın saglik riskini yukseltir", () => {
    const event: WorldEvent = { id: "e3", type: "epidemic", settlementId: "x", occurredGameDay: 1, severity: 90, payload: {} };
    expect(eventImpact(event).healthRisk).toBeGreaterThan(0.5);
  });
});

describe("kesif (belge 12.1)", () => {
  it("her kesif alani sonuc uretir", () => {
    for (const site of EXPLORATION_SITES) {
      const result = explore(site, 50, () => 0.5);
      expect(result.discovered).toBe(true);
      expect(result.site).toBe(site);
    }
  });

  it("hazirlik tehlikeli alanlarda yaralanma riskini azaltir", () => {
    const unprepared = explore("cave", 0, () => 0.5);
    const prepared = explore("cave", 100, () => 0.5);
    expect(unprepared.injury).not.toBeNull();
    expect(prepared.injury).toBeNull();
  });

  it("nadir kaynak alani degerli malzeme verir", () => {
    const result = explore("rare_resource", 50, () => 0.5);
    expect(result.items.length).toBeGreaterThan(0);
  });
});

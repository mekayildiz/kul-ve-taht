/**
 * "Siradaki hedef" onerisi testleri (belge 19).
 */

import { describe, expect, it } from "vitest";
import { nextGoal, type GoalInput } from "./nextGoal";
import type { PlayStateDto } from "../api/client";

function play(over: Partial<PlayStateDto> = {}): PlayStateDto {
  return {
    characterId: "c1",
    health: { health: 90, hunger: 10, fatigue: 5, alive: true, injuries: [], diseases: [] },
    inventory: [],
    gold: 100,
    debts: 0,
    reputation: 0,
    weapon: "unarmed",
    weaponMastery: 0,
    strength: 8,
    magicLevel: 0,
    energy: 100,
    magicPaths: [],
    underworldRep: 0,
    ...over,
  };
}

function input(over: Partial<GoalInput> = {}): GoalInput {
  return {
    play: play(),
    untreatedInjuries: 0,
    activeQuests: 0,
    claimableQuests: 0,
    foodCount: 3,
    ...over,
  };
}

describe("nextGoal", () => {
  it("olum her seyin onunde gelir", () => {
    const g = nextGoal(input({ play: play({ health: { health: 0, hunger: 100, fatigue: 0, alive: false, injuries: [], diseases: [] } }), untreatedInjuries: 2 }));
    expect(g.key).toBe("dead");
    expect(g.tone).toBe("crit");
  });

  it("tedavi edilmemis yara kritik hedeftir", () => {
    const g = nextGoal(input({ untreatedInjuries: 1 }));
    expect(g.key).toBe("treatInjuries");
    expect(g.tone).toBe("crit");
  });

  it("aclik yuksekse yemek onerir", () => {
    const g = nextGoal(input({ play: play({ health: { health: 80, hunger: 85, fatigue: 0, alive: true, injuries: [], diseases: [] } }) }));
    expect(g.key).toBe("eat");
    expect(g.tab).toBe("hayat");
  });

  it("alinmayan odul varsa onu one alir", () => {
    const g = nextGoal(input({ claimableQuests: 1, activeQuests: 1 }));
    expect(g.key).toBe("claimQuest");
    expect(g.tone).toBe("good");
  });

  it("yiyecek yoksa uyarir", () => {
    const g = nextGoal(input({ foodCount: 0 }));
    expect(g.key).toBe("getFood");
    expect(g.tone).toBe("warn");
  });

  it("borc altindan fazlaysa odemeyi onerir", () => {
    const g = nextGoal(input({ play: play({ gold: 10, debts: 50 }) }));
    expect(g.key).toBe("payDebts");
    expect(g.tab).toBe("ekonomi");
  });

  it("her sey yolundaysa kesfe yonlendirir", () => {
    const g = nextGoal(input());
    expect(g.key).toBe("explore");
  });
});

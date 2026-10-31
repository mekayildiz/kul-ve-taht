import { describe, expect, it } from "vitest";
import {
  armyPower, resolveBattle, resolveSiege, fleetPower, resolveNavalBattle,
  stanceFor, applyDiplomacy, SHIP_STATS, type Army, type Fleet, type Unit, type Relation,
} from "./army";

const unit = (over: Partial<Unit> = {}): Unit => ({ id: "u1", type: "infantry", strength: 1000, morale: 80, supply: 80, experience: 30, ...over });
const army = (over: Partial<Army> = {}): Army => ({ id: "a1", kingdomId: "varkhenn", commanderSkill: 50, units: [unit()], location: "x", ...over });
const fleet = (ships: { class: "galley" | "longship" | "caravel" | "flagship"; condition: number }[]): Fleet => ({ id: "f1", kingdomId: "varkhenn", ships });
const seq = (v: number[]) => { let i = 0; return () => v[i++ % v.length] ?? 0.5; };

describe("ordu ve kara savasi (belge 14.5)", () => {
  it("komutanlik ve moral ordu gucunu artirir", () => {
    expect(armyPower(army({ commanderSkill: 90 }))).toBeGreaterThan(armyPower(army({ commanderSkill: 10 })));
    expect(armyPower(army({ units: [unit({ morale: 100 })] }))).toBeGreaterThan(armyPower(army({ units: [unit({ morale: 20 })] })));
  });

  it("suvari piyadeden gucludur", () => {
    expect(armyPower(army({ units: [unit({ type: "cavalry" })] }))).toBeGreaterThan(armyPower(army({ units: [unit({ type: "infantry" })] })));
  });

  it("guclu ordu zayifi yener", () => {
    const strong = army({ commanderSkill: 90, units: [unit({ strength: 5000, morale: 100, experience: 90 })] });
    const weak = army({ units: [unit({ strength: 200, morale: 30 })] });
    expect(resolveBattle(strong, weak, 0, seq([0.5])).winner).toBe("attacker");
  });

  it("ikmal yetersizse supplyBroken isaretlenir", () => {
    const starving = army({ units: [unit({ supply: 5 })] });
    expect(resolveBattle(starving, army(), 0, seq([0.5])).supplyBroken).toBe(true);
  });

  it("kale arazi bonusu savunan lehine calisir", () => {
    const result = resolveBattle(army(), army(), 20, seq([0.5]));
    expect(result.defenderPower).toBeGreaterThan(result.attackerPower);
  });
});

describe("kusatma (belge 11)", () => {
  it("erzak bitince kusatilan teslim olur", () => {
    const result = resolveSiege({ fortressDefense: 100, wallIntegrity: 500, garrisonFood: 10, siegeEngines: 1, besiegerSupply: 500 });
    expect(result.surrendered).toBe(true);
  });

  it("kusatma araclari surlari asinca breach", () => {
    const result = resolveSiege({ fortressDefense: 50, wallIntegrity: 30, garrisonFood: 500, siegeEngines: 10, besiegerSupply: 500 });
    expect(result.breached).toBe(true);
  });

  it("kusatan tarafin ikmali biterse kusatma kalkar", () => {
    const result = resolveSiege({ fortressDefense: 100, wallIntegrity: 500, garrisonFood: 500, siegeEngines: 1, besiegerSupply: 10 });
    expect(result.breached).toBe(false);
    expect(result.surrendered).toBe(false);
  });
});

describe("deniz savasi (belge 11)", () => {
  it("gemi siniflari farkli gucte", () => {
    expect(SHIP_STATS.flagship.firepower).toBeGreaterThan(SHIP_STATS.longship.firepower);
    expect(SHIP_STATS.longship.speed).toBeGreaterThan(SHIP_STATS.galley.speed);
  });

  it("buyuk filo kucuk filoyu yener", () => {
    const big = fleet(Array(5).fill({ class: "flagship", condition: 100 }));
    const small = fleet([{ class: "longship", condition: 50 }]);
    expect(resolveNavalBattle(big, small, seq([0.5])).winner).toBe("attacker");
    expect(fleetPower(big)).toBeGreaterThan(fleetPower(small));
  });
});

describe("diplomasi (belge 10)", () => {
  it("iliski degeri durus belirler", () => {
    expect(stanceFor(80)).toBe("ally");
    expect(stanceFor(30)).toBe("friendly");
    expect(stanceFor(0)).toBe("neutral");
    expect(stanceFor(-40)).toBe("tense");
    expect(stanceFor(-80)).toBe("war");
  });

  it("hediye ve evlilik iliskiyi iyilestirir", () => {
    const rel: Relation = { fromKingdomId: "a", toKingdomId: "b", stance: "neutral", affinity: 0, allianceUntilGameDay: null };
    expect(applyDiplomacy(rel, "gift", 30).affinity).toBe(30);
    expect(applyDiplomacy(rel, "marriage", 40).affinity).toBe(60);
    expect(applyDiplomacy(rel, "marriage", 40).stance).toBe("ally");
  });

  it("hakaret ve tehdit iliskiyi bozar", () => {
    const rel: Relation = { fromKingdomId: "a", toKingdomId: "b", stance: "neutral", affinity: 0, allianceUntilGameDay: null };
    expect(applyDiplomacy(rel, "insult", 80).stance).toBe("war");
  });

  it("iliski -100..+100 araliginda kalir", () => {
    const rel: Relation = { fromKingdomId: "a", toKingdomId: "b", stance: "neutral", affinity: 90, allianceUntilGameDay: null };
    expect(applyDiplomacy(rel, "gift", 100).affinity).toBe(100);
  });
});

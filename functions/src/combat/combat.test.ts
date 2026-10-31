import { describe, expect, it } from "vitest";
import { resolveCombat, attackPower, defensePower, canDuel, isPvpAllowed, TERRAIN_BONUS, type CombatantStats } from "./resolve";

const base: CombatantStats = {
  attributes: { strength: 10, endurance: 10, agility: 10, intellect: 8, perception: 8, charisma: 8, leadership: 8 },
  weapon: "sword",
  weaponMastery: 3,
  armor: 30,
  healthFactor: 1,
  terrainBonus: 0,
  prepared: false,
};

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0.5;
};

describe("dovus (belge 14.1)", () => {
  it("saldiri ve savunma gucu pozitiftir", () => {
    expect(attackPower(base)).toBeGreaterThan(0);
    expect(defensePower(base)).toBeGreaterThan(0);
  });

  it("hazirlikli olmak saldiri gucunu artirir", () => {
    expect(attackPower({ ...base, prepared: true })).toBeGreaterThan(attackPower(base));
  });

  it("arazi bonusu savunmayi artirir (kale)", () => {
    const open = defensePower({ ...base, terrainBonus: TERRAIN_BONUS.open });
    const fort = defensePower({ ...base, terrainBonus: TERRAIN_BONUS.fortified });
    expect(fort).toBeGreaterThan(open);
  });

  it("silah turu nitelige gore olceklenir (yay -> algi)", () => {
    const archer = { ...base, weapon: "bow" as const, attributes: { ...base.attributes, perception: 18 } };
    const archerLow = { ...base, weapon: "bow" as const, attributes: { ...base.attributes, perception: 2 } };
    expect(attackPower(archer)).toBeGreaterThan(attackPower(archerLow));
  });

  it("dovus deterministik cozumlenir (enjekte rastlanti)", () => {
    const strong = { ...base, attributes: { ...base.attributes, strength: 20, endurance: 20 }, weaponMastery: 10 };
    const weak = { ...base, attributes: { ...base.attributes, strength: 2, endurance: 2 }, weaponMastery: 0 };
    const result = resolveCombat(strong, weak, seq([0.5]));
    expect(result.winner).toBe("attacker");
    expect(result.rounds.length).toBeGreaterThan(0);
  });

  it("saglik carpani dusukse dovus gucu azalir", () => {
    expect(attackPower({ ...base, healthFactor: 0.3 })).toBeLessThan(attackPower(base));
  });

  it("guvenli sehirde saldiri yok, duello rizaya bagli (belge 16.5)", () => {
    expect(canDuel(true, false)).toBe(false);
    expect(canDuel(true, true)).toBe(true);
    expect(isPvpAllowed("city", false, false)).toBe(false);
    expect(isPvpAllowed("village", true, false)).toBe(true);
    expect(isPvpAllowed("city", false, true)).toBe(true);
  });

  it("esit guclerde berabere veya kazanan belirlenir", () => {
    const result = resolveCombat(base, base, seq([0.5, 0.5]));
    expect(["attacker", "defender", "draw"]).toContain(result.winner);
  });
});

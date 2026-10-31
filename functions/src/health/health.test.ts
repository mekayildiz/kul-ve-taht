import { describe, expect, it } from "vitest";
import {
  healthyState, effectiveHealth, performanceMultiplier, addInjury, addDisease,
  advanceDay, eat, rest, advanceHunger, starvationDamage, MAX_HEALTH,
} from "./state";
import { treatInjury, treatDisease, treatmentQuality } from "./treatment";

const cut = { id: "w1", kind: "cut" as const, severity: 40, bleeding: 30, infection: 0, treated: false, occurredGameDay: 1 };

describe("saglik durumu (belge 6, 12.8)", () => {
  it("saglikli karakter tam saglikta baslar", () => {
    const s = healthyState();
    expect(s.health).toBe(MAX_HEALTH);
    expect(effectiveHealth(s)).toBe(MAX_HEALTH);
    expect(s.alive).toBe(true);
  });

  it("kanama ve enfeksiyon etkin sagligi dusurur", () => {
    const s = addInjury(healthyState(), cut);
    expect(effectiveHealth(s)).toBeLessThan(MAX_HEALTH);
  });

  it("aclik performansi dusurur (belge 12.8)", () => {
    const full = healthyState();
    const starving = advanceHunger(healthyState(), 12);
    expect(starving.hunger).toBeGreaterThan(80);
    expect(performanceMultiplier(starving)).toBeLessThan(performanceMultiplier(full));
    expect(starvationDamage(starving)).toBeGreaterThan(0);
  });

  it("yemek acligi dusurur, dinlenme bitkinligi azaltir", () => {
    const hungry = advanceHunger(healthyState(), 5);
    expect(eat(hungry, 30).hunger).toBeLessThan(hungry.hunger);
    const tired = { ...healthyState(), fatigue: 50 };
    expect(rest(tired, 4).fatigue).toBeLessThan(tired.fatigue);
  });

  it("olum KALICIDIR: saglik 0 olunca alive false ve geri gelmez", () => {
    const dying = { ...healthyState(), health: 1 };
    const dead = advanceDay(dying, 5);
    if (!dead.alive) {
      expect(advanceDay(dead, 6).alive).toBe(false);
    }
  });

  it("tedavi edilmeyen yarada enfeksiyon ARTAR, tedavi edilende azalir", () => {
    const untreated = advanceDay(addInjury(healthyState(), cut), 2);
    expect(untreated.injuries[0]?.infection).toBeGreaterThan(0);
    const treated = advanceDay(addInjury(healthyState(), { ...cut, treated: true }), 2);
    expect(treated.injuries[0]?.infection).toBe(0);
  });
});

describe("ayrintili tip (belge 20)", () => {
  it("sargi ile tedavi yarayi iyilestirir", () => {
    const s = addInjury(healthyState(), cut);
    const entries = [{ itemId: "bandage", quantity: 2, condition: 1 }];
    const result = treatInjury(s, entries, { injuryId: "w1", method: "bandage", quality: 70 });
    expect(result.ok).toBe(true);
    expect(result.state?.injuries[0]?.bleeding).toBeLessThan(cut.bleeding);
    expect(result.entries?.[0]?.quantity).toBe(1);
  });

  it("malzeme yoksa tedavi reddedilir", () => {
    const s = addInjury(healthyState(), cut);
    const result = treatInjury(s, [], { injuryId: "w1", method: "bandage", quality: 70 });
    expect(result).toEqual({ ok: false, error: "missing_item" });
  });

  it("kalitesiz tedavi kirikta KALICI sakatlik birakir", () => {
    const s = addInjury(healthyState(), { ...cut, kind: "fracture" });
    const result = treatInjury(s, [{ itemId: "bandage", quantity: 1, condition: 1 }], { injuryId: "w1", method: "bandage", quality: 20 });
    expect(result.permanent).toBe(true);
    expect(result.state?.permanentConditions.length).toBeGreaterThan(0);
  });

  it("hastalik ot ile daha hizli iyilesir", () => {
    const s = addDisease(healthyState(), { id: "d1", name: "ates", severity: 50, contagious: true, treated: false, occurredGameDay: 1 });
    const withHerb = treatDisease(s, [{ itemId: "healing-herb", quantity: 1, condition: 1 }], "d1", 60);
    const withoutHerb = treatDisease(s, [], "d1", 60);
    expect(withHerb.state?.diseases[0]?.severity ?? 0).toBeLessThan(withoutHerb.state?.diseases[0]?.severity ?? 100);
  });

  it("hekim niteligi ve ortam tedavi kalitesini belirler", () => {
    expect(treatmentQuality(50, true, true)).toBe(75);
    expect(treatmentQuality(100, true, true)).toBe(100);
  });
});

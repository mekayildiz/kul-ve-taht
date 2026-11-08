/**
 * Gelisim cubugu testleri (belge 5.5, 19).
 */

import { describe, expect, it } from "vitest";
import { progressFor, progressionBars, TIER_SIZE } from "./progression";
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

describe("progressFor", () => {
  it("sifirda 1. seviyede baslar", () => {
    const p = progressFor(0, 5);
    expect(p.level).toBe(1);
    expect(p.current).toBe(0);
    expect(p.ratio).toBe(0);
  });

  it("esik asilinca seviye atlar", () => {
    expect(progressFor(5, 5).level).toBe(2);
    expect(progressFor(5, 5).current).toBe(0);
    expect(progressFor(9, 5).level).toBe(2);
    expect(progressFor(9, 5).current).toBe(4);
  });

  it("yarim ilerlemede oran 0.5 olur", () => {
    expect(progressFor(3, 6).ratio).toBeCloseTo(0.5);
  });

  it("gecersiz girdilerde cokmez", () => {
    expect(progressFor(-4, 5).current).toBe(0);
    expect(progressFor(Number.NaN, 5).level).toBe(1);
    expect(progressFor(3, 0).next).toBe(1);
  });
});

describe("progressionBars", () => {
  it("uc cubuk dondurur ve degerleri esler", () => {
    const bars = progressionBars(play({ weaponMastery: 7, reputation: 25, underworldRep: 4 }));
    expect(bars.map((b) => b.key)).toEqual(["mastery", "reputation", "underworld"]);
    const mastery = bars.find((b) => b.key === "mastery")!;
    expect(mastery.level).toBe(2);
    expect(mastery.current).toBe(2);
    const rep = bars.find((b) => b.key === "reputation")!;
    expect(rep.level).toBe(3);
    expect(rep.current).toBe(5);
    expect(TIER_SIZE.underworld).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { planTravel, distanceBetween, lodgingCost, BASE_TRAVEL_SPEED_KM_PER_DAY } from "./travel";
import { SETTLEMENTS } from "../world/settlements";

const drahkmar = SETTLEMENTS.find((s) => s.id === "varkhenn-drahkmar")!;
const kaldrast = SETTLEMENTS.find((s) => s.id === "varkhenn-kaldrast")!;

const clearSummer = { season: "summer" as const, roadQuality: 80, weather: "clear" as const, hasMount: false, isCaravan: false };

describe("seyahat (belge 12.6, 15)", () => {
  it("mesafe pozitiftir ve simetriktir", () => {
    expect(distanceBetween(drahkmar, kaldrast)).toBeGreaterThan(0);
    expect(distanceBetween(drahkmar, kaldrast)).toBe(distanceBetween(kaldrast, drahkmar));
  });

  it("binek seyahati hizlandirir", () => {
    const foot = planTravel(drahkmar, kaldrast, clearSummer);
    const mounted = planTravel(drahkmar, kaldrast, { ...clearSummer, hasMount: true });
    expect(mounted.gameDays).toBeLessThan(foot.gameDays);
  });

  it("kervan yavaslar ama daha guvenlidir", () => {
    const solo = planTravel(drahkmar, kaldrast, clearSummer);
    const caravan = planTravel(drahkmar, kaldrast, { ...clearSummer, isCaravan: true });
    expect(caravan.gameDays).toBeGreaterThanOrEqual(solo.gameDays);
    expect(caravan.dangerLevel).toBeLessThan(solo.dangerLevel);
  });

  it("kis + kar + kotu yol seyahati KAPATIR", () => {
    const result = planTravel(drahkmar, kaldrast, { ...clearSummer, season: "winter", weather: "snow", roadQuality: 20 });
    expect(result.blocked).toBe(true);
    expect(result.gameDays).toBe(0);
  });

  it("oyun gunu 6 gercek saate karsilik gelir", () => {
    const result = planTravel(drahkmar, kaldrast, clearSummer);
    expect(result.hours).toBeCloseTo(result.gameDays * 6, 0);
  });

  it("konaklama maliyeti yerlesim tipine gore degisir", () => {
    expect(lodgingCost("capital", 2)).toBeGreaterThan(lodgingCost("village", 2));
  });

  it("temel hiz sabittir", () => {
    expect(BASE_TRAVEL_SPEED_KM_PER_DAY).toBe(30);
  });
});

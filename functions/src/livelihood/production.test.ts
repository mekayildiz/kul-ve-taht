import { describe, expect, it } from "vitest";
import {
  ANIMALS,
  CROPS,
  LIVESTOCK,
  famineRisk,
  hunt,
  livestockDailyIncome,
  plantCrop,
  tameAnimal,
} from "./production";

const first = (): number => 0;
const last = (): number => 0.999;

describe("Tarim ve hayvancilik (E8, belge 12.7)", () => {
  it("uygun mevsimde ekim verim uretir", () => {
    const r = plantCrop({ crop: "wheat", season: "spring", weather: "clear", soilQuality: 1, expertise: 50 });
    expect(r.ok).toBe(true);
    expect(r.yieldAmount).toBeGreaterThan(0);
    expect(r.growDays).toBe(90);
  });

  it("yanlis mevsimde ekim reddedilir", () => {
    const r = plantCrop({ crop: "wheat", season: "winter", weather: "clear", soilQuality: 1, expertise: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("wrong_season");
    expect(r.yieldAmount).toBe(0);
  });

  it("kotu hava verimi dusurur", () => {
    const clear = plantCrop({ crop: "barley", season: "spring", weather: "clear", soilQuality: 1, expertise: 50 });
    const snow = plantCrop({ crop: "barley", season: "spring", weather: "snow", soilQuality: 1, expertise: 50 });
    expect(snow.yieldAmount).toBeLessThan(clear.yieldAmount);
  });

  it("yuksek uzmanlik verimi artirir", () => {
    const low = plantCrop({ crop: "vegetable", season: "summer", weather: "clear", soilQuality: 1, expertise: 0 });
    const high = plantCrop({ crop: "vegetable", season: "summer", weather: "clear", soilQuality: 1, expertise: 100 });
    expect(high.yieldAmount).toBeGreaterThan(low.yieldAmount);
  });

  it("hayvancilik geliri bakim maliyetini dusurur", () => {
    expect(livestockDailyIncome("cattle", 10, 5)).toBe(40);
    expect(livestockDailyIncome("cattle", 0, 5)).toBe(0);
  });

  it("kisin ve dusuk stokta kitlik riski artar", () => {
    const summerFull = famineRisk("summer", 1000, 100);
    const winterEmpty = famineRisk("winter", 0, 100);
    expect(winterEmpty).toBeGreaterThan(summerFull);
    expect(winterEmpty).toBeLessThanOrEqual(1);
  });

  it("av basarili oldugunda ganimet doner", () => {
    const r = hunt("deer", 80, 60, first);
    expect(r.success).toBe(true);
    expect(r.loot.length).toBeGreaterThan(0);
  });

  it("av basarisiz oldugunda ganimet yok", () => {
    const r = hunt("bear", 0, 0, last);
    expect(r.success).toBe(false);
    expect(r.loot).toEqual([]);
  });

  it("tehlikeli hayvan yaralama riski tasir", () => {
    const r = hunt("bear", 10, 5, first);
    expect(r.success).toBe(true);
    expect(r.injury).not.toBeNull();
  });

  it("evcillestirme kurallari uygulanir", () => {
    expect(tameAnimal("fox", 50, true).ok).toBe(true);
    expect(tameAnimal("bear", 50, true).reason).toBe("not_tameable");
    expect(tameAnimal("fox", 50, false).reason).toBe("no_feed");
    expect(tameAnimal("fox", 5, true).reason).toBe("not_skilled");
  });

  it("veri setleri tutarli (her mahsul ve hayvanin tanimi var)", () => {
    expect(CROPS.length).toBeGreaterThan(0);
    expect(LIVESTOCK.length).toBeGreaterThan(0);
    expect(ANIMALS.every((a) => a.loot.length > 0)).toBe(true);
  });
});

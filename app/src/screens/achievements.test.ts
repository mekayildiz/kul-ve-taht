/**
 * Basarim testleri (belge 19).
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  achievementInputFrom,
  achievementSummary,
  achievementsFor,
  loadSeenAchievements,
  newlyUnlocked,
  saveSeenAchievements,
  type AchievementInput,
} from "./achievements";

const zero: AchievementInput = {
  gold: 0,
  weaponMastery: 0,
  reputation: 0,
  underworldRep: 0,
  magicLevel: 0,
  strength: 0,
  completedQuests: 0,
  properties: 0,
  companies: 0,
  units: 0,
  ships: 0,
  children: 0,
};

describe("achievementsFor", () => {
  it("sifir durumda hicbiri acilmaz", () => {
    const list = achievementsFor(zero);
    expect(list).toHaveLength(ACHIEVEMENTS.length);
    expect(list.some((a) => a.unlocked)).toBe(false);
  });

  it("hedefe ulasinca acilir", () => {
    const list = achievementsFor({ ...zero, gold: 50 });
    expect(list.find((a) => a.id === "ilkKazanc")?.unlocked).toBe(true);
    expect(list.find((a) => a.id === "zengin")?.unlocked).toBe(false);
  });

  it("hedefin uzerine cikmak da acar", () => {
    const list = achievementsFor({ ...zero, gold: 9999 });
    expect(list.find((a) => a.id === "ilkKazanc")?.unlocked).toBe(true);
    expect(list.find((a) => a.id === "zengin")?.unlocked).toBe(true);
  });

  it("ilerleme orani 0..1 arasinda kalir", () => {
    const list = achievementsFor({ ...zero, gold: 25 });
    const ilk = list.find((a) => a.id === "ilkKazanc")!;
    expect(ilk.ratio).toBeCloseTo(0.5);
    const zengin = list.find((a) => a.id === "zengin")!;
    expect(zengin.ratio).toBeCloseTo(0.05);
    for (const a of achievementsFor({ ...zero, gold: 100000 })) {
      expect(a.ratio).toBeLessThanOrEqual(1);
      expect(a.ratio).toBeGreaterThanOrEqual(0);
    }
  });

  it("her basarim bir kez listelenir", () => {
    const ids = achievementsFor(zero).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("achievementSummary", () => {
  it("acilan sayisini ve orani verir", () => {
    const list = achievementsFor({ ...zero, gold: 500, weaponMastery: 10 });
    const s = achievementSummary(list);
    expect(s.total).toBe(ACHIEVEMENTS.length);
    expect(s.unlocked).toBe(3);
    expect(s.ratio).toBeCloseTo(3 / ACHIEVEMENTS.length);
  });

  it("bos listede sifira bolmez", () => {
    expect(achievementSummary([])).toEqual({ unlocked: 0, total: 0, ratio: 0 });
  });
});

describe("newlyUnlocked", () => {
  it("yalnizca yeni acilanlari dondurur", () => {
    const list = achievementsFor({ ...zero, gold: 500, weaponMastery: 10 });
    expect(newlyUnlocked([], list)).toEqual(["ilkKazanc", "zengin", "usta"]);
    expect(newlyUnlocked(["ilkKazanc"], list)).toEqual(["zengin", "usta"]);
    expect(newlyUnlocked(["ilkKazanc", "zengin", "usta"], list)).toEqual([]);
  });

  it("acilmamis basarimi bildirmez", () => {
    const list = achievementsFor(zero);
    expect(newlyUnlocked([], list)).toEqual([]);
  });
});

describe("achievementInputFrom", () => {
  it("durumdan sayilari toplar", () => {
    const input = achievementInputFrom({
      play: {
        gold: 120,
        weaponMastery: 3,
        reputation: 7,
        underworldRep: 1,
        magicLevel: 2,
        strength: 9,
      },
      quests: [{ status: "completed" }, { status: "active" }, { status: "completed" }],
      properties: [{}],
      companies: [],
      units: [{}, {}],
      ships: [],
      children: [{}],
    });
    expect(input).toEqual({
      gold: 120,
      weaponMastery: 3,
      reputation: 7,
      underworldRep: 1,
      magicLevel: 2,
      strength: 9,
      completedQuests: 2,
      properties: 1,
      companies: 0,
      units: 2,
      ships: 0,
      children: 1,
    });
  });

  it("oyun durumu yoksa sifirlarla doner", () => {
    const input = achievementInputFrom({
      play: null,
      quests: [],
      properties: [],
      companies: [],
      units: [],
      ships: [],
      children: [],
    });
    expect(input.gold).toBe(0);
    expect(input.completedQuests).toBe(0);
  });
});

describe("gorulen basarim kaliciligi", () => {
  beforeEach(() => localStorage.clear());

  it("kaydedip geri okur", () => {
    saveSeenAchievements("ch-1", ["ilkKazanc", "zengin"]);
    expect(loadSeenAchievements("ch-1")).toEqual(["ilkKazanc", "zengin"]);
  });

  it("karakterler arasinda karismaz", () => {
    saveSeenAchievements("ch-1", ["ilkKazanc"]);
    expect(loadSeenAchievements("ch-2")).toEqual([]);
  });

  it("bozuk veride guvenli varsayilana doner", () => {
    localStorage.setItem("kvt.achv.ch-1", "{bozuk");
    expect(loadSeenAchievements("ch-1")).toEqual([]);
  });

  it("dizi olmayan veriyi yok sayar", () => {
    localStorage.setItem("kvt.achv.ch-1", JSON.stringify({ a: 1 }));
    expect(loadSeenAchievements("ch-1")).toEqual([]);
  });
});

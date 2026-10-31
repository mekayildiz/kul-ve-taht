import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  GUILDS,
  MAGIC_PATHS,
  SPELLS,
  canJoinGuild,
  canLearnSpell,
  castSpell,
  guildBenefits,
  isDarkMagicCrime,
  joinActivity,
  templeService,
} from "./lore";

const win = (): number => 0;
const lose = (): number => 0.99;

describe("Buyu, tapinak, lonca ve sehir yasami (E8, belge 13/15)", () => {
  it("element buyu egitim veya kitapla ogrenilir", () => {
    expect(canLearnSpell("elemental", 0, "aurelith", true, false).ok).toBe(true);
    expect(canLearnSpell("elemental", 0, "aurelith", false, true).ok).toBe(true);
    expect(canLearnSpell("elemental", 0, "aurelith", false, false).reason).toBe("no_source");
  });

  it("ruh cagirma yalnizca nadir kitapla ve yeterli seviyeyle", () => {
    expect(canLearnSpell("spirit_caller", 25, "aurelith", true, false).ok).toBe(true);
    expect(canLearnSpell("spirit_caller", 10, "aurelith", true, false).reason).toBe("level_too_low");
    expect(canLearnSpell("spirit_caller", 25, "aurelith", false, false).reason).toBe("no_book");
  });

  it("karanlik sanat bazi kralliklarda suctur", () => {
    expect(canLearnSpell("spirit_caller", 25, "varkhenn", true, false).reason).toBe("outlawed_here");
    expect(isDarkMagicCrime("spirit_caller", "caelvar")).toBe(true);
    expect(isDarkMagicCrime("elemental", "caelvar")).toBe(false);
  });

  it("buyu kullanma seviye ve enerji ister", () => {
    expect(castSpell("flame-bolt", 5, 20).ok).toBe(true);
    expect(castSpell("raise-spirit", 10, 100).reason).toBe("level_too_low");
    expect(castSpell("flame-bolt", 5, 1).reason).toBe("not_enough_energy");
  });

  it("sifa buyusu iyilestirme olarak isaretlenir", () => {
    expect(castSpell("healing-spring", 5, 20).heals).toBe(true);
    expect(castSpell("flame-bolt", 5, 20).heals).toBe(false);
  });

  it("tapinak hizmetleri islevseldir (ayri inanc sistemi yok)", () => {
    expect(templeService("healing", 100).effect).toBe(30);
    expect(templeService("healing", 1).reason).toBe("not_enough_gold");
  });

  it("loncaya katilma uzmanlik, aidat ve itibar ister", () => {
    expect(canJoinGuild("smiths", 20, 100, 0).ok).toBe(true);
    expect(canJoinGuild("smiths", 5, 100, 0).reason).toBe("expertise_too_low");
    expect(canJoinGuild("smiths", 20, 1, 0).reason).toBe("cannot_afford_dues");
    expect(canJoinGuild("smiths", 20, 100, -50).reason).toBe("bad_reputation");
  });

  it("lonca uyeligi kidemle artan fayda saglar", () => {
    const newbie = guildBenefits("smiths", 0);
    const veteran = guildBenefits("smiths", 365);
    expect(veteran.trainingBonus).toBeGreaterThan(newbie.trainingBonus);
    expect(veteran.reputationPerMonth).toBeGreaterThan(newbie.reputationPerMonth);
  });

  it("etkinlik maliyeti karsilanamiyorsa reddedilir", () => {
    expect(joinActivity("tavern", 1).reason).toBe("not_enough_gold");
    expect(joinActivity("tavern", 10).ok).toBe(true);
  });

  it("festival sabit itibar kazandirir", () => {
    const r = joinActivity("festival", 100);
    expect(r.reputationDelta).toBe(5);
    expect(r.goldDelta).toBe(-5);
  });

  it("kumar sansa baglidir ve sonuc sunucuda hesaplanir", () => {
    const kazanc = joinActivity("gambling", 100, win);
    const kayip = joinActivity("gambling", 100, lose);
    expect(kazanc.goldDelta).toBeGreaterThan(kayip.goldDelta);
    expect(kayip.reputationDelta).toBeLessThan(0);
  });

  it("veri setleri tutarli", () => {
    expect(MAGIC_PATHS.length).toBe(3);
    expect(SPELLS.every((s) => MAGIC_PATHS.some((p) => p.id === s.path))).toBe(true);
    expect(GUILDS.length).toBeGreaterThan(0);
    expect(ACTIVITIES.length).toBe(6);
  });
});

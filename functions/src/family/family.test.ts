import { describe, expect, it } from "vitest";
import { canMarry, childStage, DAYS_TO_ADULTHOOD, childDevelopmentBonus, distributeInheritance, adjustReputation, recordDeath, MARRIAGE_MIN_AGE, type Family } from "./dynasty";

function family(): Family {
  return {
    id: "f1", surname: "Veyr", crest: "kurt", reputation: 50, wealth: 1000, debt: 0, titles: ["lord"], chronicle: [],
    members: [
      { id: "p1", name: "Kael", role: "parent", isPlayer: true, alive: true, ageYears: 40 },
      { id: "c1", name: "Ayla", role: "child", isPlayer: false, alive: true, ageYears: 20 },
      { id: "c2", name: "Bran", role: "child", isPlayer: false, alive: true, ageYears: 19 },
    ],
  };
}

describe("evlilik (belge 7.1)", () => {
  it("karsilikli riza ve yas sarti gerekir", () => {
    const a = family().members[0]!;
    const b = family().members[1]!;
    expect(canMarry(a, b, true)).toBe(true);
    expect(canMarry(a, b, false)).toBe(false);
  });

  it("yas siniri altinda evlilik olmaz", () => {
    const young = { ...family().members[1]!, ageYears: MARRIAGE_MIN_AGE - 1 };
    expect(canMarry(family().members[0]!, young, true)).toBe(false);
  });

  it("olü kisi evlenemez", () => {
    const dead = { ...family().members[1]!, alive: false };
    expect(canMarry(family().members[0]!, dead, true)).toBe(false);
  });
});

describe("cocuk gelisimi (belge 7.3)", () => {
  it("onaylanmis asamalar sirayla ilerler", () => {
    expect(childStage(1).name).toBe("infancy");
    expect(childStage(10).name).toBe("early_childhood");
    expect(childStage(30).name).toBe("childhood");
    expect(childStage(60).name).toBe("adolescence");
    expect(childStage(120).name).toBe("transition");
  });

  it("yetiskinlige gecis toplam 180 gercek gun", () => {
    expect(DAYS_TO_ADULTHOOD).toBe(180);
  });

  it("ebeveyn ilgisi ve sutanne gelisimi etkiler", () => {
    expect(childDevelopmentBonus(100, 100)).toBe(100);
    expect(childDevelopmentBonus(0, 0)).toBe(0);
  });
});

describe("miras ve kusaklar (belge 7.6)", () => {
  it("vasiyet yoksa varisler arasinda esit bolunur", () => {
    const result = distributeInheritance(family(), null, "p1");
    expect(result.heirs).toHaveLength(2);
    expect(result.heirs[0]?.gold).toBe(result.heirs[1]?.gold);
  });

  it("vasiyet oranlara gore paylasir", () => {
    const result = distributeInheritance(family(), { c1: 0.75, c2: 0.25 }, "p1");
    const c1 = result.heirs.find((h) => h.memberId === "c1")!;
    const c2 = result.heirs.find((h) => h.memberId === "c2")!;
    expect(c1.gold).toBeGreaterThan(c2.gold);
  });

  it("birden fazla varis ve vasiyet yoksa anlasmazlik olusur", () => {
    expect(distributeInheritance(family(), null, "p1").dispute).toBe(true);
    expect(distributeInheritance(family(), { c1: 1 }, "p1").dispute).toBe(false);
  });

  it("itibar 0-100 araliginda kalir", () => {
    expect(adjustReputation(family(), -100).reputation).toBe(0);
    expect(adjustReputation(family(), 100).reputation).toBe(100);
  });

  it("olum aile gecmisine kaydedilir", () => {
    const f = recordDeath(family(), "p1", "Kael öldü", 100);
    expect(f.members.find((m) => m.id === "p1")?.alive).toBe(false);
    expect(f.chronicle.length).toBe(1);
  });
});

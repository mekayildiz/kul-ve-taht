import { describe, expect, it } from "vitest";
import { addItem, removeItem, carryCapacity, totalValue, degrade, itemDef, ITEMS } from "./items";
import { craft, recipeById, workIncome, RECIPES } from "./crafting";

const empty: never[] = [];

describe("envanter (belge 21.1: sunucu dogrular)", () => {
  it("esya ekler ve yiginlari birlestirir", () => {
    const r1 = addItem(empty, "bread", 2, 100, 8, false);
    expect(r1.ok).toBe(true);
    const r2 = addItem(r1.entries!, "bread", 3, 100, 8, false);
    expect(r2.entries).toHaveLength(1);
    expect(r2.entries![0]?.quantity).toBe(5);
  });

  it("kapasite asilirsa reddeder", () => {
    const r = addItem(empty, "chainmail", 10, 0, 8, false);
    expect(r).toEqual({ ok: false, error: "over_capacity" });
  });

  it("bilinmeyen esyayi reddeder", () => {
    expect(addItem(empty, "yok-boyle-esya", 1, 100, 8, false).error).toBe("unknown_item");
  });

  it("yetersiz miktarda cikarma reddedilir", () => {
    const r = addItem(empty, "bread", 2, 100, 8, false);
    expect(removeItem(r.entries!, "bread", 5).error).toBe("insufficient_quantity");
  });

  it("negatif/sifir miktari reddeder", () => {
    expect(addItem(empty, "bread", 0, 100, 8, false).error).toBe("invalid_quantity");
    expect(addItem(empty, "bread", -3, 100, 8, false).error).toBe("invalid_quantity");
  });

  it("binek tasima kapasitesini artirir", () => {
    expect(carryCapacity(10, true)).toBeGreaterThan(carryCapacity(10, false));
  });

  it("yipranan esya deger kaybeder, kirilan esya bozulur", () => {
    const entries = addItem(empty, "iron-sword", 1, 100, 8, false).entries!;
    const full = totalValue(entries);
    const worn = degrade(entries[0]!, 90);
    expect(worn.broken).toBe(false);
    expect(totalValue([worn])).toBeLessThan(full);
    const broken = degrade(entries[0]!, 200);
    expect(broken.broken).toBe(true);
  });

  it("tum esya tanimlari gecerli", () => {
    for (const item of ITEMS) {
      expect(itemDef(item.id)).not.toBeNull();
      expect(item.maxDurability).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("uretim (belge 12.7, 13.3)", () => {
  it("malzeme yeterliyse uretir", () => {
    const recipe = recipeById("craft-bandage")!;
    const entries = [{ itemId: "cloth", quantity: 2, condition: 1 }];
    const result = craft(entries, recipe, 0, [], 0.1);
    expect(result.ok).toBe(true);
    expect(result.produced).toBe(3);
  });

  it("malzeme yoksa uretmez", () => {
    const recipe = recipeById("craft-sword")!;
    const result = craft([], recipe, 5, ["blacksmith"], 0.1);
    expect(result.error).toBe("missing_materials");
  });

  it("gerekli uzmanlik yoksa uretmez (sinif degil, ustalik)", () => {
    const recipe = recipeById("craft-sword")!;
    const entries = [{ itemId: "iron-ore", quantity: 3, condition: 1 }, { itemId: "oak-wood", quantity: 1, condition: 1 }, { itemId: "woodcutter-axe", quantity: 1, condition: 100 }];
    expect(craft(entries, recipe, 0, [], 0.1).error).toBe("missing_expertise");
  });

  it("alet yipranir", () => {
    const recipe = recipeById("craft-sword")!;
    const entries = [{ itemId: "iron-ore", quantity: 3, condition: 1 }, { itemId: "oak-wood", quantity: 1, condition: 1 }, { itemId: "woodcutter-axe", quantity: 1, condition: 100 }];
    const result = craft(entries, recipe, 5, ["blacksmith"], 0.1);
    expect(result.toolWear).toBe(2);
    expect(result.entries?.find((e) => e.itemId === "woodcutter-axe")?.condition).toBe(98);
  });

  it("ustalik seviyesi basari sansini artirir", () => {
    const recipe = recipeById("craft-chainmail")!;
    const entries = [{ itemId: "iron-ore", quantity: 6, condition: 1 }, { itemId: "cloth", quantity: 2, condition: 1 }];
    const lowSkill = craft(entries, recipe, 0, ["blacksmith"], 0.7);
    const highSkill = craft(entries, recipe, 8, ["blacksmith"], 0.7);
    expect(lowSkill.ok).toBe(false);
    expect(highSkill.ok).toBe(true);
  });

  it("meslek geliri makul ve ustalikla artar", () => {
    expect(workIncome("blacksmith", 0, 8)).toBeGreaterThan(0);
    expect(workIncome("blacksmith", 5, 8)).toBeGreaterThan(workIncome("blacksmith", 0, 8));
  });

  it("tum tarifler gecerli cikti uretir", () => {
    for (const recipe of RECIPES) {
      expect(itemDef(recipe.output)).not.toBeNull();
      expect(recipe.baseChance).toBeGreaterThan(0);
    }
  });
});

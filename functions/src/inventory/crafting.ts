/**
 * Uretim ve zanaat (tasarim belgesi 12.7, 13.3, 14.2).
 *
 * Zanaat sunucu tarafinda dogrulanir: malzeme envanterde yoksa uretim
 * reddedilir. Ustalik (expertise) ve alet kalitesi basariyi ve cikti
 * miktarini etkiler.
 */

import { itemDef, type InventoryEntry } from "./items";

export interface Recipe {
  id: string;
  output: string;
  outputQuantity: number;
  inputs: { itemId: string; quantity: number }[];
  /** Gerekli uzmanlik yolu (opsiyonel). */
  requiresExpertise?: string;
  /** Gerekli alet (opsiyonel; yipranir). */
  requiresTool?: string;
  /** Temel basari sansi 0-100. */
  baseChance: number;
}

export const RECIPES: Recipe[] = [
  // "requiresExpertise" degerleri GERCEK uzmanlik sozluguyle ayni olmali:
  // lonca katilimi character_expertise'e lonca meslegini yazar (belge 13.3).
  { id: "craft-sword", output: "iron-sword", outputQuantity: 1, inputs: [{ itemId: "iron-ore", quantity: 3 }, { itemId: "oak-wood", quantity: 1 }], requiresExpertise: "blacksmith", requiresTool: "woodcutter-axe", baseChance: 80 },
  { id: "craft-chainmail", output: "chainmail", outputQuantity: 1, inputs: [{ itemId: "iron-ore", quantity: 6 }, { itemId: "cloth", quantity: 2 }], requiresExpertise: "blacksmith", baseChance: 65 },
  { id: "craft-leather-armor", output: "leather-armor", outputQuantity: 1, inputs: [{ itemId: "cloth", quantity: 3 }], baseChance: 85 },
  { id: "craft-bandage", output: "bandage", outputQuantity: 3, inputs: [{ itemId: "cloth", quantity: 1 }], baseChance: 95 },
  { id: "craft-healing-herb", output: "healing-herb", outputQuantity: 2, inputs: [{ itemId: "oak-wood", quantity: 1 }], requiresExpertise: "herbalist", baseChance: 70 },
  { id: "craft-bread", output: "bread", outputQuantity: 4, inputs: [{ itemId: "oak-wood", quantity: 1 }], baseChance: 90 },
  { id: "craft-wool-cloak", output: "wool-cloak", outputQuantity: 1, inputs: [{ itemId: "cloth", quantity: 4 }], baseChance: 88 },
];

export function recipeById(id: string): Recipe | null {
  return RECIPES.find((r) => r.id === id) ?? null;
}

export type CraftError =
  | "unknown_recipe"
  | "missing_materials"
  | "missing_tool"
  | "missing_expertise"
  | "craft_failed";

export interface CraftResult {
  ok: boolean;
  error?: CraftError;
  entries?: InventoryEntry[];
  /** Uretilen miktar (kismi basari olabilir). */
  produced?: number;
  /** Harcanan alet yipranmasi. */
  toolWear?: number;
}

/**
 * Uretim: malzemeleri dogrular ve tuketir; ustalik seviyesi basariyi artirir.
 * `roll` enjekte edilebilir (test edilebilirlik icin).
 */
export function craft(
  entries: InventoryEntry[],
  recipe: Recipe,
  expertiseLevel: number,
  knownExpertise: string[],
  roll: number,
): CraftResult {
  if (recipe.requiresExpertise && !knownExpertise.includes(recipe.requiresExpertise)) {
    return { ok: false, error: "missing_expertise" };
  }

  // Malzeme kontrolu: her girdi yeterli mi?
  for (const input of recipe.inputs) {
    const have = entries.filter((e) => e.itemId === input.itemId).reduce((s, e) => s + e.quantity, 0);
    if (have < input.quantity) return { ok: false, error: "missing_materials" };
  }

  let toolWear = 0;
  if (recipe.requiresTool) {
    const tool = entries.find((e) => e.itemId === recipe.requiresTool);
    if (!tool) return { ok: false, error: "missing_tool" };
    toolWear = 2;
  }

  // Basari: temel sans + ustalik bonusu (seviye basina +4).
  const chance = Math.min(99, recipe.baseChance + expertiseLevel * 4);
  const success = roll * 100 < chance;

  // Malzemeleri tuket (basarisiz olsa da malzeme kaybi var: gercekci).
  let next = entries.map((e) => ({ ...e }));
  for (const input of recipe.inputs) {
    let remaining = input.quantity;
    next = next
      .map((e) => {
        if (e.itemId !== input.itemId || remaining <= 0) return e;
        const take = Math.min(e.quantity, remaining);
        remaining -= take;
        return { ...e, quantity: e.quantity - take };
      })
      .filter((e) => e.quantity > 0);
  }

  if (recipe.requiresTool && toolWear > 0) {
    next = next
      .map((e) => (e.itemId === recipe.requiresTool ? { ...e, condition: Math.max(0, e.condition - toolWear) } : e))
      .filter((e) => e.condition > 0);
  }

  if (!success) return { ok: false, error: "craft_failed", entries: next, produced: 0, toolWear };

  const def = itemDef(recipe.output);
  const outCondition = def?.maxDurability ?? 1;
  const existing = next.find((e) => e.itemId === recipe.output && e.condition === outCondition);
  if (existing) existing.quantity += recipe.outputQuantity;
  else next.push({ itemId: recipe.output, quantity: recipe.outputQuantity, condition: outCondition });

  return { ok: true, entries: next, produced: recipe.outputQuantity, toolWear };
}

/** Meslek faaliyeti ile kazanc (belge 14.2). */
export function workIncome(profession: string, expertiseLevel: number, hours: number): number {
  const baseRates: Record<string, number> = {
    blacksmith: 6,
    farmer: 3,
    hunter: 5,
    miner: 5,
    merchant: 8,
    healer: 7,
    soldier: 6,
    scholar: 5,
    craftsman: 6,
  };
  const rate = baseRates[profession] ?? 4;
  return Math.round(rate * hours * (1 + expertiseLevel * 0.1));
}

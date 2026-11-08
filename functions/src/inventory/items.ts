/**
 * Esya katalogu ve envanter islemleri (tasarim belgesi 12.3, 14.3, 21.1).
 *
 * Islemler SUNUCUDA dogrulanir; miktar/para istemciden alinmaz (belge 21.1).
 * Envanter polimorfiktir (owner_type/owner_id) ve yigilabilir.
 */

export type ItemCategory =
  | "weapon"
  | "armor"
  | "tool"
  | "food"
  | "material"
  | "medicine"
  | "luxury"
  | "mount"
  | "book";

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  weight: number;
  baseValue: number;
  maxDurability: number;
  /** Silah/uzmanlik icin tur (belge 14.3). */
  weaponType?: "sword" | "spear" | "axe" | "bow" | "crossbow" | "dagger";
  /** Yemek besin degeri (belge 12.8). */
  nutrition?: number;
  /** Yara tedavi gucu (belge 6). */
  healing?: number;
}

export const ITEMS: ItemDef[] = [
  { id: "iron-sword", name: "Demir Kılıç", category: "weapon", weight: 1.2, baseValue: 40, maxDurability: 100, weaponType: "sword" },
  { id: "hunting-bow", name: "Av Yayı", category: "weapon", weight: 0.8, baseValue: 35, maxDurability: 80, weaponType: "bow" },
  { id: "spear", name: "Mızrak", category: "weapon", weight: 1.5, baseValue: 30, maxDurability: 90, weaponType: "spear" },
  { id: "woodcutter-axe", name: "Balta", category: "weapon", weight: 1.6, baseValue: 28, maxDurability: 95, weaponType: "axe" },
  { id: "leather-armor", name: "Deri Zırh", category: "armor", weight: 4, baseValue: 45, maxDurability: 100 },
  { id: "chainmail", name: "Zincir Zırh", category: "armor", weight: 9, baseValue: 140, maxDurability: 160 },
  { id: "bread", name: "Ekmek", category: "food", weight: 0.3, baseValue: 2, maxDurability: 1, nutrition: 25 },
  { id: "dried-meat", name: "Kurutulmuş Et", category: "food", weight: 0.4, baseValue: 5, maxDurability: 1, nutrition: 40 },
  { id: "iron-ore", name: "Demir Cevheri", category: "material", weight: 2, baseValue: 8, maxDurability: 1 },
  { id: "oak-wood", name: "Meşe Kereste", category: "material", weight: 1.5, baseValue: 4, maxDurability: 1 },
  { id: "cloth", name: "Kumaş", category: "material", weight: 0.5, baseValue: 6, maxDurability: 1 },
  { id: "healing-herb", name: "Şifalı Ot", category: "medicine", weight: 0.2, baseValue: 12, maxDurability: 1, healing: 15 },
  { id: "bandage", name: "Sargı Bezi", category: "medicine", weight: 0.1, baseValue: 3, maxDurability: 1, healing: 8 },
  { id: "wool-cloak", name: "Yün Pelerin", category: "luxury", weight: 1, baseValue: 20, maxDurability: 60 },
  { id: "pack-horse", name: "Yük Atı", category: "mount", weight: 0, baseValue: 120, maxDurability: 100 },
  { id: "tome-of-medicine", name: "Tıp Kitabı", category: "book", weight: 1, baseValue: 90, maxDurability: 1 },
  { id: "tome-of-arcana", name: "Büyü Kitabı", category: "book", weight: 1, baseValue: 120, maxDurability: 1 },
  { id: "tome-of-spirits", name: "Ruh Kitabı", category: "book", weight: 1, baseValue: 180, maxDurability: 1 },
];

const ITEM_MAP = new Map(ITEMS.map((i) => [i.id, i]));

export function itemDef(id: string): ItemDef | null {
  return ITEM_MAP.get(id) ?? null;
}

export interface InventoryEntry {
  itemId: string;
  quantity: number;
  condition: number;
}

export const MAX_CARRY_WEIGHT = 40;

export function inventoryWeight(entries: InventoryEntry[]): number {
  return entries.reduce((sum, e) => {
    const def = itemDef(e.itemId);
    return sum + (def ? def.weight * e.quantity : 0);
  }, 0);
}

/** Nitelik ve yuk tasima: guc tasima kapasitesini belirler. */
export function carryCapacity(strength: number, hasMount: boolean): number {
  return MAX_CARRY_WEIGHT + strength * 1.5 + (hasMount ? 60 : 0);
}

export type InventoryError = "unknown_item" | "insufficient_quantity" | "over_capacity" | "invalid_quantity";

export interface InventoryResult {
  ok: boolean;
  entries?: InventoryEntry[];
  error?: InventoryError;
}

/** Esya ekler (yiginlari birlestirir); kapasite kontrolu yapar. */
export function addItem(
  entries: InventoryEntry[],
  itemId: string,
  quantity: number,
  capacity: number,
  strength: number,
  hasMount: boolean,
): InventoryResult {
  if (quantity <= 0) return { ok: false, error: "invalid_quantity" };
  const def = itemDef(itemId);
  if (!def) return { ok: false, error: "unknown_item" };

  const next = entries.map((e) => ({ ...e }));
  const existing = next.find((e) => e.itemId === itemId && e.condition === def.maxDurability);
  if (existing) existing.quantity += quantity;
  else next.push({ itemId, quantity, condition: def.maxDurability });

  if (inventoryWeight(next) > carryCapacity(strength, hasMount)) {
    return { ok: false, error: "over_capacity" };
  }
  return { ok: true, entries: next };
}

/** Esya cikarir; yetersizse reddeder. */
export function removeItem(entries: InventoryEntry[], itemId: string, quantity: number): InventoryResult {
  if (quantity <= 0) return { ok: false, error: "invalid_quantity" };
  const total = entries.filter((e) => e.itemId === itemId).reduce((s, e) => s + e.quantity, 0);
  if (total < quantity) return { ok: false, error: "insufficient_quantity" };

  let remaining = quantity;
  const next: InventoryEntry[] = [];
  for (const entry of entries) {
    if (entry.itemId !== itemId || remaining <= 0) {
      next.push({ ...entry });
      continue;
    }
    const take = Math.min(entry.quantity, remaining);
    remaining -= take;
    if (entry.quantity - take > 0) next.push({ ...entry, quantity: entry.quantity - take });
  }
  return { ok: true, entries: next };
}

/** Esya yipranmasi (belge 21.1: sunucu tarafi). Kirilirsa esya kaybolur. */
export function degrade(entry: InventoryEntry, wear: number): InventoryEntry & { broken: boolean } {
  const condition = Math.max(0, entry.condition - wear);
  return { ...entry, condition, broken: condition <= 0 };
}

export function totalValue(entries: InventoryEntry[]): number {
  return entries.reduce((sum, e) => {
    const def = itemDef(e.itemId);
    if (!def) return sum;
    const wearFactor = def.maxDurability > 1 ? 0.5 + 0.5 * (e.condition / def.maxDurability) : 1;
    return sum + Math.round(def.baseValue * e.quantity * wearFactor);
  }, 0);
}

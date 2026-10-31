/**
 * Depolama, bozulma ve tekel (tasarim belgesi 9.3, 9.4).
 *
 * Envanter SINIRLI depolama kapasitesine sahiptir; gida ve benzeri urunler
 * gun gun bozulur. Bolgesel tekel: bir saticinin pazar payi esigi asarsa
 * fiyati yukseltebilir; ancak devlet mudahalesi ve ithalat fiyati geri
 * baski altina alir. Butun hesaplar SUNUCUDA yapilir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";
import { itemDef } from "../inventory/items";
import { decayDay, monopolyPriceFactor, storageOverflow, runBudgetMonth, auditCorruption, marketIntervention, type Perishability, type StockEntry, type StorageDef } from "../economy/extras";
import type { InventoryEntry } from "../inventory/items";

/** Envanter deposu: yaya 80 birim; binek/at ile artar (belge 10.4). */
export const BASE_STORAGE: StorageDef = { capacity: 80, preservationFactor: 1 };
export const MOUNT_STORAGE_BONUS = 60;
/** Ahir/ev deposu ek kapasite (belge 11.4). */
export const HOME_STORAGE_BONUS = 200;

/** Esya bozulma sinifi: gida taze, ilac yari dayanikli, gerisi dayanikli. */
export function perishabilityOf(itemId: string): Perishability {
  const def = itemDef(itemId);
  if (!def) return "durable";
  if (def.category === "food") return "fresh";
  if (def.category === "medicine") return "stable";
  return "durable";
}

export function storageFor(strength: number, hasMount: boolean, hasHome: boolean): StorageDef {
  const strengthBonus = Math.max(0, strength - 8) * 5;
  return {
    capacity: BASE_STORAGE.capacity + (hasMount ? MOUNT_STORAGE_BONUS : 0) + (hasHome ? HOME_STORAGE_BONUS : 0) + strengthBonus,
    preservationFactor: hasHome ? 0.6 : 1,
  };
}

export function toStock(entries: readonly InventoryEntry[]): StockEntry[] {
  return entries.map((e) => ({ itemId: e.itemId, quantity: e.quantity, perishability: perishabilityOf(e.itemId), ageDays: 0 }));
}

/**
 * Gunluk bozulmayi envanter girdilerine uygular; esyanin `condition`
 * degeri KORUNUR (bozulma yalnizca miktari azaltir, silah asinmasi degildir).
 * Yalnizca bozulabilir kategoriler (gida, ilac) etkilenir.
 */
export function decayInventory(
  entries: readonly InventoryEntry[],
  storage: StorageDef,
  gameDays = 1,
): InventoryEntry[] {
  const stock = toStock(entries);
  const decayed = new Map(decayDay(stock, storage, gameDays).map((e) => [e.itemId, e.quantity]));
  return entries
    .map((e) => ({ ...e, quantity: decayed.get(e.itemId) ?? e.quantity }))
    .filter((e) => e.quantity > 0);
}

/** Depo doluluk ozeti (panel icin). */
export async function storageSummary(
  db: SqlDatabase,
  characterId: string,
  entries: readonly InventoryEntry[],
  strength: number,
  hasMount: boolean,
): Promise<{ used: number; capacity: number; overflow: number; preservationFactor: number }> {
  const home = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM character_properties WHERE character_id = ?",
    characterId,
  );
  const storage = storageFor(strength, hasMount, (home?.n ?? 0) > 0);
  const stock = toStock(entries);
  return {
    used: stock.reduce((s, e) => s + e.quantity, 0),
    capacity: storage.capacity,
    overflow: storageOverflow(stock, storage),
    preservationFactor: storage.preservationFactor,
  };
}

/**
 * Bolgesel tekel carpani: bir yerlesimin esya arzi, kitadaki toplam arza
 * gore esigi asarsa fiyat artar (belge 9.4). Yerel stok yigilarak bolgesel
 * fiyat yukseltilebilir; ithalat ve devlet mudahalesi bunu baskilar.
 */
export async function monopolyFactor(db: SqlDatabase, settlementId: string, itemId: string): Promise<number> {
  const rows = await queryOne<{ own: number; total: number }>(
    db,
    `SELECT
       COALESCE(MAX(CASE WHEN settlement_id = ? THEN supply END), 0) AS own,
       COALESCE(SUM(supply), 0) AS total
     FROM market_state WHERE item_id = ? AND supply > 0`,
    settlementId,
    itemId,
  );
  const total = rows?.total ?? 0;
  if (total <= 0) return 1;
  return monopolyPriceFactor((rows?.own ?? 0) / total);
}

/**
 * Devlet mudahalesi (belge 9.4, 9.9): hazineden tahil surulerek fiyat baskilanir.
 * Yalnizca kayitli krallik hazinesi yeterliyse uygulanir.
 */
export async function interveneMarket(
  db: SqlDatabase,
  kingdomId: string,
  grainAmount: number,
  unitCost: number,
): Promise<{ ok: boolean; treasury: number; priceRelief: number }> {
  const kingdom = await queryOne<{ treasury: number }>(db, "SELECT treasury FROM kingdoms WHERE id = ?", kingdomId);
  const treasury = kingdom?.treasury ?? 0;
  // Saf ekonomi kurali (economy/extras) tek kaynaktir.
  const outcome = marketIntervention(treasury, Math.max(1, grainAmount), Math.max(1, unitCost));
  if (!outcome.ok) return outcome;
  await execute(db, "UPDATE kingdoms SET treasury = ? WHERE id = ?", outcome.treasury, kingdomId);
  await execute(
    db,
    `INSERT INTO market_state (settlement_id, item_id, supply, demand, updated_day)
     VALUES (?,?,?,?,?)
     ON CONFLICT(settlement_id, item_id) DO UPDATE SET supply = MIN(400, supply + ?), updated_day = excluded.updated_day`,
    kingdomId,
    "*",
    100,
    100,
    await currentDay(db),
    Math.round(outcome.priceRelief * 500),
  );
  return outcome;
}

async function currentDay(db: SqlDatabase): Promise<number> {
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return clock?.game_day ?? 1;
}

/**
 * Krallik butcesini bir ay ilerletir (belge 9.7-9.9): vergi toplanir,
 * gider odenir, yetmezse borclanir. Idempotent degildir; aylik turda cagrilir.
 */
export async function runKingdomBudget(db: SqlDatabase, kingdomId: string): Promise<{ treasury: number; debt: number; debtCrisis: boolean } | null> {
  const kingdom = await queryOne<{ treasury: number; debt: number; population: number; corruption: number }>(
    db,
    `SELECT k.treasury, k.debt, COALESCE(SUM(s.population), 0) AS population,
            COALESCE(k.corruption, 0.1) AS corruption
     FROM kingdoms k LEFT JOIN settlements s ON s.kingdom_id = k.id
     WHERE k.id = ? GROUP BY k.id`,
    kingdomId,
  );
  if (!kingdom) return null;
  const population = kingdom.population ?? 0;
  const revenue = Math.round(population * 0.02);
  const expense = Math.round(population * 0.015);
  // Saf butce kurali (economy/extras) tek kaynaktir.
  const month = runBudgetMonth({
    treasury: kingdom.treasury,
    debt: kingdom.debt,
    monthlyRevenue: revenue,
    monthlyExpense: expense,
    corruption: kingdom.corruption ?? 0.1,
  });
  await execute(db, "UPDATE kingdoms SET treasury = ?, debt = ? WHERE id = ?", month.treasury, month.debt, kingdomId);
  return { treasury: month.treasury, debt: month.debt, debtCrisis: month.debtCrisis };
}

/**
 * Yolsuzluk denetimi (belge 9.8): kayitli gelir ile gercek gelir arasindaki
 * fark denetim gucuyle ortaya cikarilir; kaybolan kismi hazineye geri doner.
 */
export async function auditKingdomCorruption(
  db: SqlDatabase,
  kingdomId: string,
  actualRevenue: number,
  auditStrength: number,
): Promise<{ detected: number; newCorruption: number } | null> {
  const kingdom = await queryOne<{ treasury: number; population: number; corruption: number }>(
    db,
    `SELECT k.treasury, COALESCE(k.corruption, 0.1) AS corruption, COALESCE(SUM(s.population), 0) AS population
     FROM kingdoms k LEFT JOIN settlements s ON s.kingdom_id = k.id
     WHERE k.id = ? GROUP BY k.id`,
    kingdomId,
  );
  if (!kingdom) return null;
  const recorded = Math.round((kingdom.population ?? 0) * 0.02);
  const audit = auditCorruption(recorded, actualRevenue, auditStrength);
  await execute(
    db,
    "UPDATE kingdoms SET treasury = treasury + ?, corruption = ? WHERE id = ?",
    audit.detected,
    audit.newCorruption / Math.max(1, recorded),
    kingdomId,
  );
  return audit;
}

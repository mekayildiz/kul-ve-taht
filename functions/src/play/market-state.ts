/**
 * Pazar durumu: yerlesim bazli arz/talep ve bozulma carpani (belge 9.2, 9.4).
 *
 * Fiyatlar sunucuda hesaplanir. `market_state` tablosunda her (yerlesim,
 * esya) icin arz/talep tutulur; `item_id = '*'` satiri yerlesimin genel
 * bozulma carpanini tasir (savas, kitlik, ticaret yolu krizi...). Boylece
 * dunya olaylari tek satirda butun pazari etkiler.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";
import { applyTrade, buyPrice, sellPrice, type MarketState } from "../economy/market";
import { itemDef } from "../inventory/items";

const DEFAULT_SUPPLY = 100;
const DEFAULT_DEMAND = 100;
export const DISRUPTION_ROW = "*";

interface MarketRow {
  supply: number;
  demand: number;
}

/** Yerlesimin bozulma satirindan fiyat carpanini okur (belge 9.4). */
export async function disruptionFactor(db: SqlDatabase, settlementId: string): Promise<number> {
  const row = await queryOne<MarketRow>(
    db,
    "SELECT supply, demand FROM market_state WHERE settlement_id = ? AND item_id = ?",
    settlementId,
    DISRUPTION_ROW,
  );
  if (!row || row.demand <= 0) return 1;
  // Bozulma satirinda arz dususu carpani tutulur; fiyat ters orantili buyur.
  return Math.round((DEFAULT_SUPPLY / Math.max(10, row.supply)) * 100) / 100;
}

/**
 * Esyanin guncel pazar durumunu yukler. Kayit yoksa taban arz/talep ile
 * olusturulur; boylece yeni esyalar da bozulmadan etkilenir.
 */
export async function loadMarket(
  db: SqlDatabase,
  settlementId: string,
  itemId: string,
): Promise<MarketState | null> {
  const def = itemDef(itemId);
  if (!def) return null;
  const row = await queryOne<MarketRow>(
    db,
    "SELECT supply, demand FROM market_state WHERE settlement_id = ? AND item_id = ?",
    settlementId,
    itemId,
  );
  return {
    itemId,
    settlementId,
    supply: row?.supply ?? DEFAULT_SUPPLY,
    demand: row?.demand ?? DEFAULT_DEMAND,
    baseValue: def.baseValue,
  };
}

/** Alim/satim sonrasi pazar durumunu kalici yazar. */
export async function persistMarket(
  db: SqlDatabase,
  market: MarketState,
  gameDay: number,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO market_state (settlement_id, item_id, supply, demand, updated_day)
     VALUES (?,?,?,?,?)
     ON CONFLICT(settlement_id, item_id) DO UPDATE SET
       supply = excluded.supply, demand = excluded.demand, updated_day = excluded.updated_day`,
    market.settlementId,
    market.itemId,
    market.supply,
    market.demand,
    gameDay,
  );
}

export interface MarketQuote {
  itemId: string;
  settlementId: string;
  buy: number;
  sell: number;
  base: number;
  supply: number;
  demand: number;
  disruption: number;
}

/** Bozulma carpani uygulanmis alim/satim fiyatlari (belge 9.2, 9.4). */
export async function quoteMarket(
  db: SqlDatabase,
  settlementId: string,
  itemId: string,
): Promise<MarketQuote | null> {
  const market = await loadMarket(db, settlementId, itemId);
  if (!market) return null;
  const factor = await disruptionFactor(db, settlementId);
  const disrupted: MarketState = { ...market, baseValue: Math.round(market.baseValue * factor) };
  return {
    itemId,
    settlementId,
    buy: buyPrice(disrupted),
    sell: sellPrice(disrupted),
    base: market.baseValue,
    supply: market.supply,
    demand: market.demand,
    disruption: factor,
  };
}

/**
 * Islem uygular: fiyat hesaplanir, arz/talep guncellenir ve kaydedilir.
 * Donen deger islem basina birim fiyattir.
 */
export async function applyMarketTrade(
  db: SqlDatabase,
  settlementId: string,
  itemId: string,
  quantity: number,
  side: "buy" | "sell",
  gameDay: number,
): Promise<{ unitPrice: number; market: MarketState } | null> {
  const market = await loadMarket(db, settlementId, itemId);
  if (!market) return null;
  const factor = await disruptionFactor(db, settlementId);
  const disrupted: MarketState = { ...market, baseValue: Math.round(market.baseValue * factor) };
  const unitPrice = side === "buy" ? buyPrice(disrupted) : sellPrice(disrupted);
  const next = applyTrade(market, quantity, side);
  await persistMarket(db, next, gameDay);
  return { unitPrice, market: next };
}

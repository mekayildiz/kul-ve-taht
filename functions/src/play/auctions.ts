/**
 * Acik artirma (tasarim belgesi 9.3): sunucu otoriteli, kalici.
 *
 * Oyuncu bir esyayi rezerv fiyatla acik artirmaya koyar; diger oyuncular
 * teklif verir. Teklifler sunucuda dogrulanir (`placeBid`), artirma dunya
 * gunu kapandiginda cozulur (`settleAuction`) ve esya kazanana aktarilir.
 * Free plan yazma kotasi icin kapanan artirmalar parti halinde islenir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { placeBid, settleAuction, type Auction } from "../economy/extras";
import { itemDef, addItem, removeItem, carryCapacity } from "../inventory/items";
import { loadState, saveState, type PlayResult } from "./service";

/** Bir acik artirma suresi (dunya gunu). */
export const AUCTION_DAYS = 3;
/** Tek turda cozulecek en fazla artirma (Free plan yazma kotasi). */
export const AUCTION_SETTLE_BATCH = 25;

interface AuctionRow {
  id: string;
  settlement_id: string;
  item_id: string;
  quantity: number;
  reserve_price: number;
  top_bidder_id: string | null;
  top_bid: number;
  closes_day: number;
  settled: number;
  seller_id: string | null;
}

function toAuction(row: AuctionRow): Auction {
  return {
    id: row.id,
    itemId: row.item_id,
    quantity: row.quantity,
    reservePrice: row.reserve_price,
    currentBid: row.top_bid,
    currentBidderId: row.top_bidder_id,
    endsAtMs: row.closes_day,
  };
}

async function gameDay(db: SqlDatabase): Promise<number> {
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return clock?.game_day ?? 1;
}

async function settlementOf(db: SqlDatabase, characterId: string): Promise<string | null> {
  const row = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  return row?.current_settlement ?? null;
}

/** Acik artirmayi listeler (belge 9.3): yerlesim verilirse o yerlesimdekiler. */
export async function listAuctions(db: SqlDatabase, settlementId?: string): Promise<Auction[]> {
  const rows = settlementId
    ? await queryAll<AuctionRow>(
        db,
        "SELECT * FROM auctions WHERE settled = 0 AND settlement_id = ? ORDER BY closes_day ASC LIMIT 50",
        settlementId,
      )
    : await queryAll<AuctionRow>(
        db,
        "SELECT * FROM auctions WHERE settled = 0 ORDER BY closes_day ASC LIMIT 50",
      );
  return rows.map(toAuction);
}

/** Oyuncu esyayi acik artirmaya koyar; esya envanterden SUNUCUDA dusulur. */
export async function createAuction(
  db: SqlDatabase,
  characterId: string,
  itemId: string,
  quantity: number,
  reservePrice: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const def = itemDef(itemId);
  if (!def) return { ok: false, error: "unknown_item" };
  const qty = Math.max(1, Math.floor(quantity));
  const reserve = Math.max(1, Math.floor(reservePrice));
  const removed = removeItem(state.inventory, itemId, qty);
  if (!removed.ok) return { ok: false, error: "invalid_action" };
  state.inventory = removed.entries!;
  await saveState(db, state, nowMs);

  const day = await gameDay(db);
  const settlement = (await settlementOf(db, characterId)) ?? "varkhenn-drahkmar";
  const id = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO auctions (id, settlement_id, item_id, quantity, reserve_price, top_bidder_id, top_bid, closes_day, settled, seller_id)
     VALUES (?,?,?,?,?,NULL,0,?,0,?)`,
    id,
    settlement,
    itemId,
    qty,
    reserve,
    day + AUCTION_DAYS,
    characterId,
  );
  return { ok: true, state, detail: { auctionId: id, closesDay: day + AUCTION_DAYS, reservePrice: reserve } };
}

/**
 * Teklif verir. Teklif tutari SUNUCUDA dogrulanir ve oyuncunun altinindan
 * rezerve edilir (onceki teklif iade edilir).
 */
export async function bidAuction(
  db: SqlDatabase,
  characterId: string,
  auctionId: string,
  amount: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<AuctionRow>(db, "SELECT * FROM auctions WHERE id = ?", auctionId);
  if (!row) return { ok: false, error: "invalid_action", detail: { reason: "auction_not_found" } };
  if (row.settled === 1) return { ok: false, error: "invalid_action", detail: { reason: "auction_closed" } };

  const day = await gameDay(db);
  const current = toAuction(row);
  const result = placeBid(current, characterId, Math.floor(amount), day);
  if (!result.ok) {
    return { ok: false, error: "invalid_action", state, detail: { reason: result.reason } };
  }
  const bid = Math.floor(amount);
  if (state.gold < bid) return { ok: false, error: "not_enough_gold" };

  // Onceki en yuksek teklif sahibine altinini iade et.
  if (row.top_bidder_id && row.top_bid > 0) {
    await execute(db, "UPDATE character_state SET gold = gold + ? WHERE character_id = ?", row.top_bid, row.top_bidder_id);
  }
  state.gold -= bid;
  await saveState(db, state, nowMs);
  await execute(db, "UPDATE auctions SET top_bidder_id = ?, top_bid = ? WHERE id = ?", characterId, bid, auctionId);
  return { ok: true, state, detail: { auctionId, bid, closesDay: row.closes_day } };
}

/**
 * Kapanan artirmalari cozer: kazanan esyayi alir, saticiya altin gecer.
 * Kazanan yuk yetersizligi nedeniyle alamazsa teklif iade edilir.
 * Idempotent: `settled` bayragi tekrar islenmeyi engeller.
 */
export async function settleDueAuctions(db: SqlDatabase, nowMs = Date.now()): Promise<number> {
  const day = await gameDay(db);
  const due = await queryAll<AuctionRow>(
    db,
    "SELECT * FROM auctions WHERE settled = 0 AND closes_day <= ? ORDER BY closes_day ASC LIMIT ?",
    day,
    AUCTION_SETTLE_BATCH,
  );
  let settled = 0;
  for (const row of due) {
    const outcome = settleAuction(toAuction(row), day);
    let paid = false;
    if (outcome.sold && outcome.winnerId) {
      const winner = await loadState(db, outcome.winnerId, nowMs);
      if (winner) {
        const capacity = carryCapacity(winner.strength, false);
        const added = addItem(winner.inventory, row.item_id, row.quantity, capacity, winner.strength, false);
        if (added.ok) {
          winner.inventory = added.entries!;
          await saveState(db, winner, nowMs);
          paid = true;
        } else {
          // Yer yoksa teklif kazanana iade edilir; esya saticiya geri doner.
          await execute(db, "UPDATE character_state SET gold = gold + ? WHERE character_id = ?", outcome.price, outcome.winnerId);
        }
      }
    }
    // Saticiya altin yalnizca satis gerceklestiyse gecer.
    if (paid && row.seller_id) {
      await execute(db, "UPDATE character_state SET gold = gold + ? WHERE character_id = ?", outcome.price, row.seller_id);
    }
    await execute(db, "UPDATE auctions SET settled = 1 WHERE id = ?", row.id);
    settled += 1;
  }
  return settled;
}

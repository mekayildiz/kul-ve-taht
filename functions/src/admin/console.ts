/**
 * Yonetici konsolu veri katmani (tasarim belgesi 20).
 *
 * Belge 20: "yonetim/erisilebilirlik" gorevleri tam oyuna dahildir. Bu modul
 * butce, pazar, kota ve kullanici/karakter yonetimi panellerinin SUNUCU
 * tarafindaki toplama mantigini saglar. Tum uclar `admin:any` yetkisi ister
 * (bkz. auth/authorize.ts); istemci miktar otoritesi degildir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { marketQuote } from "../play/service";

export interface AdminOverview {
  accounts: number;
  characters: number;
  aliveCharacters: number;
  settlements: number;
  kingdoms: number;
  totalGold: number;
  properties: number;
  companies: number;
  auctionsOpen: number;
  gameDay: number;
  gameYear: number;
}

async function count(db: SqlDatabase, sql: string, ...params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: number }>(db, sql, ...params);
  return row?.n ?? 0;
}

/** Yonetim panosu ozeti (belge 20). */
export async function adminOverview(db: SqlDatabase): Promise<AdminOverview> {
  const [accounts, characters, alive, settlements, kingdoms, gold, properties, companies, auctions] = await Promise.all([
    count(db, "SELECT COUNT(*) AS n FROM accounts"),
    count(db, "SELECT COUNT(*) AS n FROM characters"),
    count(db, "SELECT COUNT(*) AS n FROM characters WHERE alive = 1"),
    count(db, "SELECT COUNT(*) AS n FROM settlements"),
    count(db, "SELECT COUNT(*) AS n FROM kingdoms"),
    count(db, "SELECT COALESCE(SUM(gold),0) AS n FROM character_state"),
    count(db, "SELECT COUNT(*) AS n FROM character_properties"),
    count(db, "SELECT COUNT(*) AS n FROM companies"),
    count(db, "SELECT COUNT(*) AS n FROM auctions WHERE settled = 0"),
  ]);
  const clock = await queryOne<{ game_day: number; game_year: number }>(db, "SELECT game_day, game_year FROM world_clock WHERE id = 1");
  return {
    accounts,
    characters,
    aliveCharacters: alive,
    settlements,
    kingdoms,
    totalGold: gold,
    properties,
    companies,
    auctionsOpen: auctions,
    gameDay: clock?.game_day ?? 1,
    gameYear: clock?.game_year ?? 1,
  };
}

export interface AdminCharacterRow {
  id: string;
  givenName: string;
  surname: string;
  accountId: string;
  alive: boolean;
  gold: number;
  reputation: number;
  currentSettlement: string | null;
}

/** Kullanici/karakter yonetimi listesi (belge 20). */
export async function adminCharacters(db: SqlDatabase, limit = 50): Promise<AdminCharacterRow[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await queryAll<{
    id: string;
    given_name: string;
    surname: string;
    account_id: string;
    alive: number;
    gold: number | null;
    reputation: number | null;
    current_settlement: string | null;
  }>(
    db,
    `SELECT c.id, c.given_name, c.surname, c.account_id, c.alive, s.gold, s.reputation, c.current_settlement
     FROM characters c LEFT JOIN character_state s ON s.character_id = c.id
     ORDER BY c.created_at DESC LIMIT ?`,
    safeLimit,
  );
  return rows.map((r) => ({
    id: r.id,
    givenName: r.given_name,
    surname: r.surname,
    accountId: r.account_id,
    alive: r.alive === 1,
    gold: r.gold ?? 0,
    reputation: r.reputation ?? 0,
    currentSettlement: r.current_settlement,
  }));
}

/** Karakter durumunu degistirir (canli/olu). Yalnizca yonetici. */
export async function adminSetCharacterStatus(
  db: SqlDatabase,
  characterId: string,
  status: "alive" | "dead",
  nowMs = Date.now(),
): Promise<{ ok: boolean; reason?: string }> {
  void nowMs;
  const existing = await queryOne<{ id: string }>(db, "SELECT id FROM characters WHERE id = ?", characterId);
  if (!existing) return { ok: false, reason: "not_found" };
  await execute(db, "UPDATE characters SET alive = ? WHERE id = ?", status === "alive" ? 1 : 0, characterId);
  return { ok: true };
}

export interface AdminEconomyRow {
  settlementId: string;
  itemId: string;
  supply: number;
  demand: number;
  price: number;
}

/** Pazar/ekonomi izleme: en yuksek arzli kalemler (belge 20). */
export async function adminEconomy(db: SqlDatabase, limit = 50): Promise<AdminEconomyRow[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await queryAll<{ settlement_id: string; item_id: string; supply: number; demand: number }>(
    db,
    "SELECT settlement_id, item_id, supply, demand FROM market_state ORDER BY supply DESC LIMIT ?",
    safeLimit,
  );
  return rows.map((r) => ({
    settlementId: r.settlement_id,
    itemId: r.item_id,
    supply: r.supply,
    demand: r.demand,
    price: marketQuote(r.item_id)?.base ?? 0,
  }));
}

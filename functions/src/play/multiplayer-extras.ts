/**
 * Cok oyunculu takas, ittifak ve krallik savaslari oynanis servisi
 * (tasarim belgesi 11, 16).
 *
 * Belge 16: "Sohbet, ozel mesaj, arkadaslik, gruplar, loncalar, PvP ve
 * ittifaklar" ile oyuncular arasi takas; belge 11: "ittifak, savas ve baris".
 *
 * Iki taraf onayli takas ve ittifak/savas kararlari SUNUCUDA dogrulanir;
 * istemci eşya veya altin otoritesi degildir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { loadState, saveState, type PlayResult } from "./service";
import { addItem, removeItem, itemDef, carryCapacity, type InventoryEntry } from "../inventory/items";
import { isMutual, type PlayerRelationship } from "../social/social";
import { KINGDOMS } from "../world/kingdoms";

async function gameDay(db: SqlDatabase): Promise<number> {
  const row = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return row?.game_day ?? 1;
}

function hasMount(inventory: InventoryEntry[]): boolean {
  return inventory.some((e) => e.itemId === "horse" || e.itemId === "mount");
}

interface TradeItem {
  itemId: string;
  quantity: number;
}

export interface TradeOfferView {
  id: string;
  fromId: string;
  toId: string;
  offerGold: number;
  offerItems: TradeItem[];
  requestGold: number;
  requestItems: TradeItem[];
  status: "pending" | "accepted" | "rejected" | "cancelled";
}

function parseItems(json: string): TradeItem[] {
  try {
    const parsed = JSON.parse(json) as TradeItem[];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.itemId === "string" && Number.isFinite(i.quantity)) : [];
  } catch {
    return [];
  }
}

export async function tradeOffers(db: SqlDatabase, characterId: string): Promise<TradeOfferView[]> {
  const rows = await queryAll<{
    id: string;
    from_id: string;
    to_id: string;
    offer_gold: number;
    offer_items_json: string;
    request_gold: number;
    request_items_json: string;
    status: TradeOfferView["status"];
  }>(
    db,
    "SELECT id, from_id, to_id, offer_gold, offer_items_json, request_gold, request_items_json, status FROM barter_offers WHERE (from_id = ? OR to_id = ?) AND status = 'pending' ORDER BY created_at DESC",
    characterId,
    characterId,
  );
  return rows.map((r) => ({
    id: r.id,
    fromId: r.from_id,
    toId: r.to_id,
    offerGold: r.offer_gold,
    offerItems: parseItems(r.offer_items_json),
    requestGold: r.request_gold,
    requestItems: parseItems(r.request_items_json),
    status: r.status,
  }));
}

/** Oyuncular arasi takas teklifi olusturur (belge 16). */
export async function performOfferTrade(
  db: SqlDatabase,
  characterId: string,
  toId: string,
  offerGold: number,
  offerItems: TradeItem[],
  requestGold: number,
  requestItems: TradeItem[],
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (toId === characterId) return { ok: false, error: "invalid_action", state, detail: { reason: "self_trade" } };
  const target = await queryOne<{ id: string }>(db, "SELECT id FROM characters WHERE id = ?", toId);
  if (!target) return { ok: false, error: "not_found", state, detail: { reason: "target_not_found" } };
  const giveGold = Math.max(0, Math.floor(offerGold));
  if (giveGold > state.gold) return { ok: false, error: "not_enough_gold", state, detail: { required: giveGold } };
  // Teklif edilen esyalar oyuncunun envanterinde olmali.
  for (const item of offerItems) {
    if (!itemDef(item.itemId) || item.quantity <= 0) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_item" } };
    const owned = state.inventory.filter((e) => e.itemId === item.itemId).reduce((s, e) => s + e.quantity, 0);
    if (owned < item.quantity) return { ok: false, error: "invalid_action", state, detail: { reason: "insufficient_item", itemId: item.itemId } };
  }
  const day = await gameDay(db);
  const id = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO barter_offers (id, from_id, to_id, offer_gold, offer_items_json, request_gold, request_items_json, status, created_game_day, created_at)
     VALUES (?,?,?,?,?,?,?, 'pending', ?, ?)`,
    id,
    characterId,
    toId,
    giveGold,
    JSON.stringify(offerItems),
    Math.max(0, Math.floor(requestGold)),
    JSON.stringify(requestItems),
    day,
    nowMs,
  );
  return { ok: true, state, detail: { offerId: id } };
}

/**
 * Takas teklifini kabul eder (belge 16): her iki tarafin da altin ve esyasi
 * dogrulanir; atomik olarak el degistirir. Yalnizca ALICI kabul edebilir.
 */
export async function performAcceptTrade(db: SqlDatabase, characterId: string, offerId: string, nowMs = Date.now()): Promise<PlayResult> {
  const acceptor = await loadState(db, characterId, nowMs);
  if (!acceptor) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{
    id: string;
    from_id: string;
    to_id: string;
    offer_gold: number;
    offer_items_json: string;
    request_gold: number;
    request_items_json: string;
    status: TradeOfferView["status"];
  }>(db, "SELECT * FROM barter_offers WHERE id = ?", offerId);
  if (!row) return { ok: false, error: "not_found", state: acceptor };
  if (row.status !== "pending") return { ok: false, error: "invalid_action", state: acceptor, detail: { reason: "not_pending" } };
  if (row.to_id !== characterId) return { ok: false, error: "forbidden", state: acceptor, detail: { reason: "not_recipient" } };
  const proposer = await loadState(db, row.from_id, nowMs);
  if (!proposer) return { ok: false, error: "not_found", state: acceptor };

  const offerItems = parseItems(row.offer_items_json);
  const requestItems = parseItems(row.request_items_json);

  // Kabul eden taraf istenen altin/esya'ya sahip mi?
  if (acceptor.gold < row.request_gold) return { ok: false, error: "not_enough_gold", state: acceptor, detail: { reason: "acceptor_gold" } };
  if (proposer.gold < row.offer_gold) return { ok: false, error: "invalid_action", state: acceptor, detail: { reason: "proposer_gold" } };
  for (const item of requestItems) {
    const owned = acceptor.inventory.filter((e) => e.itemId === item.itemId).reduce((s, e) => s + e.quantity, 0);
    if (owned < item.quantity) return { ok: false, error: "invalid_action", state: acceptor, detail: { reason: "acceptor_item", itemId: item.itemId } };
  }
  for (const item of offerItems) {
    const owned = proposer.inventory.filter((e) => e.itemId === item.itemId).reduce((s, e) => s + e.quantity, 0);
    if (owned < item.quantity) return { ok: false, error: "invalid_action", state: acceptor, detail: { reason: "proposer_item", itemId: item.itemId } };
  }

  // Altin el degistirir.
  proposer.gold = proposer.gold - row.offer_gold + row.request_gold;
  acceptor.gold = acceptor.gold - row.request_gold + row.offer_gold;

  // Esyalar el degistirir.
  const proposerInv = transferItems(proposer.inventory, offerItems, requestItems, proposer.strength, hasMount(proposer.inventory));
  if (!proposerInv.ok) return { ok: false, error: "invalid_action", state: acceptor, detail: { reason: "proposer_capacity" } };
  const acceptorInv = transferItems(acceptor.inventory, requestItems, offerItems, acceptor.strength, hasMount(acceptor.inventory));
  if (!acceptorInv.ok) return { ok: false, error: "invalid_action", state: acceptor, detail: { reason: "acceptor_capacity" } };
  proposer.inventory = proposerInv.entries;
  acceptor.inventory = acceptorInv.entries;

  await saveState(db, proposer, nowMs);
  await saveState(db, acceptor, nowMs);
  await execute(db, "UPDATE barter_offers SET status = 'accepted' WHERE id = ?", offerId);
  return { ok: true, state: acceptor, detail: { offerId } };
}

function transferItems(
  entries: InventoryEntry[],
  outgoing: TradeItem[],
  incoming: TradeItem[],
  strength: number,
  mount: boolean,
): { ok: true; entries: InventoryEntry[] } | { ok: false } {
  let next = entries.map((e) => ({ ...e }));
  const capacity = carryCapacity(strength, mount);
  for (const item of outgoing) {
    const removed = removeItem(next, item.itemId, item.quantity);
    if (!removed.ok || !removed.entries) return { ok: false };
    next = removed.entries;
  }
  for (const item of incoming) {
    const added = addItem(next, item.itemId, item.quantity, capacity, strength, mount);
    if (!added.ok || !added.entries) return { ok: false };
    next = added.entries;
  }
  return { ok: true, entries: next };
}

export async function performRejectTrade(db: SqlDatabase, characterId: string, offerId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{ from_id: string; to_id: string; status: string }>(
    db,
    "SELECT from_id, to_id, status FROM barter_offers WHERE id = ?",
    offerId,
  );
  if (!row) return { ok: false, error: "not_found", state };
  if (row.status !== "pending") return { ok: false, error: "invalid_action", state, detail: { reason: "not_pending" } };
  if (row.to_id !== characterId && row.from_id !== characterId) return { ok: false, error: "forbidden", state };
  // Alici reddeder; gonderen iptal eder.
  const status = row.to_id === characterId ? "rejected" : "cancelled";
  await execute(db, "UPDATE barter_offers SET status = ? WHERE id = ?", status, offerId);
  return { ok: true, state, detail: { offerId, status } };
}

// --- Arkadaslik karsiliklilik dogrulamasi (belge 16, isMutual baglantisi) ---

/**
 * Iki karakter arasinda KARSILIKLI arkadaslik var mi (belge 16.3). Kaynak,
 * oynanista yazilan `character_social` tablosudur; arkadaslik iki tarafta da
 * kayitli olmalidir (dusmanlik tek tarafli olabilir, arkadaslik olamaz).
 */
export async function areMutualFriends(db: SqlDatabase, aId: string, bId: string): Promise<boolean> {
  const rows = await queryAll<{ character_id: string; target_id: string; kind: string }>(
    db,
    "SELECT character_id, target_id, kind FROM character_social WHERE character_id IN (?, ?)",
    aId,
    bId,
  );
  const toRel = (r: { character_id: string; target_id: string; kind: string }): PlayerRelationship => ({
    fromCharacterId: r.character_id,
    toCharacterId: r.target_id,
    kind: r.kind as PlayerRelationship["kind"],
    affinity: 0,
  });
  const a = rows.filter((r) => r.character_id === aId).map(toRel);
  const b = rows.filter((r) => r.character_id === bId).map(toRel);
  return isMutual(a, b);
}

// --- Krallik ittifaki ve savas (belge 11) ---

export interface KingdomRelationView {
  fromKingdomId: string;
  toKingdomId: string;
  stance: "neutral" | "allied" | "war" | "truce";
  affinity: number;
  allianceUntil: number | null;
}

export async function kingdomRelations(db: SqlDatabase, kingdomId?: string): Promise<KingdomRelationView[]> {
  const rows = kingdomId
    ? await queryAll<{ from_kingdom_id: string; to_kingdom_id: string; stance: KingdomRelationView["stance"]; affinity: number; alliance_until: number | null }>(
        db,
        "SELECT * FROM kingdom_relations WHERE from_kingdom_id = ? OR to_kingdom_id = ? ORDER BY from_kingdom_id",
        kingdomId,
        kingdomId,
      )
    : await queryAll<{ from_kingdom_id: string; to_kingdom_id: string; stance: KingdomRelationView["stance"]; affinity: number; alliance_until: number | null }>(
        db,
        "SELECT * FROM kingdom_relations ORDER BY from_kingdom_id",
      );
  return rows.map((r) => ({
    fromKingdomId: r.from_kingdom_id,
    toKingdomId: r.to_kingdom_id,
    stance: r.stance,
    affinity: r.affinity,
    allianceUntil: r.alliance_until,
  }));
}

/** Ittifak kurar (belge 11): iki krallik arasinda savas/savunma pakti. */
export async function performFormAlliance(
  db: SqlDatabase,
  characterId: string,
  fromKingdomId: string,
  toKingdomId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (fromKingdomId === toKingdomId) return { ok: false, error: "invalid_action", state, detail: { reason: "same_kingdom" } };
  if (!KINGDOMS.some((k) => k.id === fromKingdomId) || !KINGDOMS.some((k) => k.id === toKingdomId)) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "unknown_kingdom" } };
  }
  const day = await gameDay(db);
  const until = day + 90;
  for (const [from, to] of [
    [fromKingdomId, toKingdomId],
    [toKingdomId, fromKingdomId],
  ] as const) {
    await execute(
      db,
      `INSERT INTO kingdom_relations (from_kingdom_id, to_kingdom_id, stance, affinity, alliance_until, updated_at)
       VALUES (?,?, 'allied', 60, ?, ?)
       ON CONFLICT(from_kingdom_id, to_kingdom_id) DO UPDATE SET stance='allied', affinity=60, alliance_until=excluded.alliance_until, updated_at=excluded.updated_at`,
      from,
      to,
      until,
      nowMs,
    );
  }
  return { ok: true, state, detail: { fromKingdomId, toKingdomId, until } };
}

/** Savas ilan eder (belge 11). */
export async function performDeclareWar(
  db: SqlDatabase,
  characterId: string,
  fromKingdomId: string,
  toKingdomId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (fromKingdomId === toKingdomId) return { ok: false, error: "invalid_action", state, detail: { reason: "same_kingdom" } };
  if (!KINGDOMS.some((k) => k.id === fromKingdomId) || !KINGDOMS.some((k) => k.id === toKingdomId)) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "unknown_kingdom" } };
  }
  for (const [from, to] of [
    [fromKingdomId, toKingdomId],
    [toKingdomId, fromKingdomId],
  ] as const) {
    await execute(
      db,
      `INSERT INTO kingdom_relations (from_kingdom_id, to_kingdom_id, stance, affinity, alliance_until, updated_at)
       VALUES (?,?, 'war', -80, NULL, ?)
       ON CONFLICT(from_kingdom_id, to_kingdom_id) DO UPDATE SET stance='war', affinity=-80, alliance_until=NULL, updated_at=excluded.updated_at`,
      from,
      to,
      nowMs,
    );
  }
  return { ok: true, state, detail: { fromKingdomId, toKingdomId } };
}

/** Baris yapar (belge 11): savas sona erer, ateskes kurulur. */
export async function performMakePeace(
  db: SqlDatabase,
  characterId: string,
  fromKingdomId: string,
  toKingdomId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  for (const [from, to] of [
    [fromKingdomId, toKingdomId],
    [toKingdomId, fromKingdomId],
  ] as const) {
    await execute(
      db,
      `INSERT INTO kingdom_relations (from_kingdom_id, to_kingdom_id, stance, affinity, alliance_until, updated_at)
       VALUES (?,?, 'truce', 0, NULL, ?)
       ON CONFLICT(from_kingdom_id, to_kingdom_id) DO UPDATE SET stance='truce', affinity=0, alliance_until=NULL, updated_at=excluded.updated_at`,
      from,
      to,
      nowMs,
    );
  }
  return { ok: true, state, detail: { fromKingdomId, toKingdomId } };
}

// --- Oyuncu ittifaklari (belge 16) ---

export interface AllianceView {
  id: string;
  name: string;
  leaderId: string;
  members: string[];
}

export async function performCreateAlliance(
  db: SqlDatabase,
  characterId: string,
  name: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_name" } };
  const existing = await queryOne<{ id: string }>(db, "SELECT id FROM player_alliances WHERE leader_id = ?", characterId);
  if (existing) return { ok: false, error: "invalid_action", state, detail: { reason: "already_leader" } };
  const id = crypto.randomUUID();
  await execute(db, "INSERT INTO player_alliances (id, name, leader_id, created_at) VALUES (?,?,?,?)", id, trimmed, characterId, nowMs);
  await execute(db, "INSERT INTO player_alliance_members (alliance_id, character_id, joined_at) VALUES (?,?,?)", id, characterId, nowMs);
  return { ok: true, state, detail: { allianceId: id } };
}

export async function performJoinAlliance(
  db: SqlDatabase,
  characterId: string,
  allianceId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const alliance = await queryOne<{ id: string }>(db, "SELECT id FROM player_alliances WHERE id = ?", allianceId);
  if (!alliance) return { ok: false, error: "not_found", state };
  const member = await queryOne<{ character_id: string }>(db, "SELECT character_id FROM player_alliance_members WHERE character_id = ?", characterId);
  if (member) return { ok: false, error: "invalid_action", state, detail: { reason: "already_in_alliance" } };
  const count = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM player_alliance_members WHERE alliance_id = ?", allianceId);
  if ((count?.n ?? 0) >= 20) return { ok: false, error: "invalid_action", state, detail: { reason: "alliance_full" } };
  await execute(db, "INSERT INTO player_alliance_members (alliance_id, character_id, joined_at) VALUES (?,?,?)", allianceId, characterId, nowMs);
  return { ok: true, state, detail: { allianceId } };
}

export async function allianceStatus(db: SqlDatabase, characterId: string): Promise<AllianceView | null> {
  const row = await queryOne<{ alliance_id: string }>(
    db,
    "SELECT alliance_id FROM player_alliance_members WHERE character_id = ?",
    characterId,
  );
  if (!row) return null;
  const alliance = await queryOne<{ id: string; name: string; leader_id: string }>(
    db,
    "SELECT id, name, leader_id FROM player_alliances WHERE id = ?",
    row.alliance_id,
  );
  if (!alliance) return null;
  const members = await queryAll<{ character_id: string }>(
    db,
    "SELECT character_id FROM player_alliance_members WHERE alliance_id = ? ORDER BY joined_at",
    row.alliance_id,
  );
  return { id: alliance.id, name: alliance.name, leaderId: alliance.leader_id, members: members.map((m) => m.character_id) };
}

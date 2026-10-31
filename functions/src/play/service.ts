/**
 * Oynanis servisi: E3-E6 modullerini kalici duruma baglar ve SUNUCUDA
 * dogrular (tasarim belgesi 21.1).
 *
 * Karakter durumu (saglik, envanter, altin) tek satirda JSON tutulur; boylece
 * D1 Free planinda sorgu sayisi dusuk kalir. Tum aksiyonlar karakterin KENDI
 * durumunu okur/yazar; istemciden gelen miktar dogrulanir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";
import { healthyState, advanceDay, advanceHunger, eat, rest, type HealthState } from "../health/state";
import { treatInjury, treatDisease } from "../health/treatment";
import { addItem, removeItem, type InventoryEntry, itemDef, carryCapacity } from "../inventory/items";
import { craft, recipeById, workIncome } from "../inventory/crafting";
import { planTravel, lodgingCost, type TravelConditions } from "../travel/travel";
import { explore, type ExplorationSite, EXPLORATION_SITES } from "../quests/system";
import { buyPrice, sellPrice, type MarketState } from "../economy/market";
import { SETTLEMENTS } from "../world/settlements";

export interface PlayState {
  characterId: string;
  health: HealthState;
  inventory: InventoryEntry[];
  gold: number;
  debts: number;
  reputation: number;
  weapon: string;
  weaponMastery: number;
  strength: number;
}

export type PlayError =
  | "character_not_found"
  | "not_enough_gold"
  | "invalid_action"
  | "no_such_recipe"
  | "unknown_item"
  | "dead";

export interface PlayResult {
  ok: boolean;
  error?: PlayError;
  state?: PlayState;
  detail?: Record<string, unknown>;
}

async function loadState(db: SqlDatabase, characterId: string, nowMs: number): Promise<PlayState | null> {
  const character = await queryOne<{ id: string; alive: number }>(
    db,
    "SELECT id, alive FROM characters WHERE id = ?",
    characterId,
  );
  if (!character) return null;

  const row = await queryOne<{
    health_json: string;
    inventory_json: string;
    gold: number;
    debts: number;
    reputation: number;
    weapon: string;
    weapon_mastery: number;
  }>(db, "SELECT * FROM character_state WHERE character_id = ?", characterId);

  if (!row) {
    const fresh: PlayState = {
      characterId,
      health: healthyState(),
      inventory: [
        { itemId: "bread", quantity: 3, condition: 1 },
        { itemId: "bandage", quantity: 2, condition: 1 },
      ],
      gold: 20,
      debts: 0,
      reputation: 0,
      weapon: "unarmed",
      weaponMastery: 0,
      strength: 8,
    };
    await saveState(db, fresh, nowMs);
    return fresh;
  }

  const attr = await queryOne<{ strength: number }>(
    db,
    "SELECT strength FROM character_attributes WHERE character_id = ?",
    characterId,
  );
  return {
    characterId,
    health: JSON.parse(row.health_json) as HealthState,
    inventory: JSON.parse(row.inventory_json) as InventoryEntry[],
    gold: row.gold,
    debts: row.debts,
    reputation: row.reputation,
    weapon: row.weapon,
    weaponMastery: row.weapon_mastery,
    strength: attr?.strength ?? 8,
  };
}

async function saveState(db: SqlDatabase, state: PlayState, nowMs: number): Promise<void> {
  await execute(
    db,
    `INSERT INTO character_state (character_id, health_json, inventory_json, gold, debts, reputation, weapon, weapon_mastery, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(character_id) DO UPDATE SET
       health_json=excluded.health_json, inventory_json=excluded.inventory_json, gold=excluded.gold,
       debts=excluded.debts, reputation=excluded.reputation, weapon=excluded.weapon,
       weapon_mastery=excluded.weapon_mastery, updated_at=excluded.updated_at`,
    state.characterId,
    JSON.stringify(state.health),
    JSON.stringify(state.inventory),
    state.gold,
    state.debts,
    state.reputation,
    state.weapon,
    state.weaponMastery,
    nowMs,
  );
}

export async function getPlayState(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayState | null> {
  return loadState(db, characterId, nowMs);
}

function hasMount(inventory: InventoryEntry[]): boolean {
  return inventory.some((e) => e.itemId === "pack-horse");
}

export async function performEat(db: SqlDatabase, characterId: string, itemId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };
  const def = itemDef(itemId);
  if (!def || def.category !== "food" || !def.nutrition) return { ok: false, error: "unknown_item" };
  const removed = removeItem(state.inventory, itemId, 1);
  if (!removed.ok) return { ok: false, error: "unknown_item" };
  state.inventory = removed.entries!;
  state.health = eat(state.health, def.nutrition);
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { nutrition: def.nutrition } };
}

export async function performRest(db: SqlDatabase, characterId: string, hours: number, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };
  const safeHours = Math.max(1, Math.min(12, Math.floor(hours)));
  state.health = rest(state.health, safeHours);
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { hours: safeHours } };
}

/** Bir oyun gunu ilerletir: aclik, saglik toparlanma, yara iyilesmesi. */
export async function advanceCharacterDay(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  state.health = advanceDay(advanceHunger(state.health, 1), 1);
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { alive: state.health.alive } };
}

export async function performTreat(
  db: SqlDatabase,
  characterId: string,
  injuryId: string,
  method: "bandage" | "herb" | "surgery" | "rest",
  quality: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const result = treatInjury(state.health, state.inventory, { injuryId, method, quality });
  if (!result.ok) return { ok: false, error: "invalid_action" };
  state.health = result.state!;
  state.inventory = result.entries!;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { permanent: result.permanent ?? false } };
}

export async function performTreatDisease(
  db: SqlDatabase,
  characterId: string,
  diseaseId: string,
  quality: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const result = treatDisease(state.health, state.inventory, diseaseId, quality);
  if (!result.ok) return { ok: false, error: "invalid_action" };
  state.health = result.state!;
  state.inventory = result.entries!;
  await saveState(db, state, nowMs);
  return { ok: true, state };
}

export async function performCraft(
  db: SqlDatabase,
  characterId: string,
  recipeId: string,
  roll = Math.random,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const recipe = recipeById(recipeId);
  if (!recipe) return { ok: false, error: "no_such_recipe" };
  const known = await knownExpertise(db, characterId);
  const result = craft(state.inventory, recipe, state.weaponMastery, known, roll());
  if (!result.ok) {
    if (result.entries) {
      state.inventory = result.entries;
      await saveState(db, state, nowMs);
    }
    return { ok: false, error: "invalid_action", state, detail: { reason: result.error } };
  }
  state.inventory = result.entries!;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { produced: result.produced } };
}

async function knownExpertise(db: SqlDatabase, characterId: string): Promise<string[]> {
  const rows = await db
    .prepare("SELECT expertise FROM character_expertise WHERE character_id = ?")
    .bind(characterId)
    .all<{ expertise: string }>();
  return rows.results.map((r) => r.expertise);
}

export async function performWork(db: SqlDatabase, characterId: string, profession: string, hours: number, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };
  const safeHours = Math.max(1, Math.min(12, Math.floor(hours)));
  const income = workIncome(profession, state.weaponMastery, safeHours);
  state.gold += income;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { income } };
}

export async function performTravel(
  db: SqlDatabase,
  characterId: string,
  toSettlementId: string,
  conditions: Omit<TravelConditions, "hasMount">,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };

  const character = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  const from = SETTLEMENTS.find((s) => s.id === character?.current_settlement);
  const to = SETTLEMENTS.find((s) => s.id === toSettlementId);
  if (!from || !to) return { ok: false, error: "invalid_action" };

  const plan = planTravel(from, to, { ...conditions, hasMount: hasMount(state.inventory) });
  if (plan.blocked) return { ok: false, error: "invalid_action", state, detail: { blocked: true } };

  await execute(db, "UPDATE characters SET current_settlement = ? WHERE id = ?", to.id, characterId);
  state.health = advanceDay(advanceHunger(state.health, Math.max(1, Math.ceil(plan.gameDays))), 1);
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { ...plan, to: to.id } };
}

export async function performExplore(
  db: SqlDatabase,
  characterId: string,
  site: ExplorationSite,
  preparedness: number,
  roll = Math.random,
  nowMs = Date.now(),
): Promise<PlayResult> {
  if (!EXPLORATION_SITES.includes(site)) return { ok: false, error: "invalid_action" };
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };

  const result = explore(site, preparedness, roll);
  const capacity = carryCapacity(state.strength, hasMount(state.inventory));
  for (const loot of result.items) {
    const added = addItem(state.inventory, loot.itemId, loot.quantity, capacity, state.strength, hasMount(state.inventory));
    if (added.ok) state.inventory = added.entries!;
  }
  state.gold += result.gold;
  if (result.injury) {
    state.health = {
      ...state.health,
      injuries: [
        ...state.health.injuries,
        {
          id: crypto.randomUUID(),
          kind: result.injury.kind,
          severity: result.injury.severity,
          bleeding: result.injury.bleeding,
          infection: 0,
          treated: false,
          occurredGameDay: 0,
        },
      ],
    };
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { site, gold: result.gold, items: result.items, injury: result.injury } };
}

/** Pazar islemi: fiyat SUNUCUDA hesaplanir; altin ve envanter dogrulanir. */
export async function performTrade(
  db: SqlDatabase,
  characterId: string,
  itemId: string,
  quantity: number,
  side: "buy" | "sell",
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const def = itemDef(itemId);
  if (!def) return { ok: false, error: "unknown_item" };
  const qty = Math.max(1, Math.floor(quantity));
  const market: MarketState = { itemId, settlementId: "local", supply: 20, demand: 20, baseValue: def.baseValue };
  const capacity = carryCapacity(state.strength, hasMount(state.inventory));

  if (side === "buy") {
    const cost = buyPrice(market) * qty;
    if (state.gold < cost) return { ok: false, error: "not_enough_gold" };
    const added = addItem(state.inventory, itemId, qty, capacity, state.strength, hasMount(state.inventory));
    if (!added.ok) return { ok: false, error: "invalid_action" };
    state.inventory = added.entries!;
    state.gold -= cost;
    await saveState(db, state, nowMs);
    return { ok: true, state, detail: { cost, price: buyPrice(market) } };
  }

  const removed = removeItem(state.inventory, itemId, qty);
  if (!removed.ok) return { ok: false, error: "invalid_action" };
  const gain = sellPrice(market) * qty;
  state.inventory = removed.entries!;
  state.gold += gain;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { gain, price: sellPrice(market) } };
}

export function marketQuote(itemId: string): { buy: number; sell: number; base: number } | null {
  const def = itemDef(itemId);
  if (!def) return null;
  const market: MarketState = { itemId, settlementId: "local", supply: 20, demand: 20, baseValue: def.baseValue };
  return { buy: buyPrice(market), sell: sellPrice(market), base: def.baseValue };
}

export function lodgingQuote(settlementKind: string, nights: number): number {
  return lodgingCost(settlementKind, nights);
}

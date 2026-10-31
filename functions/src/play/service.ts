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
import { healthyState, advanceDay, advanceHunger, eat, rest, addInjury, type HealthState } from "../health/state";
import { treatInjury, treatDisease, treatmentQuality } from "../health/treatment";
import { addItem, removeItem, type InventoryEntry, itemDef, carryCapacity } from "../inventory/items";
import { applyMarketTrade } from "./market-state";
import { decayInventory, storageFor, storageSummary } from "./storage";
import { settleDeath } from "./succession";
import { craft, recipeById, workIncome } from "../inventory/crafting";
import { planTravel, lodgingCost, type TravelConditions } from "../travel/travel";
import { explore, type ExplorationSite, EXPLORATION_SITES } from "../quests/system";
import { buyPrice, sellPrice, type MarketState } from "../economy/market";
import { SETTLEMENTS } from "../world/settlements";
import { KINGDOMS } from "../world/kingdoms";
import { ANIMALS, hunt as resolveHunt, plantCrop, tameAnimal, type AnimalId, type CropId, type Season, type Weather } from "../livelihood/production";
import { GUILDS, canLearnSpell, castSpell, isDarkMagicCrime, joinActivity, templeService, canJoinGuild, guildBenefits, type ActivityKind, type MagicPath, type TempleService } from "../magic/lore";
import { commitUnderworldAct, type UnderworldAction } from "../underworld/gangs";

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
  /** Buyu ustalik seviyesi (belge 13.1). */
  magicLevel: number;
  /** Buyu enerjisi (mana). */
  energy: number;
  /** Ogrenilmis buyu yollari. */
  magicPaths: MagicPath[];
  /** Yeralti itibari (belge 13.4). */
  underworldRep: number;
}

export type PlayError =
  | "character_not_found"
  | "not_enough_gold"
  | "invalid_action"
  | "no_such_recipe"
  | "unknown_item"
  | "not_found"
  | "forbidden"
  | "dead";

export interface PlayResult {
  ok: boolean;
  error?: PlayError;
  state?: PlayState;
  detail?: Record<string, unknown>;
}

export async function loadState(db: SqlDatabase, characterId: string, nowMs: number): Promise<PlayState | null> {
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
    magic_level: number;
    energy: number;
    magic_paths_json: string;
    underworld_rep: number;
    inventory_decay_day: number;
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
      magicLevel: 0,
      energy: 100,
      magicPaths: [],
      underworldRep: 0,
    };
    await saveState(db, fresh, nowMs);
    return fresh;
  }

  const attr = await queryOne<{ strength: number }>(
    db,
    "SELECT strength FROM character_attributes WHERE character_id = ?",
    characterId,
  );
  const strength = attr?.strength ?? 8;
  let inventory = JSON.parse(row.inventory_json) as InventoryEntry[];

  // Depolama/bozulma (belge 9.3): dunya gunu ilerlediyse gida ve ilac
  // bozulur. Ayni gun icin TEKRAR uygulanmaz (idempotent).
  const dayRow = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  const gameDay = dayRow?.game_day ?? 1;
  if (gameDay > (row.inventory_decay_day ?? 0)) {
    inventory = decayInventory(inventory, storageFor(strength, hasMount(inventory), false), gameDay - (row.inventory_decay_day ?? 0));
    await execute(
      db,
      "UPDATE character_state SET inventory_json = ?, inventory_decay_day = ? WHERE character_id = ?",
      JSON.stringify(inventory),
      gameDay,
      characterId,
    );
  }

  return {
    characterId,
    health: JSON.parse(row.health_json) as HealthState,
    inventory,
    gold: row.gold,
    debts: row.debts,
    reputation: row.reputation,
    weapon: row.weapon,
    weaponMastery: row.weapon_mastery,
    strength,
    magicLevel: row.magic_level ?? 0,
    energy: row.energy ?? 100,
    magicPaths: JSON.parse(row.magic_paths_json ?? "[]") as MagicPath[],
    underworldRep: row.underworld_rep ?? 0,
  };
}

export async function saveState(db: SqlDatabase, state: PlayState, nowMs: number): Promise<void> {
  await execute(
    db,
    `INSERT INTO character_state (character_id, health_json, inventory_json, gold, debts, reputation, weapon, weapon_mastery, magic_level, energy, magic_paths_json, underworld_rep, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(character_id) DO UPDATE SET
       health_json=excluded.health_json, inventory_json=excluded.inventory_json, gold=excluded.gold,
       debts=excluded.debts, reputation=excluded.reputation, weapon=excluded.weapon,
       weapon_mastery=excluded.weapon_mastery, magic_level=excluded.magic_level, energy=excluded.energy,
       magic_paths_json=excluded.magic_paths_json, underworld_rep=excluded.underworld_rep,
       updated_at=excluded.updated_at`,
    state.characterId,
    JSON.stringify(state.health),
    JSON.stringify(state.inventory),
    state.gold,
    state.debts,
    state.reputation,
    state.weapon,
    state.weaponMastery,
    state.magicLevel,
    state.energy,
    JSON.stringify(state.magicPaths),
    state.underworldRep,
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
  const wasAlive = state.health.alive;
  state.health = advanceDay(advanceHunger(state.health, 1), 1);
  await saveState(db, state, nowMs);
  // Olum kalicidir; miras ve kusak devri islenir (belge 7.6).
  let succession: Awaited<ReturnType<typeof settleDeath>> = null;
  if (wasAlive && !state.health.alive) {
    const day = await gameDayNumber(db);
    succession = await settleDeath(db, characterId, "Karakter hayatini kaybetti.", day);
  }
  return { ok: true, state, detail: { alive: state.health.alive, succession } };
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
  // Tedavi kalitesi (belge 6.5): sifaci becerisi + malzeme + temiz ortam.
  // Girdi beceridir; malzeme envanterden, ortam yerlesimden SUNUCUDA belirlenir.
  const supplies = state.inventory.some((e) => e.itemId === "healing-herb" && e.quantity > 0);
  const settlementId = (await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  ))?.current_settlement;
  const kind = SETTLEMENTS.find((s) => s.id === settlementId)?.kind ?? "village";
  const cleanEnvironment = kind === "capital" || kind === "city";
  const effectiveQuality = treatmentQuality(quality, supplies, cleanEnvironment);
  const result = treatInjury(state.health, state.inventory, { injuryId, method, quality: effectiveQuality });
  if (!result.ok) return { ok: false, error: "invalid_action" };
  state.health = result.state!;
  state.inventory = result.entries!;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { permanent: result.permanent ?? false, quality: effectiveQuality } };
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
  // Tedavi kalitesi SUNUCUDA belirlenir (malzeme + yerlesim ortami).
  const supplies = state.inventory.some((e) => e.itemId === "healing-herb" && e.quantity > 0);
  const settlementId = (await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  ))?.current_settlement;
  const kind = SETTLEMENTS.find((s) => s.id === settlementId)?.kind ?? "village";
  const effectiveQuality = treatmentQuality(quality, supplies, kind === "capital" || kind === "city");
  const result = treatDisease(state.health, state.inventory, diseaseId, effectiveQuality);
  if (!result.ok) return { ok: false, error: "invalid_action" };
  state.health = result.state!;
  state.inventory = result.entries!;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { quality: effectiveQuality } };
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
  // Lonca uyeligi (belge 14.4): kidem arttikca calisma kazanci artar.
  const guildRow = await queryOne<{ guild_id: string; joined_at: number }>(
    db,
    "SELECT guild_id, joined_at FROM character_guilds WHERE character_id = ?",
    characterId,
  );
  let bonus = 0;
  if (guildRow) {
    const memberDays = Math.max(0, Math.floor((nowMs - guildRow.joined_at) / 86_400_000));
    bonus = guildBenefits(guildRow.guild_id, memberDays).workBonus;
  }
  const base = workIncome(profession, state.weaponMastery, safeHours);
  const income = Math.round(base * (1 + bonus));
  state.gold += income;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { income, guildBonus: bonus } };
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
  const wasAlive = state.health.alive;
  state.health = advanceDay(advanceHunger(state.health, Math.max(1, Math.ceil(plan.gameDays))), 1);
  await saveState(db, state, nowMs);
  // Yolda olum: miras islenir (belge 7.6).
  if (wasAlive && !state.health.alive) {
    await settleDeath(db, characterId, "Yolculukta hayatini kaybetti.", await gameDayNumber(db));
  }
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
    state.health = addInjury(state.health, {
      id: crypto.randomUUID(),
      kind: result.injury.kind,
      severity: result.injury.severity,
      bleeding: result.injury.bleeding,
      infection: 0,
      treated: false,
      occurredGameDay: 0,
    });
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
  const capacity = carryCapacity(state.strength, hasMount(state.inventory));

  // Fiyat SUNUCUDA, yerlesimin guncel arz/talep ve bozulma carpaniyla hesaplanir
  // (belge 9.2, 9.4). Islem pazari kalici olarak gunceller.
  const settlement = await currentSettlement(db, characterId);
  const day = await gameDayNumber(db);
  const trade = settlement
    ? await applyMarketTrade(db, settlement, itemId, qty, side, day)
    : null;
  const market: MarketState = { itemId, settlementId: settlement ?? "local", supply: 20, demand: 20, baseValue: def.baseValue };
  const unitPrice = trade?.unitPrice ?? (side === "buy" ? buyPrice(market) : sellPrice(market));

  if (side === "buy") {
    const cost = unitPrice * qty;
    if (state.gold < cost) return { ok: false, error: "not_enough_gold" };
    // Depolama kapasitesi (belge 9.3): agirlik disinda birim bazli sinir vardir.
    const storage = await storageSummary(db, characterId, state.inventory, state.strength, hasMount(state.inventory));
    if (storage.used + qty > storage.capacity) {
      return { ok: false, error: "invalid_action", state, detail: { reason: "storage_full", used: storage.used, capacity: storage.capacity } };
    }
    const added = addItem(state.inventory, itemId, qty, capacity, state.strength, hasMount(state.inventory));
    if (!added.ok) return { ok: false, error: "invalid_action", detail: { reason: "over_capacity" } };
    state.inventory = added.entries!;
    state.gold -= cost;
    await saveState(db, state, nowMs);
    return { ok: true, state, detail: { cost, price: unitPrice, storageUsed: storage.used + qty, storageCapacity: storage.capacity } };
  }

  const removed = removeItem(state.inventory, itemId, qty);
  if (!removed.ok) return { ok: false, error: "invalid_action" };
  const gain = unitPrice * qty;
  state.inventory = removed.entries!;
  state.gold += gain;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { gain, price: unitPrice } };
}

/** Taban fiyat teklifi (yerlesim baglami olmadan). */
export function marketQuote(itemId: string): { buy: number; sell: number; base: number } | null {
  const def = itemDef(itemId);
  if (!def) return null;
  const market: MarketState = { itemId, settlementId: "local", supply: 20, demand: 20, baseValue: def.baseValue };
  return { buy: buyPrice(market), sell: sellPrice(market), base: def.baseValue };
}

async function currentSettlement(db: SqlDatabase, characterId: string): Promise<string | null> {
  const row = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  return row?.current_settlement ?? null;
}

async function gameDayNumber(db: SqlDatabase): Promise<number> {
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return clock?.game_day ?? 1;
}

export function lodgingQuote(settlementKind: string, nights: number): number {
  return lodgingCost(settlementKind, nights);
}

// --- Tarim, avcilik ve hayvancilik (E8, belge 12.3, 12.7) ---

/** Ekim: mevsim/hava/toprak SUNUCUDA; tarla kalici duruma yazilir. */
export async function performPlant(
  db: SqlDatabase,
  characterId: string,
  crop: CropId,
  season: Season,
  weather: Weather,
  soilQuality = 1,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const character = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  const existing = await queryOne<{ ready_day: number; harvested: number }>(
    db,
    "SELECT ready_day, harvested FROM character_farm WHERE character_id = ?",
    characterId,
  );
  if (existing && existing.harvested === 0) return { ok: false, error: "invalid_action", detail: { reason: "farm_busy" } };

  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  const gameDay = clock?.game_day ?? 1;
  const result = plantCrop({ crop, season, weather, soilQuality, expertise: state.weaponMastery });
  if (!result.ok) return { ok: false, error: "invalid_action", detail: { reason: result.reason } };

  await execute(
    db,
    `INSERT INTO character_farm (character_id, crop, settlement_id, planted_day, ready_day, expected_yield, harvested, updated_at)
     VALUES (?,?,?,?,?,?,0,?)
     ON CONFLICT(character_id) DO UPDATE SET
       crop=excluded.crop, settlement_id=excluded.settlement_id, planted_day=excluded.planted_day,
       ready_day=excluded.ready_day, expected_yield=excluded.expected_yield, harvested=0,
       updated_at=excluded.updated_at`,
    characterId,
    crop,
    character?.current_settlement ?? null,
    gameDay,
    gameDay + result.growDays,
    result.yieldAmount,
    nowMs,
  );
  return { ok: true, state, detail: { crop, yield: result.yieldAmount, readyDay: gameDay + result.growDays } };
}

/** Hasat: yalnizca hazir oldugunda ve bir kez. Urun envantere eklenir. */
export async function performHarvest(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const farm = await queryOne<{ crop: string; ready_day: number; expected_yield: number; harvested: number }>(
    db,
    "SELECT crop, ready_day, expected_yield, harvested FROM character_farm WHERE character_id = ?",
    characterId,
  );
  if (!farm || farm.harvested === 1) return { ok: false, error: "invalid_action", detail: { reason: "no_farm" } };
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  if ((clock?.game_day ?? 1) < farm.ready_day) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "not_ready", readyDay: farm.ready_day } };
  }
  const itemId = farm.crop === "wheat" || farm.crop === "barley" ? "bread" : "dried-meat";
  const capacity = carryCapacity(state.strength, hasMount(state.inventory));
  const added = addItem(state.inventory, itemId, farm.expected_yield, capacity, state.strength, hasMount(state.inventory));
  if (!added.ok) return { ok: false, error: "invalid_action", detail: { reason: "no_space" } };
  state.inventory = added.entries!;
  await execute(db, "UPDATE character_farm SET harvested = 1, updated_at = ? WHERE character_id = ?", nowMs, characterId);
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { itemId, quantity: farm.expected_yield } };
}

/** Av: ganimet ve yaralanma SUNUCUDA hesaplanir (belge 12.3). */
export async function performHunt(
  db: SqlDatabase,
  characterId: string,
  animal: AnimalId,
  preparedness = 30,
  roll = Math.random,
  nowMs = Date.now(),
): Promise<PlayResult> {
  if (!ANIMALS.some((a) => a.id === animal)) return { ok: false, error: "invalid_action" };
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };
  const result = resolveHunt(animal, preparedness, state.weaponMastery, roll);
  if (result.success) {
    const capacity = carryCapacity(state.strength, hasMount(state.inventory));
    for (const loot of result.loot) {
      const added = addItem(state.inventory, loot.itemId, loot.quantity, capacity, state.strength, hasMount(state.inventory));
      if (added.ok) state.inventory = added.entries!;
    }
  }
  if (result.injury) {
    state.health = addInjury(state.health, {
      id: crypto.randomUUID(),
      kind: result.injury.kind,
      severity: result.injury.severity,
      bleeding: Math.round(result.injury.severity / 10),
      infection: 0,
      treated: false,
      occurredGameDay: 0,
    });
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { animal, success: result.success, loot: result.loot, injury: result.injury } };
}

/** Evcillestirme: yem envanterden dusulur, hayvan kayda gecer (belge 12.3). */
export async function performTame(
  db: SqlDatabase,
  characterId: string,
  animal: AnimalId,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const hasFeed = state.inventory.some((e) => e.itemId === "bread" || e.itemId === "dried-meat");
  const check = tameAnimal(animal, state.weaponMastery, hasFeed);
  if (!check.ok) return { ok: false, error: "invalid_action", state, detail: { reason: check.reason } };
  const removed = removeItem(state.inventory, "dried-meat", 1);
  if (removed.ok) state.inventory = removed.entries!;
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  await execute(
    db,
    "INSERT INTO character_livestock (id, character_id, animal, acquired_day, fed, updated_at) VALUES (?,?,?,?,1,?)",
    crypto.randomUUID(),
    characterId,
    animal,
    clock?.game_day ?? 1,
    nowMs,
  );
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { animal } };
}

// --- Buyu, tapinak, lonca ve sehir yasami (E8, belge 13, 15) ---

/** Buyu ogrenme: kaynak, seviye ve krallik yasagi SUNUCUDA dogrulanir. */
export async function performLearnSpell(
  db: SqlDatabase,
  characterId: string,
  path: MagicPath,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const character = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  const settlement = SETTLEMENTS.find((s) => s.id === character?.current_settlement);
  const kingdomId = settlement?.kingdomId ?? "";
  const hasBook = state.inventory.some((e) => e.itemId === "tome-of-medicine");
  const hasMaster = Boolean(kingdomId && KINGDOMS.some((k) => k.id === kingdomId && k.resources.includes("Büyü bilgisi")));
  const check = canLearnSpell(path, state.magicLevel, kingdomId, hasBook, hasMaster);
  if (!check.ok) return { ok: false, error: "invalid_action", state, detail: { reason: check.reason } };
  if (state.magicPaths.includes(path)) return { ok: false, error: "invalid_action", state, detail: { reason: "already_known" } };
  state.magicPaths = [...state.magicPaths, path];
  state.magicLevel += 1;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { path, magicLevel: state.magicLevel } };
}

/** Buyu kullanma: enerji duser; sifa buyusu saglik/yaralari iyilestirir. */
export async function performCastSpell(
  db: SqlDatabase,
  characterId: string,
  spellId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const result = castSpell(spellId, state.magicLevel, state.energy);
  if (!result.ok) return { ok: false, error: "invalid_action", state, detail: { reason: result.reason } };
  state.energy -= result.cost;
  if (result.heals) {
    state.health = {
      ...state.health,
      health: Math.min(100, state.health.health + result.power),
      injuries: state.health.injuries.map((inj) => (inj.bleeding > 0 ? { ...inj, bleeding: Math.max(0, inj.bleeding - 2) } : inj)),
    };
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { spellId, power: result.power, cost: result.cost } };
}

/** Karanlik sanat kullanimi krallikta suc sayilirsa kayda gecilir (belge 13.1). */
export async function recordDarkMagicCrime(db: SqlDatabase, characterId: string, path: MagicPath): Promise<boolean> {
  const character = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  const settlement = SETTLEMENTS.find((s) => s.id === character?.current_settlement);
  return settlement ? isDarkMagicCrime(path, settlement.kingdomId) : false;
}

/** Tapinak hizmeti: ucret dusulur, etki uygulanir (belge 13.2). */
export async function performTempleService(
  db: SqlDatabase,
  characterId: string,
  service: TempleService,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const check = templeService(service, state.gold);
  if (!check.ok) return { ok: false, error: check.reason === "not_enough_gold" ? "not_enough_gold" : "invalid_action" };
  state.gold -= check.cost;
  if (service === "healing") {
    state.health = { ...state.health, health: Math.min(100, state.health.health + check.effect) };
  } else if (service === "protection") {
    state.reputation += check.effect;
  } else if (service === "knowledge") {
    state.weaponMastery += check.effect;
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { service, cost: check.cost } };
}

/** Lonca katilimi: aidat dusulur, uyelik kaydi olusur (belge 13.3). */
export async function performJoinGuild(
  db: SqlDatabase,
  characterId: string,
  guildId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const check = canJoinGuild(guildId, state.weaponMastery, state.gold, state.reputation);
  if (!check.ok) return { ok: false, error: check.reason === "cannot_afford_dues" ? "not_enough_gold" : "invalid_action", state, detail: { reason: check.reason } };
  const guild = GUILDS.find((g) => g.id === guildId)!;
  state.gold -= guild.dues;
  state.reputation += 2;
  await execute(
    db,
    "INSERT OR IGNORE INTO character_expertise (character_id, expertise, level) VALUES (?,?,?)",
    characterId,
    guild.profession,
    1,
  ).catch(() => undefined);
  // Lonca uyeligi kalici: lonca sohbet kanali erisimi bu kayda baglidir (belge 16.2).
  await execute(
    db,
    "INSERT INTO character_guilds (character_id, guild_id, joined_at) VALUES (?,?,?) ON CONFLICT(character_id) DO UPDATE SET guild_id=excluded.guild_id, joined_at=excluded.joined_at",
    characterId,
    guildId,
    nowMs,
  ).catch(() => undefined);
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { guildId, dues: guild.dues } };
}

/** Sehir etkinligi: kazanc/itibar SUNUCUDA; sans kumar/turnuvada (belge 15). */
export async function performActivity(
  db: SqlDatabase,
  characterId: string,
  kind: ActivityKind,
  roll = Math.random,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const result = joinActivity(kind, state.gold, roll);
  if (!result.ok) return { ok: false, error: "not_enough_gold", state, detail: { reason: result.reason } };
  state.gold = Math.max(0, state.gold + result.goldDelta);
  state.reputation += result.reputationDelta;
  state.weaponMastery += result.xp;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { kind, goldDelta: result.goldDelta, reputationDelta: result.reputationDelta, xp: result.xp } };
}

// --- Yeralti ve suc orgutleri (E8, belge 13.4) ---

/** Yeralti eylemi: getiri, yakalanma ve suc kaydi SUNUCUDA (belge 13.4). */
export async function performUnderworldAct(
  db: SqlDatabase,
  characterId: string,
  action: UnderworldAction,
  settlementSecurity = 50,
  gangAffiliation = false,
  roll = Math.random,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const result = commitUnderworldAct(action, state.weaponMastery, settlementSecurity, gangAffiliation, roll);
  if (!result.ok) return { ok: false, error: "invalid_action" };
  state.gold += result.reward;
  state.reputation += result.reputationDelta;
  state.underworldRep += result.success ? 3 : 1;
  await saveState(db, state, nowMs);
  if (result.caught) {
    await execute(
      db,
      `INSERT INTO world_event_log (id, event_type, settlement_id, severity, payload_json, game_day, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      crypto.randomUUID(),
      "crime",
      null,
      result.crimeSeverity,
      JSON.stringify({ characterId, action, caught: true }),
      0,
      nowMs,
    );
  }
  return {
    ok: true,
    state,
    detail: { action, success: result.success, reward: result.reward, caught: result.caught, crimeSeverity: result.crimeSeverity },
  };
}

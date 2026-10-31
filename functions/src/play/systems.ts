/**
 * Askeri, ekonomi, adalet, sosyal ve siyasi oynanis servisleri
 * (tasarim belgesi 7, 9, 10, 11, 13, 14, 16, 20).
 *
 * Kural: Belge 20'ye gore bir sistem yalnizca modul olarak var olamaz;
 * arayuz, veritabani ve sunucu dogrulamasi birbirine bagli olmalidir. Bu
 * dosya ilgili modulleri KALICI karakter durumuna baglar. Tum sonuclar
 * (kazanc, kayip, yaralanma, yakalanma) SUNUCUDA hesaplanir; istemciden
 * gelen miktar yalnizca girdi olarak dogrulanir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne, queryAll } from "../db/client";
import { loadState, saveState, type PlayResult } from "./service";
import {
  resolveBattle,
  resolveSiege,
  resolveNavalBattle,
  applyDiplomacy,
  stanceFor,
  type Army,
  type UnitType,
  type ShipClass,
  type Fleet,
  type Relation,
} from "../military/army";
import { canIssueLoan, accrueInterest, taxDue, type Loan } from "../economy/market";
import { businessIncome, propertyTax, type PropertyType } from "../economy/property";
import { arrestChance, sentence, attemptEscape, escapeChance, CRIME_SEVERITY, type CrimeType, type Crime, type LegalProfile } from "../justice/system";
import { resolveCombat, canDuel, type CombatantStats, type Terrain, TERRAIN_BONUS } from "../combat/resolve";
import { SETTLEMENTS } from "../world/settlements";
import { KINGDOMS } from "../world/kingdoms";
import {
  RANKS,
  appoint,
  promote,
  demote,
  isVacant,
  resolvePowerStruggle,
  type Government,
  type Position,
  type Rank,
} from "../politics/government";
import { settlementProfile } from "../world/settlement-profile";
import { emptyAttributes } from "../character/attributes";

// --- Yardimcilar ---

async function currentSettlement(db: SqlDatabase, characterId: string): Promise<string | null> {
  const row = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  return row?.current_settlement ?? null;
}

async function gameDay(db: SqlDatabase): Promise<number> {
  const clock = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return clock?.game_day ?? 1;
}

function settlementSecurity(settlementId: string | null): number {
  if (!settlementId) return 50;
  return settlementProfile(settlementId)?.security ?? 50;
}

// --- Askeri birlikler ve savas (belge 14.5) ---

export interface UnitView {
  id: string;
  unitType: UnitType;
  strength: number;
  morale: number;
  supply: number;
  experience: number;
}

export async function listUnits(db: SqlDatabase, characterId: string): Promise<UnitView[]> {
  const rows = await queryAll<{ id: string; unit_type: string; strength: number; morale: number; supply: number; experience: number }>(
    db,
    "SELECT id, unit_type, strength, morale, supply, experience FROM character_units WHERE character_id = ? ORDER BY unit_type",
    characterId,
  );
  return rows.map((r) => ({
    id: r.id,
    unitType: r.unit_type as UnitType,
    strength: r.strength,
    morale: r.morale,
    supply: r.supply,
    experience: r.experience,
  }));
}

const UNIT_RECRUIT_COST: Record<UnitType, number> = {
  infantry: 5,
  cavalry: 12,
  archer: 7,
  siege: 20,
  naval: 15,
};

/** Birlik toplama: maliyet ve asker sayisi SUNUCUDA; altin dogrulanir. */
export async function performRecruit(
  db: SqlDatabase,
  characterId: string,
  unitType: UnitType,
  strength: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!(unitType in UNIT_RECRUIT_COST)) return { ok: false, error: "invalid_action" };
  const troops = Math.max(1, Math.min(1000, Math.floor(strength)));
  const cost = UNIT_RECRUIT_COST[unitType] * troops;
  if (state.gold < cost) return { ok: false, error: "not_enough_gold", state, detail: { cost } };

  const existing = await queryOne<{ id: string; strength: number }>(
    db,
    "SELECT id, strength FROM character_units WHERE character_id = ? AND unit_type = ?",
    characterId,
    unitType,
  );
  if (existing) {
    await execute(db, "UPDATE character_units SET strength = strength + ?, updated_at = ? WHERE id = ?", troops, nowMs, existing.id);
  } else {
    await execute(
      db,
      `INSERT INTO character_units (id, character_id, unit_type, strength, morale, supply, experience, updated_at)
       VALUES (?,?,?,?,100,100,0,?)`,
      crypto.randomUUID(),
      characterId,
      unitType,
      troops,
      nowMs,
    );
  }
  state.gold -= cost;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { unitType, troops, cost } };
}

/** Ikmal: birlik erzak/moral yenilenir; altin harcanir. */
export async function performResupply(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const units = await queryAll<{ id: string; strength: number }>(
    db,
    "SELECT id, strength FROM character_units WHERE character_id = ?",
    characterId,
  );
  if (units.length === 0) return { ok: false, error: "invalid_action", detail: { reason: "no_units" } };
  const total = units.reduce((s, u) => s + u.strength, 0);
  const cost = Math.round(total * 0.5);
  if (state.gold < cost) return { ok: false, error: "not_enough_gold", state, detail: { cost } };
  for (const u of units) {
    await execute(db, "UPDATE character_units SET supply = 100, morale = 100, updated_at = ? WHERE id = ?", nowMs, u.id);
  }
  state.gold -= cost;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { cost, resupplied: units.length } };
}

/**
 * Savas tatbikati: karakterin birlikleri, ayni yerlesimdeki kurgusal savunmaya
 * karsi dener. Sonuc SUNUCUDA cozulur; kayiplar kalici duruma yazilir.
 */
export async function performBattle(
  db: SqlDatabase,
  characterId: string,
  terrain: Terrain = "open",
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };

  const units = await listUnits(db, characterId);
  if (units.length === 0) return { ok: false, error: "invalid_action", detail: { reason: "no_units" } };

  const settlement = await currentSettlement(db, characterId);
  const security = settlementSecurity(settlement);
  const commanderSkill = Math.min(100, state.weaponMastery * 5 + state.strength);

  const attacker: Army = {
    id: "player",
    kingdomId: "player",
    commanderSkill,
    units: units.map((u) => ({ id: u.id, type: u.unitType, strength: u.strength, morale: u.morale, supply: u.supply, experience: u.experience })),
    location: settlement ?? "unknown",
  };
  const defenderStrength = Math.round(units.reduce((s, u) => s + u.strength, 0) * (0.6 + security / 200));
  const defender: Army = {
    id: "garrison",
    kingdomId: "local",
    commanderSkill: Math.round(security / 2),
    units: [
      { id: "g1", type: "infantry", strength: defenderStrength, morale: 80, supply: 80, experience: 30 },
      { id: "g2", type: "archer", strength: Math.round(defenderStrength * 0.3), morale: 80, supply: 80, experience: 30 },
    ],
    location: settlement ?? "unknown",
  };

  const outcome = resolveBattle(attacker, defender, TERRAIN_BONUS[terrain], Math.random);

  // Kayiplar kalici: birlik gucleri guncellenir, sifirlananlar silinir.
  const totalAttackerStrength = Math.max(1, attacker.units.reduce((s, x) => s + x.strength, 0));
  for (const u of units) {
    const losses = Math.round(outcome.attackerLosses * (u.strength / totalAttackerStrength));
    const remaining = Math.max(0, u.strength - losses);
    if (remaining === 0) {
      await execute(db, "DELETE FROM character_units WHERE id = ?", u.id);
    } else {
      await execute(db, "UPDATE character_units SET strength = ?, morale = MAX(0, morale - 10), updated_at = ? WHERE id = ?", remaining, nowMs, u.id);
    }
  }

  await execute(
    db,
    `INSERT INTO battles (id, attacker_id, defender_id, location_id, battle_type, started_at, resolved_at, outcome)
     VALUES (?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(),
    characterId,
    "garrison",
    settlement ?? "unknown",
    "field",
    nowMs,
    nowMs,
    outcome.winner === "attacker" ? "attacker_win" : outcome.winner === "defender" ? "defender_win" : "draw",
  );

  // Zafer ganimeti (sunucu hesaplar).
  let spoils = 0;
  if (outcome.winner === "attacker") {
    spoils = Math.round(outcome.defenderLosses * 0.4);
    state.gold += spoils;
    state.reputation += 3;
  } else if (outcome.winner === "defender") {
    state.health = { ...state.health, health: Math.max(1, state.health.health - 15) };
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { outcome, spoils, terrain } };
}

/** Kusatma cozumleme (belge 11). Savunma parametreleri sunucuda dogrulanir. */
export async function performSiege(
  db: SqlDatabase,
  characterId: string,
  siegeEngines: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const units = await listUnits(db, characterId);
  if (units.length === 0) return { ok: false, error: "invalid_action", detail: { reason: "no_units" } };

  const settlement = await currentSettlement(db, characterId);
  const security = settlementSecurity(settlement);
  const engines = Math.max(1, Math.min(50, Math.floor(siegeEngines)));
  const result = resolveSiege({
    fortressDefense: security,
    wallIntegrity: 100,
    garrisonFood: 60,
    siegeEngines: engines,
    besiegerSupply: 100,
  });

  if (result.breached || result.surrendered) {
    state.gold += 200;
    state.reputation += 5;
    await saveState(db, state, nowMs);
  }
  await execute(
    db,
    `INSERT INTO battles (id, attacker_id, defender_id, location_id, battle_type, started_at, resolved_at, outcome)
     VALUES (?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(),
    characterId,
    "fortress",
    settlement ?? "unknown",
    "siege",
    nowMs,
    nowMs,
    result.surrendered ? "attacker_win" : result.breached ? "attacker_win" : "defender_win",
  );
  return { ok: true, state, detail: { ...result, siegeEngines: engines } };
}

// --- Filo ve deniz savasi (belge 11) ---

const SHIP_BUILD_COST: Record<ShipClass, number> = { galley: 400, longship: 250, caravel: 350, flagship: 900 };

export interface ShipView {
  id: string;
  shipClass: ShipClass;
  condition: number;
}

export async function listShips(db: SqlDatabase, characterId: string): Promise<ShipView[]> {
  const rows = await queryAll<{ id: string; ship_class: string; condition: number }>(
    db,
    "SELECT id, ship_class, condition FROM character_ships WHERE character_id = ? ORDER BY ship_class",
    characterId,
  );
  return rows.map((r) => ({ id: r.id, shipClass: r.ship_class as ShipClass, condition: r.condition }));
}

export async function performBuildShip(db: SqlDatabase, characterId: string, shipClass: ShipClass, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!(shipClass in SHIP_BUILD_COST)) return { ok: false, error: "invalid_action" };
  const cost = SHIP_BUILD_COST[shipClass];
  if (state.gold < cost) return { ok: false, error: "not_enough_gold", state, detail: { cost } };
  await execute(
    db,
    "INSERT INTO character_ships (id, character_id, ship_class, condition, updated_at) VALUES (?,?,?,100,?)",
    crypto.randomUUID(),
    characterId,
    shipClass,
    nowMs,
  );
  state.gold -= cost;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { shipClass, cost } };
}

/** Deniz savasi: karakterin filosu kurgusal korsana karsi (sunucuda cozulur). */
export async function performNavalBattle(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const ships = await listShips(db, characterId);
  if (ships.length === 0) return { ok: false, error: "invalid_action", detail: { reason: "no_ships" } };

  const attacker: Fleet = { id: "player", kingdomId: "player", ships: ships.map((s) => ({ class: s.shipClass, condition: s.condition })) };
  const defender: Fleet = {
    id: "corsair",
    kingdomId: "pirate",
    ships: [{ class: "galley", condition: 80 }, { class: "longship", condition: 70 }],
  };
  const outcome = resolveNavalBattle(attacker, defender, Math.random);

  // Batan gemiler silinir; kalanlarin durumu duser.
  const lostCount = outcome.attackerLosses;
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]!;
    if (i < lostCount) {
      await execute(db, "DELETE FROM character_ships WHERE id = ?", s.id);
    } else {
      await execute(db, "UPDATE character_ships SET condition = MAX(0, condition - 15), updated_at = ? WHERE id = ?", nowMs, s.id);
    }
  }
  let spoils = 0;
  if (outcome.winner === "attacker") {
    spoils = Math.round(outcome.defenderLosses * 120);
    state.gold += spoils;
    state.reputation += 4;
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { outcome, spoils, shipsLost: lostCount } };
}

// --- Bankacilik (belge 9.6) ---

export async function performTakeLoan(
  db: SqlDatabase,
  characterId: string,
  amount: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const principal = Math.max(10, Math.min(10000, Math.floor(amount)));
  const bankReserves = 100000;
  // Teminat: karakterin altini; itibar: 0-100 olcekli.
  const standing = Math.max(0, Math.min(100, 50 + state.reputation));
  if (!canIssueLoan(principal, state.gold, standing, bankReserves)) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "loan_denied" } };
  }
  const day = await gameDay(db);
  await execute(
    db,
    `INSERT INTO character_loans (id, character_id, principal, outstanding, interest_rate, issued_game_day, status, updated_at)
     VALUES (?,?,?,?,?,?, 'active', ?)`,
    crypto.randomUUID(),
    characterId,
    principal,
    principal,
    5,
    day,
    nowMs,
  );
  state.gold += principal;
  state.debts += principal;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { principal, interestRate: 5 } };
}

export async function performRepayLoan(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{ id: string; principal: number; outstanding: number; interest_rate: number; issued_game_day: number }>(
    db,
    "SELECT id, principal, outstanding, interest_rate, issued_game_day FROM character_loans WHERE character_id = ? AND status = 'active' ORDER BY issued_game_day LIMIT 1",
    characterId,
  );
  if (!row) return { ok: false, error: "invalid_action", detail: { reason: "no_loan" } };

  const day = await gameDay(db);
  const loan: Loan = {
    id: row.id,
    borrowerId: characterId,
    bankId: "bank",
    principal: row.principal,
    outstanding: row.outstanding,
    interestRate: row.interest_rate,
    issuedGameDay: row.issued_game_day,
  };
  const withInterest = accrueInterest(loan, Math.max(0, day - row.issued_game_day));
  const total = withInterest.outstanding;
  if (state.gold < total) return { ok: false, error: "not_enough_gold", state, detail: { total } };

  await execute(db, "UPDATE character_loans SET outstanding = 0, status = 'repaid', updated_at = ? WHERE id = ?", nowMs, row.id);
  state.gold -= total;
  state.debts = Math.max(0, state.debts - row.principal);
  state.reputation += 2;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { total, interest: total - row.principal, insolvent: withInterest.insolvent } };
}

export async function loanSummary(db: SqlDatabase, characterId: string): Promise<{ principal: number; outstanding: number; active: boolean } | null> {
  const row = await queryOne<{ principal: number; outstanding: number }>(
    db,
    "SELECT principal, outstanding FROM character_loans WHERE character_id = ? AND status = 'active' LIMIT 1",
    characterId,
  );
  return row ? { principal: row.principal, outstanding: row.outstanding, active: true } : null;
}

// --- Mulkiyet, isletme ve vergi (belge 9.10-9.12) ---

const PROPERTY_BASE_COST: Record<PropertyType, number> = {
  house: 300,
  business: 800,
  farm: 500,
  mine: 2000,
  ship: 1500,
  warehouse: 600,
};

export interface PropertyView {
  id: string;
  propertyType: PropertyType;
  settlementId: string | null;
  value: number;
  taxRate: number;
}

export async function listProperties(db: SqlDatabase, characterId: string): Promise<PropertyView[]> {
  const rows = await queryAll<{ id: string; property_type: string; settlement_id: string | null; value: number; tax_rate: number }>(
    db,
    "SELECT id, property_type, settlement_id, value, tax_rate FROM character_properties WHERE character_id = ? ORDER BY property_type",
    characterId,
  );
  return rows.map((r) => ({
    id: r.id,
    propertyType: r.property_type as PropertyType,
    settlementId: r.settlement_id,
    value: r.value,
    taxRate: r.tax_rate,
  }));
}

export async function performBuyProperty(
  db: SqlDatabase,
  characterId: string,
  propertyType: PropertyType,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!(propertyType in PROPERTY_BASE_COST)) return { ok: false, error: "invalid_action" };
  const cost = PROPERTY_BASE_COST[propertyType];
  if (state.gold < cost) return { ok: false, error: "not_enough_gold", state, detail: { cost } };
  const settlement = await currentSettlement(db, characterId);
  await execute(
    db,
    `INSERT INTO character_properties (id, character_id, settlement_id, property_type, value, tax_rate, updated_at)
     VALUES (?,?,?,?,?,0.02,?)`,
    crypto.randomUUID(),
    characterId,
    settlement,
    propertyType,
    cost,
    nowMs,
  );
  state.gold -= cost;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { propertyType, cost } };
}

/** Isletme geliri: sermaye/market SUNUCUDA; kalici altin artisi. */
export async function performRunBusiness(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const props = await listProperties(db, characterId);
  const businesses = props.filter((p) => p.propertyType === "business" || p.propertyType === "farm" || p.propertyType === "mine");
  if (businesses.length === 0) return { ok: false, error: "invalid_action", detail: { reason: "no_business" } };

  const totalValue = businesses.reduce((s, p) => s + p.value, 0);
  const marketFactor = 1 + Math.min(0.5, state.reputation / 200);
  const income = businessIncome(totalValue, businesses.length, marketFactor);
  const tax = taxDue(income, totalValue, 0.05, 0.02);
  const net = Math.max(0, income - tax);

  state.gold += net;
  state.reputation += 1;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { income, tax, net, businesses: businesses.length } };
}

/** Vergi odemesi: mulk vergisi sunucuda hesaplanir; hazineye gider. */
export async function performPayTaxes(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const props = await listProperties(db, characterId);
  if (props.length === 0) return { ok: false, error: "invalid_action", detail: { reason: "no_property" } };
  const due = props.reduce((s, p) => s + propertyTax({ id: p.id, settlementId: p.settlementId ?? "", propertyType: p.propertyType, ownerType: "character", ownerId: characterId, value: p.value, taxRate: p.taxRate }), 0);
  if (state.gold < due) return { ok: false, error: "not_enough_gold", state, detail: { due } };
  state.gold -= due;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { due, properties: props.length } };
}

// --- Adalet ve hapis (belge 13.4-13.5) ---

export interface PrisonView {
  settlementId: string | null;
  daysRemaining: number;
  escapeAttempts: number;
}

export async function prisonStatus(db: SqlDatabase, characterId: string): Promise<PrisonView | null> {
  const row = await queryOne<{ settlement_id: string | null; days_remaining: number; escape_attempts: number }>(
    db,
    "SELECT settlement_id, days_remaining, escape_attempts FROM character_prison WHERE character_id = ? AND days_remaining > 0",
    characterId,
  );
  return row ? { settlementId: row.settlement_id, daysRemaining: row.days_remaining, escapeAttempts: row.escape_attempts } : null;
}

/**
 * Suc isleme ve yargilama: yakalanma ve ceza SUNUCUDA. Yakalanan karakter
 * hapse girer; ceza (para/hapis/surgun) kalici duruma yazilir.
 */
export async function performCrime(
  db: SqlDatabase,
  characterId: string,
  crimeType: CrimeType,
  evidence = 30,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!(crimeType in CRIME_SEVERITY)) return { ok: false, error: "invalid_action" };

  const settlement = await currentSettlement(db, characterId);
  const security = settlementSecurity(settlement);
  const day = await gameDay(db);
  const crime: Crime = {
    id: crypto.randomUUID(),
    type: crimeType,
    settlementId: settlement ?? "unknown",
    committedGameDay: day,
    evidence: Math.max(0, Math.min(100, evidence)),
    witnessed: Math.random() < 0.5,
  };
  const profile: LegalProfile = {
    standing: Math.max(0, Math.min(100, 50 + state.reputation)),
    bribeCapacity: state.gold,
    connections: Math.max(0, Math.min(100, state.underworldRep)),
  };

  const chance = arrestChance(crime, security, profile);
  const arrested = Math.random() * 100 < chance;

  await execute(
    db,
    `INSERT INTO world_event_log (id, event_type, settlement_id, severity, payload_json, game_day, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    crypto.randomUUID(),
    "crime",
    settlement,
    CRIME_SEVERITY[crimeType],
    JSON.stringify({ characterId, crimeType, arrested }),
    day,
    nowMs,
  );

  if (!arrested) {
    state.underworldRep += 2;
    state.reputation -= 1;
    await saveState(db, state, nowMs);
    return { ok: true, state, detail: { crimeType, arrested: false, chance } };
  }

  const verdict = sentence(crime, profile, state.gold, Math.random());
  // Agir sucta rutbe dusurulur (belge 10, 13): ihanet/suclu mahkumiyet.
  if (CRIME_SEVERITY[crimeType] >= 50) {
    await demoteOffice(db, characterId, nowMs);
  }
  if (verdict.type === "fine") {
    state.gold = Math.max(0, state.gold - verdict.fine);
    state.reputation -= 2;
  } else if (verdict.type === "imprisonment" || verdict.type === "exile") {
    const days = verdict.type === "exile" ? 30 : Math.max(1, verdict.prisonDays);
    await execute(
      db,
      `INSERT INTO character_prison (character_id, settlement_id, days_remaining, escape_attempts, updated_at)
       VALUES (?,?,?,0,?)
       ON CONFLICT(character_id) DO UPDATE SET settlement_id=excluded.settlement_id, days_remaining=excluded.days_remaining, updated_at=excluded.updated_at`,
      characterId,
      settlement,
      days,
      nowMs,
    );
    state.reputation -= 5;
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { crimeType, arrested: true, chance, verdict } };
}

/**
 * Suclu mahkumiyette rutbe dusurme (belge 10, 13). En alt rutbede makam
 * kaybi olur (azil); aksi halde bir basamak iner.
 */
async function demoteOffice(db: SqlDatabase, characterId: string, nowMs: number): Promise<void> {
  const row = await queryOne<{ rank: string }>(
    db,
    "SELECT rank FROM character_offices WHERE character_id = ?",
    characterId,
  );
  if (!row) return;
  const next = demote((RANKS.includes(row.rank as Rank) ? row.rank : "recruit") as Rank);
  if (next === row.rank) {
    // En alt rutbe: makam tamamen geri alinir.
    await execute(db, "DELETE FROM character_offices WHERE character_id = ?", characterId);
    await execute(db, "UPDATE offices SET holder_type=NULL, holder_id=NULL, appointed_day=? WHERE holder_id = ?", nowMs, characterId);
    return;
  }
  await execute(db, "UPDATE character_offices SET rank = ?, updated_at = ? WHERE character_id = ?", next, nowMs, characterId);
  await execute(db, "UPDATE offices SET rank = ? WHERE holder_id = ?", next, characterId);
}

/** Hapisten kacis: ceviklik/zeka/rusvet SUNUCUDA; sonuc kalici. */
export async function performEscape(
  db: SqlDatabase,
  characterId: string,
  bribeAmount = 0,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{ settlement_id: string | null; days_remaining: number; escape_attempts: number }>(
    db,
    "SELECT settlement_id, days_remaining, escape_attempts FROM character_prison WHERE character_id = ?",
    characterId,
  );
  if (!row || row.days_remaining <= 0) return { ok: false, error: "invalid_action", detail: { reason: "not_imprisoned" } };

  const bribe = Math.max(0, Math.min(state.gold, Math.floor(bribeAmount)));
  const security = settlementSecurity(row.settlement_id);
  const chance = escapeChance(state.strength, state.strength, bribe, security);
  const result = attemptEscape(
    { characterId, settlementId: row.settlement_id ?? "unknown", daysRemaining: row.days_remaining, escapeAttempts: row.escape_attempts },
    chance,
    Math.random(),
  );
  if (bribe > 0) state.gold -= bribe;

  if (result.escaped) {
    await execute(db, "UPDATE character_prison SET days_remaining = 0, escape_attempts = ?, updated_at = ? WHERE character_id = ?", result.prison.escapeAttempts, nowMs, characterId);
    state.underworldRep += 3;
    state.reputation -= 3;
  } else {
    await execute(db, "UPDATE character_prison SET days_remaining = ?, escape_attempts = ?, updated_at = ? WHERE character_id = ?", result.prison.daysRemaining, result.prison.escapeAttempts, nowMs, characterId);
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { escaped: result.escaped, chance, daysRemaining: result.prison.daysRemaining } };
}

// --- Dovus ve duello (belge 14.1-14.4, 16.5) ---

/**
 * Dovus: karakterin nitelikleri ve silahi ile kurgusal bir rakibe karsi.
 * Sonuc SUNUCUDA; yaralanma kalici sagliga yazilir.
 */
export async function performFight(
  db: SqlDatabase,
  characterId: string,
  opponentStrength = 8,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!state.health.alive) return { ok: false, error: "dead" };

  const weaponType = state.weapon === "unarmed" ? "unarmed" : "sword";
  const attacker: CombatantStats = {
    attributes: { ...emptyAttributes(), strength: state.strength, endurance: state.strength, agility: state.strength },
    weapon: weaponType as CombatantStats["weapon"],
    weaponMastery: state.weaponMastery,
    armor: 0,
    healthFactor: state.health.health / 100,
    terrainBonus: 0,
    prepared: false,
  };
  const opp = Math.max(1, Math.min(20, Math.floor(opponentStrength)));
  const defender: CombatantStats = {
    attributes: { ...emptyAttributes(), strength: opp, endurance: opp, agility: opp },
    weapon: "sword",
    weaponMastery: Math.max(0, opp - 5),
    armor: 0,
    healthFactor: 1,
    terrainBonus: 0,
    prepared: false,
  };

  const result = resolveCombat(attacker, defender, Math.random);
  if (result.winner === "attacker") {
    state.gold += opp * 3;
    state.weaponMastery += 1;
    state.reputation += 1;
  }
  if (result.attackerInjured) {
    const severity = Math.max(5, Math.round(100 - result.attackerHpRemaining));
    state.health = {
      ...state.health,
      health: Math.max(1, state.health.health - Math.round(severity / 3)),
      injuries: [
        ...state.health.injuries,
        {
          id: crypto.randomUUID(),
          kind: "cut",
          severity,
          bleeding: Math.round(severity / 10),
          infection: 0,
          treated: false,
          occurredGameDay: 0,
        },
      ],
    };
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { winner: result.winner, rounds: result.rounds.length, injured: result.attackerInjured } };
}

/** Duello uygunlugu: guvenli sehir + karsilikli riza kurali (belge 16.5). */
export async function duelAllowed(db: SqlDatabase, characterId: string, bothConsented: boolean): Promise<{ allowed: boolean; safeCity: boolean }> {
  const settlement = await currentSettlement(db, characterId);
  const kind = SETTLEMENTS.find((s) => s.id === settlement)?.kind ?? "village";
  const safeCity = kind === "capital" || kind === "city";
  return { allowed: canDuel(safeCity, bothConsented), safeCity };
}

// --- Sosyal baglantilar (belge 16.3-16.4) ---

export interface SocialView {
  targetId: string;
  kind: "friend" | "enemy" | "ally" | "trade_partner";
}

export async function listSocial(db: SqlDatabase, characterId: string): Promise<SocialView[]> {
  const rows = await queryAll<{ target_id: string; kind: string }>(
    db,
    "SELECT target_id, kind FROM character_social WHERE character_id = ? ORDER BY kind, target_id",
    characterId,
  );
  return rows.map((r) => ({ targetId: r.target_id, kind: r.kind as SocialView["kind"] }));
}

export async function performSetRelationship(
  db: SqlDatabase,
  characterId: string,
  targetId: string,
  kind: "friend" | "enemy" | "ally" | "trade_partner",
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!targetId || targetId === characterId) return { ok: false, error: "invalid_action" };
  await execute(
    db,
    "INSERT OR IGNORE INTO character_social (character_id, target_id, kind, created_at) VALUES (?,?,?,?)",
    characterId,
    targetId,
    kind,
    nowMs,
  );
  return { ok: true, state, detail: { targetId, kind } };
}

// --- Siyasi makam ve rutbe (belge 10, 11) ---

export interface OfficeView {
  kingdomId: string | null;
  title: string;
  rank: string;
  servicePoints: number;
}

export async function officeStatus(db: SqlDatabase, characterId: string): Promise<OfficeView | null> {
  const row = await queryOne<{ kingdom_id: string | null; title: string; rank: string; service_points: number }>(
    db,
    "SELECT kingdom_id, title, rank, service_points FROM character_offices WHERE character_id = ?",
    characterId,
  );
  return row ? { kingdomId: row.kingdom_id, title: row.title, rank: row.rank, servicePoints: row.service_points } : null;
}

/**
 * Hizmet puani ve itibar ile rutbe yukseltme ve makam atamasi (belge 10, 11).
 *
 * Rutbe `politics/government` kurallarindan turer; makam kaydi `offices`
 * tablosuna yazilir ki NPC'ler ve oyuncular AYNI makamlar icin rekabet
 * edebilsin (belge 8.6). Konsey yonetiminde atama onay gerektirir.
 */
export async function performSeekOffice(
  db: SqlDatabase,
  characterId: string,
  title: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const safeTitle = String(title).slice(0, 40) || "Memur";
  const settlement = await currentSettlement(db, characterId);
  const kingdomId = SETTLEMENTS.find((s) => s.id === settlement)?.kingdomId ?? KINGDOMS[0]!.id;
  const points = Math.max(0, state.reputation) + state.weaponMastery;

  // Mevcut rutbeden yukseltme; yetki makam sahipliginden gelir.
  const kingdom = await queryOne<{ government: string }>(db, "SELECT government FROM kingdoms WHERE id = ?", kingdomId);
  const government = (kingdom?.government ?? "feudal_monarchy") as Government;
  const currentRank = await queryOne<{ rank: string }>(
    db,
    "SELECT rank FROM offices WHERE kingdom_id = ? AND title = ? AND holder_id = ? LIMIT 1",
    kingdomId,
    safeTitle,
    characterId,
  );
  const baseRank = (RANKS.includes((currentRank?.rank ?? "") as Rank) ? currentRank!.rank : "recruit") as Rank;
  const rank = promote(baseRank, points, true);

  // Makam tek sahipli: musait veya devredilebilir olmali (belge 10.4).
  const officeId = `office-${kingdomId}-${safeTitle}`;
  const existing = await queryOne<{ holder_id: string | null; service_points: number }>(
    db,
    "SELECT holder_id, service_points FROM offices WHERE id = ?",
    officeId,
  );
  const occupant = existing?.holder_id ?? null;
  const incumbentPoints = existing?.service_points ?? 0;
  const position: Position = {
    id: officeId,
    kingdomId,
    title: safeTitle,
    authority: "general",
    holderType: occupant ? "character" : null,
    holderId: occupant,
    appointedAt: null,
  };
  // Makam bos mu? Bos makam dogrudan atanir (belge 10.2).
  const vacant = isVacant(position);
  const needsCouncil = government === "council_monarchy" || government === "noble_council_monarchy";
  const councilApproval = !needsCouncil || points >= 40;

  // Makam doluysa siyasi mucadele cozulur (belge 8.6, 10.4, 11). Destek +
  // itibar toplami yuksek olan kazanir; esitlikte mevcut sahip avantajlidir.
  if (!vacant && occupant !== characterId) {
    if (!councilApproval) {
      return { ok: false, error: "invalid_action", state, detail: { reason: "council_approval_required", government } };
    }
    const winner = resolvePowerStruggle({
      challengerSupport: points,
      incumbentSupport: incumbentPoints,
      challengerReputation: Math.max(0, state.reputation),
      incumbentReputation: Math.max(0, incumbentPoints - 40),
    });
    if (winner !== "challenger") {
      return { ok: false, error: "invalid_action", state, detail: { reason: "office_held", incumbentPoints } };
    }
  }
  const decision = appoint(
    { ...position, holderId: occupant, holderType: occupant ? "character" : null },
    "character",
    characterId,
    nowMs,
    councilApproval,
    government,
  );
  if (!decision.ok) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "council_approval_required", government } };
  }
  await execute(
    db,
    `INSERT INTO offices (id, kingdom_id, settlement_id, title, holder_type, holder_id, rank, service_points, appointed_day)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET holder_type='character', holder_id=excluded.holder_id, rank=excluded.rank, service_points=excluded.service_points, appointed_day=excluded.appointed_day`,
    position.id,
    kingdomId,
    settlement,
    safeTitle,
    "character",
    characterId,
    rank,
    points,
    nowMs,
  );
  await execute(
    db,
    `INSERT INTO character_offices (character_id, kingdom_id, title, rank, service_points, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(character_id) DO UPDATE SET kingdom_id=excluded.kingdom_id, title=excluded.title, rank=excluded.rank, service_points=excluded.service_points, updated_at=excluded.updated_at`,
    characterId,
    kingdomId,
    safeTitle,
    rank,
    points,
    nowMs,
  );
  return { ok: true, state, detail: { title: safeTitle, rank, servicePoints: points, kingdomId } };
}

// --- Diplomasi (belge 10) ---

export async function diplomacyStances(): Promise<{ from: string; to: string; stance: string }[]> {
  const out: { from: string; to: string; stance: string }[] = [];
  for (const k of KINGDOMS) {
    const relation: Relation = { fromKingdomId: k.id, toKingdomId: "player", stance: "neutral", affinity: 0, allianceUntilGameDay: null };
    out.push({ from: k.id, to: "player", stance: stanceFor(relation.affinity) });
  }
  return out;
}

/** Diplomatik eylem: hediye/ittifak vb. iliskiyi degistirir (sunucuda). */
export async function performDiplomacy(
  db: SqlDatabase,
  characterId: string,
  kingdomId: string,
  action: "gift" | "marriage" | "insult" | "threat" | "treaty",
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (!KINGDOMS.some((k) => k.id === kingdomId)) return { ok: false, error: "invalid_action" };
  const amount = 100;
  if ((action === "gift" || action === "treaty") && state.gold < amount) {
    return { ok: false, error: "not_enough_gold", state, detail: { amount } };
  }
  const relation: Relation = { fromKingdomId: kingdomId, toKingdomId: "player", stance: "neutral", affinity: 0, allianceUntilGameDay: null };
  const next = applyDiplomacy(relation, action, amount);
  if (action === "gift" || action === "treaty") state.gold -= amount;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { kingdomId, action, stance: stanceFor(next.affinity), affinity: next.affinity } };
}

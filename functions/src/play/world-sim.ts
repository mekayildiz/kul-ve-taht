/**
 * Katmanli dunya simulasyonu (tasarim belgesi 8.8, 9.4, 19.4).
 *
 * NPC'ler oyuncu sayisindan bagimsiz olarak ekonomiyi canli tutar. Free plan
 * kota sinirlari icin simulasyon KATMANLIDIR: onemli NPC her gun, yerel NPC
 * 7 gunde bir, arka plan nufusu 30 gunde bir ve PARTI halinde islenir. Her
 * calistirma yalnizca sirasi gelmis ve en uzun suredir islenmemis kayitlari
 * alir; boylece gunluk yazma kotasi asilmaz.
 *
 * Simulasyon istemciden gelen bir istege bagli DEGILDIR; dunya saati ilerlemesi
 * veya zamanlanmis tetikleyici ile calisir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import {
  advanceNpcDay,
  decideGoal,
  shouldSimulate,
  simulationIntervalDays,
  type Npc,
  type NpcGoal,
  type NpcTier,
} from "../npc/model";
import { disruptionImpact, type DisruptionKind } from "../economy/extras";
import { famineRisk } from "../livelihood/production";
import { seasonFor } from "../time/world-clock";
import type { WorldEventType } from "../quests/system";

/** Ekonomi bozulmasi ile dunya olayi turu arasindaki esleme (belge 12.4). */
const WORLD_EVENT_TYPE: Record<DisruptionKind, WorldEventType> = {
  war: "war",
  famine: "famine",
  trade_route_crisis: "trade_crisis",
  banditry: "bandit_raid",
  plague: "epidemic",
};

/** Tek calistirmada islenecek en fazla NPC (Free plan yazma kotasi korumasi). */
export const NPC_BATCH_LIMIT = 50;

export interface SimulationResult {
  gameDay: number;
  processed: number;
  events: string[];
}

function toTier(importance: string): NpcTier {
  if (importance === "critical") return "important";
  if (importance === "notable") return "local";
  return "background";
}

function fromRow(row: {
  id: string;
  name: string;
  settlement_id: string | null;
  importance: string;
  age_years: number;
  alive: number;
  needs_json: string;
  goals_json: string;
  gold: number;
  debts: number;
  profession: string;
}): Npc {
  return {
    id: row.id,
    name: row.name,
    tier: toTier(row.importance),
    settlementId: row.settlement_id ?? "varkhenn-drahkmar",
    attributes: { strength: 8, endurance: 8, agility: 8, intellect: 8, perception: 8, charisma: 8, leadership: 8 },
    personality: { courage: 50, mercy: 50, ambition: 50, loyalty: 50, discipline: 50, patience: 50 },
    goals: parseGoals(row.goals_json),
    needs: parseNeeds(row.needs_json),
    profession: row.profession,
    expertise: [{ path: row.profession, level: 1 }],
    gold: row.gold,
    debts: row.debts,
    propertyValue: 0,
    militaryRank: 0,
    office: null,
    memory: [],
    alive: row.alive === 1,
    ageYears: row.age_years,
  };
}

function parseNeeds(json: string): Npc["needs"] {
  try {
    const parsed = JSON.parse(json) as Partial<Npc["needs"]>;
    return {
      food: parsed.food ?? 50,
      shelter: parsed.shelter ?? 50,
      safety: parsed.safety ?? 50,
      social: parsed.social ?? 50,
    };
  } catch {
    return { food: 50, shelter: 50, safety: 50, social: 50 };
  }
}

function parseGoals(json: string): NpcGoal[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed.filter((g) => typeof g === "string") as NpcGoal[]) : [];
  } catch {
    return [];
  }
}

/** Simulasyon sirasi gelmis NPC'leri parti halinde ilerletir. */
export async function simulateNpcBatch(
  db: SqlDatabase,
  gameDay: number,
  limit = NPC_BATCH_LIMIT,
): Promise<number> {
  const rows = await queryAll<Parameters<typeof fromRow>[0]>(
    db,
    `SELECT id, name, settlement_id, importance, age_years, alive, needs_json, goals_json, gold, debts, profession
     FROM npcs
     WHERE alive = 1 AND (? - last_simulated_day) >= CASE importance
       WHEN 'critical' THEN 1 WHEN 'notable' THEN 7 ELSE 30 END
     ORDER BY last_simulated_day ASC LIMIT ?`,
    gameDay,
    limit,
  );

  let processed = 0;
  for (const row of rows) {
    const npc = fromRow(row);
    if (!shouldSimulate(npc, gameDay)) continue;
    const advanced = advanceNpcDay(npc, gameDay);
    const goal = decideGoal(advanced);
    await execute(
      db,
      "UPDATE npcs SET needs_json = ?, goals_json = ?, gold = ?, debts = ?, age_years = ?, last_simulated_day = ? WHERE id = ?",
      JSON.stringify(advanced.needs),
      JSON.stringify([goal]),
      advanced.gold,
      advanced.debts,
      advanced.ageYears,
      gameDay,
      row.id,
    );
    processed += 1;
  }
  return processed;
}

/** Bozulma turleri agirlikli secilir; sonuc pazar fiyat carpanini belirler. */
const DISRUPTIONS: DisruptionKind[] = ["war", "famine", "trade_route_crisis", "banditry", "plague"];

export function disruptionFor(gameDay: number): DisruptionKind {
  return DISRUPTIONS[gameDay % DISRUPTIONS.length]!;
}

/** Pazar carpani ve guvenlik etkisini yerlesimlere uygular, olayi gunluge yazar. */
export async function applyWorldDisruption(
  db: SqlDatabase,
  gameDay: number,
  settlementId: string,
  kind: DisruptionKind,
  nowMs: number,
): Promise<string> {
  const impact = disruptionImpact(kind);
  await execute(
    db,
    `INSERT INTO market_state (settlement_id, item_id, supply, demand, updated_day)
     VALUES (?,?,?,?,?)
     ON CONFLICT(settlement_id, item_id) DO UPDATE SET
       supply = MAX(10, CAST(market_state.supply * ? AS INTEGER)),
       demand = MIN(400, CAST(market_state.demand * ? AS INTEGER)),
       updated_day = excluded.updated_day`,
    settlementId,
    "*",
    Math.round(100 * impact.supplyFactor),
    100,
    gameDay,
    impact.supplyFactor,
    1 / Math.max(0.1, impact.priceFactor),
  );
  await execute(
    db,
    `INSERT INTO world_event_log (id, event_type, settlement_id, severity, payload_json, game_day, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    crypto.randomUUID(),
    WORLD_EVENT_TYPE[kind],
    settlementId,
    2,
    JSON.stringify({ priceFactor: impact.priceFactor, supplyFactor: impact.supplyFactor }),
    gameDay,
    nowMs,
  );
  return kind;
}

/**
 * Bos makamlari onemli NPC'lerle doldurur (belge 8.7, 10.4). Boylece oyun
 * basladiginda kral/memur zinciri hazirdir ve oyuncular NPC'lerle AYNI
 * makamlar icin rekabet eder (belge 8.6).
 */
export async function assignNpcOffices(db: SqlDatabase, gameDay: number, limit = 20): Promise<number> {
  const vacant = await queryAll<{ id: string; kingdom_id: string | null; settlement_id: string | null; title: string }>(
    db,
    `SELECT id, kingdom_id, settlement_id, title FROM offices
     WHERE holder_id IS NULL AND (kingdom_id IS NOT NULL OR settlement_id IS NOT NULL)
     ORDER BY id LIMIT ?`,
    limit,
  );
  let assigned = 0;
  for (const office of vacant) {
    const npc = await queryOne<{ id: string }>(
      db,
      `SELECT id FROM npcs
       WHERE importance = 'critical' AND settlement_id = ? AND alive = 1
       ORDER BY gold DESC LIMIT 1`,
      office.settlement_id,
    );
    if (!npc) continue;
    await execute(
      db,
      "UPDATE offices SET holder_type = 'npc', holder_id = ?, rank = 'sergeant', service_points = 30, appointed_day = ? WHERE id = ?",
      npc.id,
      gameDay,
      office.id,
    );
    assigned += 1;
  }
  return assigned;
}

/**
 * Dunya ilerlemesinin tam turu: gun atlandiysa katmanli NPC simulasyonu,
 * ardindan bos makamlarin NPC'lerle doldurulmasi ve bir yerlesimde bozulma
 * olayi. Idempotent: ayni gun icin tekrar cagrilirsa is yapmaz
 * (last_simulated_day ve world_event_log.game_day ile).
 */
export async function runWorldSimulation(db: SqlDatabase, gameDay: number, nowMs = Date.now()): Promise<SimulationResult> {
  const processed = await simulateNpcBatch(db, gameDay);
  await assignNpcOffices(db, gameDay);

  const events: string[] = [];
  const settlements = await queryAll<{ id: string }>(db, "SELECT id FROM settlements ORDER BY id LIMIT 130");
  const already = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM world_event_log WHERE game_day = ?",
    gameDay,
  );
  // Gunluk olay: ayni gun icin ikinci kez uretilmez (idempotent). Tahil stoku
  // nufusa yetmiyorsa kitlik riski (belge 9.9) olayi kitlige cevirir; aksi
  // halde siradan bozulma turu uygulanir. Saf kural livelihood/production.
  if ((already?.n ?? 0) === 0 && settlements.length > 0) {
    const target = settlements[gameDay % settlements.length]!;
    const grain = await queryOne<{ supply: number }>(
      db,
      "SELECT supply FROM market_state WHERE settlement_id = ? AND item_id = 'wheat'",
      target.id,
    );
    const pop = await queryOne<{ population: number }>(
      db,
      "SELECT population FROM settlements WHERE id = ?",
      target.id,
    );
    const risk = famineRisk(seasonFor(gameDay), grain?.supply ?? 0, pop?.population ?? 0);
    const kind: DisruptionKind = risk >= 0.6 ? "famine" : disruptionFor(gameDay);
    events.push(await applyWorldDisruption(db, gameDay, target.id, kind, nowMs));
  }
  return { gameDay, processed, events };
}

/** NPC katman dagilimi (panel ve testler icin). */
export function intervalFor(importance: string): number {
  return simulationIntervalDays(toTier(importance));
}

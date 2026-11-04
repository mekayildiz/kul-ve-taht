/**
 * Kalan saf fonksiyonlarin oynanisa baglanmasi (tasarim belgesi 7.3, 7.6, 9.4, 10, 11, 16).
 *
 * Belge 20: bir sistem yalnizca modul olarak var olamaz. Bu dosya daha once
 * yazilmis ancak baglanmamis saf fonksiyonlari KALICI duruma baglar:
 *   - childStage / childDevelopmentBonus (belge 7.3)
 *   - councilVote (belge 11)
 *   - dismiss (belge 10)
 *   - recordDeath (belge 7.6)
 *   - isDuelRequestValid (belge 16)
 *   - marketShare (belge 9.4)
 *
 * Tum kararlar SUNUCUDA verilir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { loadState, type PlayResult } from "./service";
import {
  childDevelopmentBonus,
  childStage,
  DAYS_TO_ADULTHOOD,
  recordDeath,
  type Family,
} from "../family/dynasty";
import { councilVote, dismiss, type CouncilMember, type Position } from "../politics/government";
import { isDuelRequestValid } from "../social/social";
import { marketShare } from "../economy/extras";

async function gameDay(db: SqlDatabase): Promise<number> {
  const row = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return row?.game_day ?? 1;
}

async function realDays(db: SqlDatabase): Promise<number> {
  const row = await queryOne<{ last_tick_real_ms: number }>(db, "SELECT last_tick_real_ms FROM world_clock WHERE id = 1");
  return Math.floor((row?.last_tick_real_ms ?? Date.now()) / 86_400_000);
}

// --- Cocuk gelisimi (belge 7.3) ---

export interface ChildView {
  id: string;
  name: string;
  stage: string;
  stageLabel: string;
  developmentBonus: number;
  daysToAdulthood: number;
}

export async function childList(db: SqlDatabase, characterId: string): Promise<ChildView[]> {
  const rows = await queryAll<{
    id: string;
    name: string;
    born_real_day: number;
    parent_attention: number;
    wet_nurse_quality: number;
  }>(
    db,
    "SELECT id, name, born_real_day, parent_attention, wet_nurse_quality FROM character_children WHERE character_id = ? ORDER BY born_real_day",
    characterId,
  );
  const now = await realDays(db);
  return rows.map((r) => {
    const elapsed = Math.max(0, now - r.born_real_day);
    const stage = childStage(elapsed);
    return {
      id: r.id,
      name: r.name,
      stage: stage.name,
      stageLabel: stage.label,
      developmentBonus: childDevelopmentBonus(r.parent_attention, r.wet_nurse_quality),
      daysToAdulthood: Math.max(0, DAYS_TO_ADULTHOOD - elapsed),
    };
  });
}

/**
 * Cocuk dogumu (belge 7.3): ebeveyn ilgisi ve sutanne kalitesi gelisimi
 * belirler; gelisim asamalari gercek gune gore ilerler.
 */
export async function performRecordChild(
  db: SqlDatabase,
  characterId: string,
  name: string,
  parentAttention = 50,
  wetNurseQuality = 50,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_name" } };
  const attention = Math.max(0, Math.min(100, Math.floor(parentAttention)));
  const nurse = Math.max(0, Math.min(100, Math.floor(wetNurseQuality)));
  const now = await realDays(db);
  await execute(
    db,
    "INSERT INTO character_children (id, character_id, name, born_real_day, parent_attention, wet_nurse_quality, created_at) VALUES (?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    characterId,
    trimmed,
    now,
    attention,
    nurse,
    nowMs,
  );
  await execute(db, "UPDATE character_family SET children = children + 1, updated_at = ? WHERE character_id = ?", nowMs, characterId);
  return { ok: true, state, detail: { name: trimmed, developmentBonus: childDevelopmentBonus(attention, nurse) } };
}

// --- Konsey oylamasi (belge 11) ---

export interface MotionView {
  id: string;
  kingdomId: string;
  title: string;
  status: "open" | "passed" | "rejected";
  yesWeight: number;
  noWeight: number;
}

export async function motionList(db: SqlDatabase, kingdomId: string): Promise<MotionView[]> {
  const rows = await queryAll<{
    id: string;
    kingdom_id: string;
    title: string;
    status: MotionView["status"];
    yes_weight: number;
    no_weight: number;
  }>(
    db,
    "SELECT id, kingdom_id, title, status, yes_weight, no_weight FROM council_motions WHERE kingdom_id = ? ORDER BY created_at DESC LIMIT 20",
    kingdomId,
  );
  return rows.map((r) => ({ id: r.id, kingdomId: r.kingdom_id, title: r.title, status: r.status, yesWeight: r.yes_weight, noWeight: r.no_weight }));
}

/** Konsey karari (belge 11): uyelerin oy agirligi ve yetersayim sunucuda hesaplanir. */
export async function performCouncilMotion(
  db: SqlDatabase,
  characterId: string,
  title: string,
  quorum = 3,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const settlement = await queryOne<{ current_settlement: string | null }>(db, "SELECT current_settlement FROM characters WHERE id = ?", characterId);
  const kingdomId = settlement?.current_settlement?.split("-")[0] ?? "varkhenn";
  const safeTitle = String(title).slice(0, 60) || "Karar";

  // Oy veren uyeler: ayni krallikta makam sahibi karakterler/NPC'ler.
  const members = await queryAll<{ holder_id: string | null; title: string }>(
    db,
    "SELECT holder_id, title FROM offices WHERE kingdom_id = ? AND holder_id IS NOT NULL",
    kingdomId,
  );
  const councilMembers: CouncilMember[] = members
    .filter((m) => m.holder_id)
    .map((m, i) => ({ holderId: m.holder_id!, authority: m.title, weight: 1, support: 60 + i }));
  // Oy SUNUCUDA belirlenir (deterministik: makam sahibi destekler).
  const votes: Record<string, "yes" | "no"> = {};
  for (const member of councilMembers) {
    votes[member.holderId] = member.support >= 50 ? "yes" : "no";
  }
  votes[characterId] = "yes";
  const decision = councilVote(councilMembers, votes, quorum);

  const day = await gameDay(db);
  const status = decision.passed ? "passed" : decision.quorumMet ? "rejected" : "open";
  await execute(
    db,
    "INSERT INTO council_motions (id, kingdom_id, proposer_id, title, quorum, status, yes_weight, no_weight, created_game_day, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    kingdomId,
    characterId,
    safeTitle,
    quorum,
    status,
    decision.yes,
    decision.no,
    day,
    nowMs,
  );
  return { ok: true, state, detail: { kingdomId, status, decision } };
}

// --- Makam azli (belge 10, dismiss baglantisi) ---

/** Oyuncu kendi makamindan cekilir (belge 10). `dismiss` makami bosaltir. */
export async function performResignOffice(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{ title: string; kingdom_id: string | null; rank: string }>(
    db,
    "SELECT title, kingdom_id, rank FROM character_offices WHERE character_id = ?",
    characterId,
  );
  if (!row) return { ok: false, error: "invalid_action", state, detail: { reason: "no_office" } };
  const cleared: Position = dismiss({
    id: `office-${row.kingdom_id}-${row.title}`,
    kingdomId: row.kingdom_id ?? "",
    title: row.title,
    authority: "general",
    holderType: "character",
    holderId: characterId,
    appointedAt: null,
  });
  if (cleared.holderId !== null) return { ok: false, error: "invalid_action", state, detail: { reason: "dismiss_failed" } };
  await execute(db, "DELETE FROM character_offices WHERE character_id = ?", characterId);
  await execute(
    db,
    "UPDATE offices SET holder_type = NULL, holder_id = NULL, appointed_day = ? WHERE kingdom_id = ? AND title = ?",
    nowMs,
    row.kingdom_id,
    row.title,
  );
  return { ok: true, state, detail: { resigned: row.title } };
}

// --- Olum kaydi (belge 7.6, recordDeath baglantisi) ---

/**
 * Olum kaydi: aile gecmisine islenir (belge 7.6). `recordDeath` saf
 * fonksiyonu ile kronoloji guncellenir ve kalici haneye yazilir.
 */
export async function performRecordDeath(
  db: SqlDatabase,
  characterId: string,
  note: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const famRow = await queryOne<{ family_id: string; name: string; reputation: number; wealth: number; debt: number; chronicle_json: string | null }>(
    db,
    "SELECT fm.family_id, f.name, f.reputation, f.wealth, f.debt, f.chronicle_json FROM family_members fm JOIN families f ON f.id = fm.family_id WHERE fm.character_id = ? LIMIT 1",
    characterId,
  );
  const day = await gameDay(db);
  if (famRow) {
    const family: Family = {
      id: famRow.family_id,
      surname: famRow.name,
      crest: "",
      members: [{ id: characterId, name: "player", role: "parent", isPlayer: true, alive: true, ageYears: 20 }],
      reputation: famRow.reputation,
      wealth: famRow.wealth,
      debt: famRow.debt,
      titles: [],
      chronicle: parseChronicle(famRow.chronicle_json),
    };
    const updated = recordDeath(family, characterId, String(note).slice(0, 120) || "Ölüm", day);
    await execute(db, "UPDATE families SET chronicle_json = ? WHERE id = ?", JSON.stringify(updated.chronicle), famRow.family_id);
  }
  await execute(db, "UPDATE characters SET alive = 0, updated_at = ? WHERE id = ?", nowMs, characterId);
  return { ok: true, state, detail: { day } };
}

function parseChronicle(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// --- Duello istegi gecerliligi (belge 16, isDuelRequestValid baglantisi) ---

export interface DuelRequestView {
  challengerId: string;
  defenderId: string;
  createdAtMs: number;
  accepted: boolean;
}

/** Duello istegi suresi dolmus mu (belge 16): 5 dakikalik gecerlilik SUNUCUDA. */
export function duelRequestUsable(req: DuelRequestView, nowMs: number): boolean {
  return isDuelRequestValid(
    { id: `${req.challengerId}:${req.defenderId}`, challengerId: req.challengerId, defenderId: req.defenderId, accepted: req.accepted, createdAtMs: req.createdAtMs },
    nowMs,
  );
}

// --- Pazar payi (belge 9.4, marketShare baglantisi) ---

/** Oyuncunun bolgedeki arz payi (belge 9.4): tekel degerlendirmesi icin. */
export async function playerMarketShare(db: SqlDatabase, settlementId: string, itemId: string): Promise<number> {
  const own = await queryOne<{ supply: number | null }>(
    db,
    "SELECT supply FROM market_state WHERE settlement_id = ? AND item_id = ?",
    settlementId,
    itemId,
  );
  const total = await queryOne<{ total: number | null }>(
    db,
    "SELECT SUM(supply) AS total FROM market_state WHERE item_id = ? AND supply > 0",
    itemId,
  );
  return marketShare(own?.supply ?? 0, total?.total ?? 0);
}

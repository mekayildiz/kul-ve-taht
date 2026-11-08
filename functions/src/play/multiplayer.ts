/**
 * Cok oyunculu iletisim ve aile/hanedan servisleri
 * (tasarim belgesi 7 ve 16).
 *
 * Belge 20: kalici ortak dunya. Sohbet mesajlari, aile baglari ve nesiller
 * sunucuda tutulur; istemci yalnizca erisimi olan kanala yazabilir. Metin
 * uzunlugu ve yerlesim uygunlugu SUNUCUDA dogrulanir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne, queryAll } from "../db/client";
import { loadState, saveState, type PlayResult } from "./service";
import { areMutualFriends } from "./multiplayer-extras";
import { MAX_MESSAGE_LENGTH, validateMessage, canSendToChannel, canJoinGroup, type ChannelKind, type ChatChannel, type Group } from "../social/social";
import { canMarry, MARRIAGE_MIN_AGE, DAYS_TO_ADULTHOOD, type FamilyMember } from "../family/dynasty";
import { notifyCharacter } from "../notify/notifications";

// --- Sohbet (belge 16.2) ---

export interface ChatMessageView {
  id: string;
  channelKind: string;
  channelScope: string | null;
  senderId: string;
  recipientId: string | null;
  body: string;
  sentAt: number;
}

/**
 * Kanal erisimi: yerel kanal icin karakter o yerlesimde olmali; ozel mesajda
 * hedef karakter var olmali. Genel kanal herkese aciktir.
 */
export async function canAccessChannel(
  db: SqlDatabase,
  characterId: string,
  kind: ChannelKind,
  scopeId: string | null,
): Promise<boolean> {
  const row = await queryOne<{ current_settlement: string | null; allies: number }>(
    db,
    `SELECT c.current_settlement,
            (SELECT COUNT(*) FROM character_social s WHERE s.character_id = c.id AND s.kind IN ('ally','friend')) AS allies
     FROM characters c WHERE c.id = ?`,
    characterId,
  );
  if (!row) return false;
  let guildMember = false;
  let groupMember = false;
  if (kind === "guild") {
    guildMember = (await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM character_guilds WHERE character_id = ?", characterId))!.n > 0;
  } else if (kind === "group") {
    // Grup kanali: yalnizca ilgili grubun uyeleri (belge 16.4).
    groupMember = (await queryOne<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM player_group_members WHERE character_id = ? AND (? IS NULL OR group_id = ?)",
      characterId,
      scopeId,
      scopeId,
    ))!.n > 0;
  }
  const channel: ChatChannel = { id: `${kind}:${scopeId ?? ""}`, kind, scopeId, name: kind };
  // Kanal erisim kurali social/social.ts'te TEK kaynaktir (belge 16.2).
  return canSendToChannel(channel, row.current_settlement, guildMember, groupMember);
}

export interface GroupView {
  id: string;
  name: string;
  leaderCharacterId: string;
  objective: string | null;
  members: string[];
}

/** Oyuncu grubu kurma (belge 16.4): kurucu lider olur; isim dogrulanir. */
export async function performCreateGroup(
  db: SqlDatabase,
  characterId: string,
  name: string,
  objective: string | null,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const safeName = name.trim().slice(0, 40);
  if (safeName.length < 2) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_name" } };
  const existing = await queryOne<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM player_group_members WHERE character_id = ?",
    characterId,
  );
  if ((existing?.n ?? 0) > 0) return { ok: false, error: "invalid_action", state, detail: { reason: "already_in_group" } };
  const id = crypto.randomUUID();
  await execute(
    db,
    "INSERT INTO player_groups (id, name, leader_character_id, objective, created_at) VALUES (?,?,?,?,?)",
    id,
    safeName,
    characterId,
    objective?.slice(0, 80) ?? null,
    nowMs,
  );
  await execute(
    db,
    "INSERT INTO player_group_members (group_id, character_id, joined_at) VALUES (?,?,?)",
    id,
    characterId,
    nowMs,
  );
  return { ok: true, state, detail: { groupId: id, name: safeName, objective } };
}

/** Gruba katilma (belge 16.4): uye siniri sunucuda uygulanir. */
export async function performJoinGroup(
  db: SqlDatabase,
  characterId: string,
  groupId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const group = await queryOne<{ id: string; name: string; leader_character_id: string; objective: string | null }>(
    db,
    "SELECT id, name, leader_character_id, objective FROM player_groups WHERE id = ?",
    groupId,
  );
  if (!group) return { ok: false, error: "invalid_action", state, detail: { reason: "no_group" } };
  const members = await queryAll<{ character_id: string }>(
    db,
    "SELECT character_id FROM player_group_members WHERE group_id = ?",
    groupId,
  );
  const model: Group = {
    id: group.id,
    name: group.name,
    leaderCharacterId: group.leader_character_id,
    members: members.map((m) => m.character_id),
    objective: group.objective,
  };
  if (!canJoinGroup(model)) return { ok: false, error: "invalid_action", state, detail: { reason: "group_full" } };
  await execute(
    db,
    "INSERT OR IGNORE INTO player_group_members (group_id, character_id, joined_at) VALUES (?,?,?)",
    groupId,
    characterId,
    nowMs,
  );
  return { ok: true, state, detail: { groupId, members: model.members.length + 1 } };
}

/** Karakterin grubu (varsa) ve uyeleri. */
export async function groupStatus(db: SqlDatabase, characterId: string): Promise<GroupView | null> {
  const row = await queryOne<{ id: string; name: string; leader_character_id: string; objective: string | null }>(
    db,
    `SELECT g.id, g.name, g.leader_character_id, g.objective
     FROM player_groups g JOIN player_group_members m ON m.group_id = g.id
     WHERE m.character_id = ? LIMIT 1`,
    characterId,
  );
  if (!row) return null;
  const members = await queryAll<{ character_id: string }>(
    db,
    "SELECT character_id FROM player_group_members WHERE group_id = ?",
    row.id,
  );
  return { id: row.id, name: row.name, leaderCharacterId: row.leader_character_id, objective: row.objective, members: members.map((m) => m.character_id) };
}

/** Sohbet gecmisi: kanal + kapsam (yerlesim/hedef) ile son mesajlar. */
export async function listMessages(
  db: SqlDatabase,
  kind: string,
  scopeId: string | null,
  limit = 50,
): Promise<ChatMessageView[]> {
  const rows = await queryAll<{
    id: string;
    channel_kind: string;
    channel_scope: string | null;
    sender_id: string;
    recipient_id: string | null;
    body: string;
    sent_at: number;
  }>(
    db,
    `SELECT id, channel_kind, channel_scope, sender_id, recipient_id, body, sent_at
     FROM chat_log WHERE channel_kind = ? AND (channel_scope IS ? OR channel_scope = ?)
     ORDER BY sent_at DESC LIMIT ?`,
    kind,
    scopeId,
    scopeId,
    Math.max(1, Math.min(100, Math.floor(limit))),
  );
  return rows
    .map((r) => ({
      id: r.id,
      channelKind: r.channel_kind,
      channelScope: r.channel_scope,
      senderId: r.sender_id,
      recipientId: r.recipient_id,
      body: r.body,
      sentAt: r.sent_at,
    }))
    .reverse();
}

/** Mesaj gonderme: uzunluk ve erisim SUNUCUDA; kalici kayit olusur. */
export async function performSendMessage(
  db: SqlDatabase,
  characterId: string,
  kind: ChannelKind,
  scopeId: string | null,
  body: string,
  recipientId: string | null = null,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };

  const invalid = validateMessage(body);
  if (invalid) return { ok: false, error: "invalid_action", state, detail: { reason: invalid } };
  if (!(await canAccessChannel(db, characterId, kind, scopeId))) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "no_access" } };
  }
  if (kind === "direct" && recipientId) {
    const target = await queryOne<{ id: string }>(db, "SELECT id FROM characters WHERE id = ?", recipientId);
    if (!target) return { ok: false, error: "invalid_action", state, detail: { reason: "no_recipient" } };
  }

  await execute(
    db,
    `INSERT INTO chat_log (id, channel_kind, channel_scope, sender_id, recipient_id, body, sent_at)
     VALUES (?,?,?,?,?,?,?)`,
    crypto.randomUUID(),
    kind,
    scopeId,
    characterId,
    kind === "direct" ? recipientId : null,
    body.trim().slice(0, MAX_MESSAGE_LENGTH),
    nowMs,
  );
  if (kind === "direct" && recipientId) {
    await notifyCharacter(db, recipientId, "direct_message", "Yeni ozel mesaj aldiniz.", nowMs);
  }
  return { ok: true, state, detail: { kind, scopeId, length: body.trim().length } };
}

// --- Aile, evlilik, cocuk ve hanedan (belge 7) ---

export interface FamilyView {
  spouseId: string | null;
  spouseName: string | null;
  marriedDay: number | null;
  children: number;
}

export async function familyStatus(db: SqlDatabase, characterId: string): Promise<FamilyView | null> {
  const row = await queryOne<{ spouse_id: string | null; spouse_name: string | null; married_day: number | null; children: number }>(
    db,
    "SELECT spouse_id, spouse_name, married_day, children FROM character_family WHERE character_id = ?",
    characterId,
  );
  return row
    ? { spouseId: row.spouse_id, spouseName: row.spouse_name, marriedDay: row.married_day, children: row.children }
    : null;
}

/**
 * Evlilik: yas ve riza SUNUCUDA. Oyuncu NPC ile veya (karsilikli riza ile)
 * baska oyuncu karakteriyle evlenebilir (belge 7.1).
 */
export async function performMarry(
  db: SqlDatabase,
  characterId: string,
  spouseName: string,
  spouseId: string | null,
  bothConsent: boolean,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };

  const char = await queryOne<{ age_years: number; gender: string | null; given_name: string; surname: string }>(
    db,
    "SELECT age_years, gender, given_name, surname FROM characters WHERE id = ?",
    characterId,
  );
  if (!char) return { ok: false, error: "character_not_found" };

  const self: FamilyMember = {
    id: characterId,
    name: `${char.given_name} ${char.surname}`,
    role: "spouse",
    ageYears: char.age_years,
    alive: true,
    isPlayer: true,
  };
  const spouse: FamilyMember = {
    id: spouseId ?? "npc",
    name: spouseName,
    role: "spouse",
    ageYears: MARRIAGE_MIN_AGE,
    alive: true,
    isPlayer: spouseId !== null,
  };
  if (!canMarry(self, spouse, spouseId === null ? true : bothConsent)) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "marriage_not_allowed" } };
  }

  // Oyuncu-oyuncu evliligi KARSILIKLI RIZA gerektirir (belge 7.1). Riza,
  // iki tarafta da kayitli arkadaslik bagidir (belge 16.3); boylece tek tarafli
  // istekle evlilik kurulamaz. NPC evliliginde bu kapi uygulanmaz.
  if (spouseId && !(await areMutualFriends(db, characterId, spouseId))) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "no_mutual_consent" } };
  }

  const existing = await familyStatus(db, characterId);
  if (existing?.spouseId || existing?.spouseName) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "already_married" } };
  }

  const day = (await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1"))?.game_day ?? 1;
  await execute(
    db,
    `INSERT INTO character_family (character_id, spouse_id, spouse_name, married_day, children, updated_at)
     VALUES (?,?,?,?,0,?)
     ON CONFLICT(character_id) DO UPDATE SET spouse_id=excluded.spouse_id, spouse_name=excluded.spouse_name, married_day=excluded.married_day, updated_at=excluded.updated_at`,
    characterId,
    spouseId,
    spouseName.slice(0, 60),
    day,
    nowMs,
  );
  // Aile kaydi ve uyelik (belge 7.6 hanedan).
  const familyId = crypto.randomUUID();
  await execute(
    db,
    "INSERT INTO families (id, name, crest, founded_at) VALUES (?,?,?,?)",
    familyId,
    `${char.surname} Hanesi`,
    null,
    day,
  );
  await execute(
    db,
    "INSERT OR IGNORE INTO family_members (family_id, character_id, relation, since) VALUES (?,?,?,?)",
    familyId,
    characterId,
    "head",
    day,
  );
  state.reputation += 2;
  await saveState(db, state, nowMs);
  await notifyCharacter(db, characterId, "marriage", `${spouseName} ile evlendiniz.`, nowMs);
  return { ok: true, state, detail: { spouseName, marriedDay: day, familyId } };
}

/**
 * Cocuk sahibi olma (belge 7.2): es ve uygun yas gerekir. Cocuk sayisi artar;
 * yetiskinlige gecis gercek gun cinsinden izlenir (belge 7.5).
 */
export async function performHaveChild(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const family = await familyStatus(db, characterId);
  if (!family?.spouseId && !family?.spouseName) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "no_spouse" } };
  }
  const char = await queryOne<{ age_years: number }>(db, "SELECT age_years FROM characters WHERE id = ?", characterId);
  if ((char?.age_years ?? 0) < MARRIAGE_MIN_AGE) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "too_young" } };
  }
  const children = family.children + 1;
  await execute(db, "UPDATE character_family SET children = ?, updated_at = ? WHERE character_id = ?", children, nowMs, characterId);
  state.reputation += 1;
  await saveState(db, state, nowMs);
  await notifyCharacter(db, characterId, "family_growth", `Hanedanin uye sayisi ${children} cocuga ulasti.`, nowMs);
  return { ok: true, state, detail: { children, adulthoodRealDays: DAYS_TO_ADULTHOOD } };
}

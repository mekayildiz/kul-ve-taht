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
import { MAX_MESSAGE_LENGTH, validateMessage, type ChannelKind } from "../social/social";
import { canMarry, MARRIAGE_MIN_AGE, DAYS_TO_ADULTHOOD, type FamilyMember } from "../family/dynasty";
import { createNotification, type NotificationKind } from "../notify/notifications";

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
  if (kind === "global" || kind === "direct") return true;
  if (kind === "local") {
    const row = await queryOne<{ current_settlement: string | null }>(
      db,
      "SELECT current_settlement FROM characters WHERE id = ?",
      characterId,
    );
    return Boolean(scopeId) && row?.current_settlement === scopeId;
  }
  // guild/group uyeligi bu surumde karakter_social uzerinden dogrulanir.
  if (kind === "guild" || kind === "group") {
    const row = await queryOne<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM character_social WHERE character_id = ? AND kind IN ('ally','friend')",
      characterId,
    );
    return (row?.n ?? 0) > 0;
  }
  return false;
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

// --- Bildirim yayma (belge 19) ---

/**
 * Bir karakterin hesabina bildirim yazar. Tur ve oncelik notify/notifications
 * modulundeki KIND_PRIORITY tablosundan gelir; arka plan turleri (oncelik 0)
 * varsayilan olarak ozette gizlenir.
 */
export async function notifyCharacter(
  db: SqlDatabase,
  characterId: string,
  kind: NotificationKind,
  summary: string,
  nowMs = Date.now(),
): Promise<void> {
  const owner = await queryOne<{ account_id: string }>(db, "SELECT account_id FROM characters WHERE id = ?", characterId);
  if (!owner) return;
  const notification = createNotification(kind, summary.slice(0, 200), nowMs);
  await execute(
    db,
    `INSERT INTO player_notifications (id, account_id, kind, priority, summary, read, created_at)
     VALUES (?,?,?,?,?,0,?)`,
    notification.id,
    owner.account_id,
    notification.kind,
    notification.priority,
    notification.summary,
    notification.createdAtMs,
  );
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

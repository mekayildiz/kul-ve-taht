/**
 * Yonetim panelinden uye islemleri: para, esya ve nitelik verme/duzeltme
 * (tasarim belgesi 20).
 *
 * Ilkeler (belge 21.1):
 *  - Tum degerler SUNUCUDA dogrulanir ve kirpilir; istemci miktar otoritesi
 *    degildir.
 *  - Her islem `audit_log`'a yazilir (kim, kime, ne kadar, hangi sebeple).
 *  - Karakter oynanis durumu `character_state` (JSON) uzerinden guncellenir.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";
import { itemDef } from "../inventory/items";
import { ATTRIBUTE_KEYS, ATTRIBUTE_MIN, ATTRIBUTE_MAX, type AttributeKey } from "../character/attributes";

/** Admin islemlerinde kabul edilen ust sinirlar (kotu niyetli/sinirli giris). */
export const ADMIN_MAX_GOLD_DELTA = 1_000_000;
export const ADMIN_MAX_ITEM_QUANTITY = 10_000;
export const ADMIN_MAX_GOLD_TOTAL = 100_000_000;

export type GrantError = "not_found" | "invalid_amount" | "invalid_item" | "invalid_attribute";

export interface GrantResult {
  ok: boolean;
  error?: GrantError;
  /** Islem sonrasi ilgili deger (para/nitelik) ya da ozet. */
  value?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function writeAudit(
  db: SqlDatabase,
  actorAccountId: string | null,
  action: string,
  characterId: string,
  detail: Record<string, unknown>,
  nowMs: number,
): Promise<void> {
  await execute(
    db,
    "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    actorAccountId,
    action,
    "character",
    characterId,
    JSON.stringify(detail),
    nowMs,
  );
}

/** Karakterin var oldugunu dogrular; oynanis durumu yoksa olusturur. */
async function ensureState(db: SqlDatabase, characterId: string, nowMs: number): Promise<boolean> {
  const character = await queryOne<{ id: string }>(db, "SELECT id FROM characters WHERE id = ?", characterId);
  if (!character) return false;
  const state = await queryOne<{ character_id: string }>(
    db,
    "SELECT character_id FROM character_state WHERE character_id = ?",
    characterId,
  );
  if (!state) {
    await execute(
      db,
      `INSERT INTO character_state (character_id, health_json, inventory_json, gold, updated_at)
       VALUES (?,?,?,?,?)`,
      characterId,
      JSON.stringify({ health: 100, hunger: 0, fatigue: 0, injuries: [], diseases: [], alive: true, permanentConditions: [] }),
      JSON.stringify([
        { itemId: "bread", quantity: 3, condition: 1 },
        { itemId: "bandage", quantity: 2, condition: 1 },
      ]),
      20,
      nowMs,
    );
  }
  return true;
}

/** Para ekler/cikarir (delta). Toplam 0..ADMIN_MAX_GOLD_TOTAL araligina kirpilir. */
export async function adminGrantGold(
  db: SqlDatabase,
  characterId: string,
  delta: number,
  actorAccountId: string | null = null,
  nowMs = Date.now(),
): Promise<GrantResult> {
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || Math.abs(delta) > ADMIN_MAX_GOLD_DELTA) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!(await ensureState(db, characterId, nowMs))) return { ok: false, error: "not_found" };
  const row = await queryOne<{ gold: number }>(db, "SELECT gold FROM character_state WHERE character_id = ?", characterId);
  const before = row?.gold ?? 0;
  const after = clamp(before + delta, 0, ADMIN_MAX_GOLD_TOTAL);
  await execute(db, "UPDATE character_state SET gold = ?, updated_at = ? WHERE character_id = ?", after, nowMs, characterId);
  await writeAudit(db, actorAccountId, "admin_grant_gold", characterId, { before, delta, after }, nowMs);
  return { ok: true, value: after };
}

/** Envanter JSON'unda esya ekler (yiginlari birlestirir). Kapasite kontrolu YOK. */
export async function adminGrantItem(
  db: SqlDatabase,
  characterId: string,
  itemId: string,
  quantity: number,
  actorAccountId: string | null = null,
  nowMs = Date.now(),
): Promise<GrantResult> {
  const def = itemDef(itemId);
  if (!def) return { ok: false, error: "invalid_item" };
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > ADMIN_MAX_ITEM_QUANTITY) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!(await ensureState(db, characterId, nowMs))) return { ok: false, error: "not_found" };
  const row = await queryOne<{ inventory_json: string }>(
    db,
    "SELECT inventory_json FROM character_state WHERE character_id = ?",
    characterId,
  );
  const entries = JSON.parse(row?.inventory_json ?? "[]") as { itemId: string; quantity: number; condition: number }[];
  const existing = entries.find((e) => e.itemId === itemId);
  if (existing) existing.quantity += quantity;
  else entries.push({ itemId, quantity, condition: def.maxDurability });
  await execute(
    db,
    "UPDATE character_state SET inventory_json = ?, updated_at = ? WHERE character_id = ?",
    JSON.stringify(entries),
    nowMs,
    characterId,
  );
  await writeAudit(db, actorAccountId, "admin_grant_item", characterId, { itemId, quantity }, nowMs);
  return { ok: true, value: quantity };
}

/** Envanter JSON'undan esya cikarir. Yetersizse reddeder. */
export async function adminRevokeItem(
  db: SqlDatabase,
  characterId: string,
  itemId: string,
  quantity: number,
  actorAccountId: string | null = null,
  nowMs = Date.now(),
): Promise<GrantResult> {
  if (!itemDef(itemId)) return { ok: false, error: "invalid_item" };
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > ADMIN_MAX_ITEM_QUANTITY) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!(await ensureState(db, characterId, nowMs))) return { ok: false, error: "not_found" };
  const row = await queryOne<{ inventory_json: string }>(
    db,
    "SELECT inventory_json FROM character_state WHERE character_id = ?",
    characterId,
  );
  const entries = JSON.parse(row?.inventory_json ?? "[]") as { itemId: string; quantity: number; condition: number }[];
  const total = entries.filter((e) => e.itemId === itemId).reduce((s, e) => s + e.quantity, 0);
  if (total < quantity) return { ok: false, error: "invalid_amount" };
  let remaining = quantity;
  const next: typeof entries = [];
  for (const entry of entries) {
    if (entry.itemId !== itemId || remaining <= 0) {
      next.push(entry);
      continue;
    }
    const take = Math.min(entry.quantity, remaining);
    remaining -= take;
    if (entry.quantity - take > 0) next.push({ ...entry, quantity: entry.quantity - take });
  }
  await execute(
    db,
    "UPDATE character_state SET inventory_json = ?, updated_at = ? WHERE character_id = ?",
    JSON.stringify(next),
    nowMs,
    characterId,
  );
  await writeAudit(db, actorAccountId, "admin_revoke_item", characterId, { itemId, quantity }, nowMs);
  return { ok: true, value: quantity };
}

export interface CharacterAttributeRow {
  strength: number;
  agility: number;
  endurance: number;
  intellect: number;
  charisma: number;
  perception: number;
  leadership: number;
}

/** Karakterin yedi niteligini doner (yoksa varsayilan 5). */
export async function adminGetAttributes(db: SqlDatabase, characterId: string): Promise<CharacterAttributeRow | null> {
  const character = await queryOne<{ id: string }>(db, "SELECT id FROM characters WHERE id = ?", characterId);
  if (!character) return null;
  const row = await queryOne<CharacterAttributeRow>(
    db,
    "SELECT strength, agility, endurance, intellect, charisma, perception, leadership FROM character_attributes WHERE character_id = ?",
    characterId,
  );
  return (
    row ?? { strength: 5, agility: 5, endurance: 5, intellect: 5, charisma: 5, perception: 5, leadership: 5 }
  );
}

/** Bir niteligi mutlak degere ayarlar (1..20). Nitelik satiri yoksa olusturur. */
export async function adminSetAttribute(
  db: SqlDatabase,
  characterId: string,
  attribute: string,
  value: number,
  actorAccountId: string | null = null,
  nowMs = Date.now(),
): Promise<GrantResult> {
  if (!(ATTRIBUTE_KEYS as readonly string[]).includes(attribute)) return { ok: false, error: "invalid_attribute" };
  if (!Number.isInteger(value)) return { ok: false, error: "invalid_amount" };
  const character = await queryOne<{ id: string }>(db, "SELECT id FROM characters WHERE id = ?", characterId);
  if (!character) return { ok: false, error: "not_found" };
  const clamped = clamp(value, ATTRIBUTE_MIN, ATTRIBUTE_MAX);
  const key = attribute as AttributeKey;

  const existing = await queryOne<{ character_id: string }>(
    db,
    "SELECT character_id FROM character_attributes WHERE character_id = ?",
    characterId,
  );
  if (!existing) {
    await execute(
      db,
      `INSERT INTO character_attributes (character_id, strength, agility, endurance, intellect, charisma, perception, leadership)
       VALUES (?,?,?,?,?,?,?,?)`,
      characterId,
      5,
      5,
      5,
      5,
      5,
      5,
      5,
    );
  }
  const before = await queryOne<Record<string, number>>(
    db,
    "SELECT strength, agility, endurance, intellect, charisma, perception, leadership FROM character_attributes WHERE character_id = ?",
    characterId,
  );
  // Sutun adi ATTRIBUTE_KEYS icinden geldigi icin enjeksiyon riski yoktur.
  await execute(db, `UPDATE character_attributes SET ${key} = ? WHERE character_id = ?`, clamped, characterId);
  await writeAudit(
    db,
    actorAccountId,
    "admin_set_attribute",
    characterId,
    { attribute, before: before?.[key] ?? null, after: clamped },
    nowMs,
  );
  return { ok: true, value: clamped };
}

/** Saglik/enerji/itibar gibi canli durum alanlarini duzeltir. */
export async function adminAdjustVitals(
  db: SqlDatabase,
  characterId: string,
  changes: { health?: number; energy?: number; reputation?: number; hunger?: number; fatigue?: number },
  actorAccountId: string | null = null,
  nowMs = Date.now(),
): Promise<GrantResult> {
  if (!(await ensureState(db, characterId, nowMs))) return { ok: false, error: "not_found" };
  const row = await queryOne<{ health_json: string; energy: number; reputation: number }>(
    db,
    "SELECT health_json, energy, reputation FROM character_state WHERE character_id = ?",
    characterId,
  );
  const health = JSON.parse(row?.health_json ?? "{}") as Record<string, unknown>;
  if (typeof changes.health === "number") health.health = clamp(Math.round(changes.health), 0, 100);
  if (typeof changes.hunger === "number") health.hunger = clamp(Math.round(changes.hunger), 0, 100);
  if (typeof changes.fatigue === "number") health.fatigue = clamp(Math.round(changes.fatigue), 0, 100);
  const energy = typeof changes.energy === "number" ? clamp(Math.round(changes.energy), 0, 100) : (row?.energy ?? 100);
  const reputation =
    typeof changes.reputation === "number" ? clamp(Math.round(changes.reputation), -1000, 1000) : (row?.reputation ?? 0);
  await execute(
    db,
    "UPDATE character_state SET health_json = ?, energy = ?, reputation = ?, updated_at = ? WHERE character_id = ?",
    JSON.stringify(health),
    energy,
    reputation,
    nowMs,
    characterId,
  );
  await writeAudit(db, actorAccountId, "admin_adjust_vitals", characterId, { changes }, nowMs);
  return { ok: true, value: energy };
}

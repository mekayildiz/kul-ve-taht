/**
 * Mulk tamamlayicilari: kira, haciz ve tapu uyusmazligi oynanis servisi
 * (tasarim belgesi 9.3, 20).
 *
 * Belge 20: "mulkiyet, isletme, calisan, ortaklik, acik artirma ve miras"
 * sistemleri tamamlanir. Kira/vergi/haciz hesaplari SUNUCUDA yapilir;
 * istemci miktar otoritesi degildir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { loadState, saveState, type PlayResult } from "./service";
import { monthlyRent, rentAfterTax, type Rental } from "../economy/extras";

async function gameDay(db: SqlDatabase): Promise<number> {
  const row = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return row?.game_day ?? 1;
}

export interface RentalView {
  id: string;
  propertyId: string;
  monthlyRate: number;
  occupancy: number;
  status: "active" | "vacant" | "ended";
  monthlyIncome: number;
  netIncome: number;
}

/** Kiralari listeler; aylik gelir ve vergi sonrasi net hesaplanir. */
export async function rentalList(db: SqlDatabase, characterId: string): Promise<RentalView[]> {
  const rows = await queryAll<{
    id: string;
    property_id: string;
    monthly_rate: number;
    occupancy: number;
    status: RentalView["status"];
  }>(
    db,
    "SELECT id, property_id, monthly_rate, occupancy, status FROM property_rentals WHERE owner_id = ? ORDER BY status",
    characterId,
  );
  const out: RentalView[] = [];
  for (const row of rows) {
    const prop = await queryOne<{ value: number }>(db, "SELECT value FROM character_properties WHERE id = ?", row.property_id);
    const value = prop?.value ?? 0;
    const rental: Rental = { propertyValue: value, monthlyRate: row.monthly_rate };
    const gross = monthlyRent(rental, row.occupancy);
    out.push({
      id: row.id,
      propertyId: row.property_id,
      monthlyRate: row.monthly_rate,
      occupancy: row.occupancy,
      status: row.status,
      monthlyIncome: gross,
      netIncome: rentAfterTax(gross, 0.1),
    });
  }
  return out;
}

/** Bir mulku kiraya verir (belge 9.3). */
export async function performListForRent(
  db: SqlDatabase,
  characterId: string,
  propertyId: string,
  monthlyRate: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const prop = await queryOne<{ id: string }>(db, "SELECT id FROM character_properties WHERE id = ? AND character_id = ?", propertyId, characterId);
  if (!prop) return { ok: false, error: "not_found", state };
  const rate = Math.max(0.5, Math.min(10, monthlyRate));
  const day = await gameDay(db);
  const existing = await queryOne<{ id: string }>(db, "SELECT id FROM property_rentals WHERE property_id = ? AND status IN ('active','vacant')", propertyId);
  if (existing) return { ok: false, error: "invalid_action", state, detail: { reason: "already_listed" } };
  await execute(
    db,
    "INSERT INTO property_rentals (id, property_id, owner_id, tenant_id, monthly_rate, occupancy, last_paid_day, status, created_at) VALUES (?,?,?,NULL,?,1,?, 'vacant', ?)",
    crypto.randomUUID(),
    propertyId,
    characterId,
    rate,
    day,
    nowMs,
  );
  return { ok: true, state, detail: { propertyId, monthlyRate: rate } };
}

/**
 * Kira gelirini toplar (belge 9.3): son tahsilattan bu yana gecen aylar
 * kadar gelir; vergi dusulur. Ayni gun icin TEKRAR odenmez (idempotent).
 */
export async function performCollectRent(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const day = await gameDay(db);
  const rows = await queryAll<{
    id: string;
    property_id: string;
    monthly_rate: number;
    occupancy: number;
    last_paid_day: number;
  }>(
    db,
    "SELECT id, property_id, monthly_rate, occupancy, last_paid_day FROM property_rentals WHERE owner_id = ? AND status = 'active'",
    characterId,
  );
  if (rows.length === 0) return { ok: false, error: "invalid_action", state, detail: { reason: "no_active_rental" } };
  let total = 0;
  for (const row of rows) {
    const months = Math.floor((day - row.last_paid_day) / 30);
    if (months <= 0) continue;
    const prop = await queryOne<{ value: number }>(db, "SELECT value FROM character_properties WHERE id = ?", row.property_id);
    const rental: Rental = { propertyValue: prop?.value ?? 0, monthlyRate: row.monthly_rate };
    const gross = monthlyRent(rental, row.occupancy) * months;
    const net = rentAfterTax(gross, 0.1);
    total += net;
    await execute(db, "UPDATE property_rentals SET last_paid_day = ? WHERE id = ?", row.last_paid_day + months * 30, row.id);
  }
  if (total <= 0) return { ok: false, error: "invalid_action", state, detail: { reason: "nothing_due" } };
  state.gold += total;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { collected: total } };
}

/**
 * Haciz (foreclosure) (belge 9.3, 20): odenmemis vergi/borc karsiliginda
 * mulk el konur ve degeri borca mahsup edilir. Borc kapatilir.
 */
export async function performForeclose(
  db: SqlDatabase,
  characterId: string,
  propertyId: string,
  debt: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const prop = await queryOne<{ id: string; value: number }>(
    db,
    "SELECT id, value FROM character_properties WHERE id = ? AND character_id = ?",
    propertyId,
    characterId,
  );
  if (!prop) return { ok: false, error: "not_found", state };
  const owed = Math.max(1, Math.floor(debt));
  // Mulk degeri borcu karsilar; artan miktar altin olarak borcluya kalir.
  const recovered = Math.min(prop.value, owed);
  const surplus = Math.max(0, prop.value - owed);
  await execute(db, "DELETE FROM character_properties WHERE id = ?", propertyId);
  await execute(db, "UPDATE property_rentals SET status = 'ended' WHERE property_id = ?", propertyId);
  state.gold += surplus;
  state.debts = Math.max(0, state.debts - recovered);
  await saveState(db, state, nowMs);
  const day = await gameDay(db);
  await execute(
    db,
    "INSERT INTO foreclosures (id, property_id, owner_id, reason, debt, recovered, game_day, created_at) VALUES (?,?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    propertyId,
    characterId,
    "tax_debt",
    owed,
    recovered,
    day,
    nowMs,
  );
  return { ok: true, state, detail: { propertyId, recovered, surplus } };
}

/** Mulk vergisi borcunu odemezse otomatik haciz icin kullanilir. */
export async function autoForecloseForTaxes(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const props = await queryAll<{ id: string; value: number; tax_rate: number }>(
    db,
    "SELECT id, value, tax_rate FROM character_properties WHERE character_id = ? ORDER BY value ASC",
    characterId,
  );
  if (props.length === 0) return { ok: false, error: "invalid_action", state, detail: { reason: "no_property" } };
  const due = props.reduce((s, p) => s + Math.round(p.value * p.tax_rate), 0);
  if (state.gold >= due) return { ok: false, error: "invalid_action", state, detail: { reason: "can_afford", due } };
  // En dusuk degerli mulk haczedilir (belge 9.3).
  const target = props[0]!;
  return performForeclose(db, characterId, target.id, due, nowMs);
}

export interface TitleDisputeView {
  id: string;
  propertyId: string;
  claimantA: string;
  claimantB: string;
  status: "open" | "resolved_a" | "resolved_b" | "dismissed";
}

export async function titleDisputeList(db: SqlDatabase, characterId: string): Promise<TitleDisputeView[]> {
  const rows = await queryAll<{
    id: string;
    property_id: string;
    claimant_a: string;
    claimant_b: string;
    status: TitleDisputeView["status"];
  }>(
    db,
    "SELECT id, property_id, claimant_a, claimant_b, status FROM title_disputes WHERE (claimant_a = ? OR claimant_b = ?) AND status = 'open' ORDER BY created_at DESC",
    characterId,
    characterId,
  );
  return rows.map((r) => ({ id: r.id, propertyId: r.property_id, claimantA: r.claimant_a, claimantB: r.claimant_b, status: r.status }));
}

/** Tapu uyusmazligi acar (belge 20): iki taraf ayni mulk uzerinde hak iddia eder. */
export async function performOpenTitleDispute(
  db: SqlDatabase,
  characterId: string,
  propertyId: string,
  claimantB: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  if (claimantB === characterId) return { ok: false, error: "invalid_action", state, detail: { reason: "self_dispute" } };
  const prop = await queryOne<{ id: string; character_id: string }>(db, "SELECT id, character_id FROM character_properties WHERE id = ?", propertyId);
  if (!prop) return { ok: false, error: "not_found", state };
  if (prop.character_id !== characterId && prop.character_id !== claimantB) {
    return { ok: false, error: "forbidden", state, detail: { reason: "not_a_party" } };
  }
  const day = await gameDay(db);
  await execute(
    db,
    "INSERT INTO title_disputes (id, property_id, claimant_a, claimant_b, status, game_day, created_at) VALUES (?,?,?,?, 'open', ?, ?)",
    crypto.randomUUID(),
    propertyId,
    characterId,
    claimantB,
    day,
    nowMs,
  );
  return { ok: true, state, detail: { propertyId } };
}

/**
 * Tapu uyusmazligini cozer (belge 20): hakem itibara gore kazanani belirler.
 * Karar SUNUCUDA verilir; istemci kazanan secemez.
 */
export async function performResolveTitleDispute(
  db: SqlDatabase,
  characterId: string,
  disputeId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const dispute = await queryOne<{
    id: string;
    property_id: string;
    claimant_a: string;
    claimant_b: string;
    status: TitleDisputeView["status"];
  }>(db, "SELECT id, property_id, claimant_a, claimant_b, status FROM title_disputes WHERE id = ?", disputeId);
  if (!dispute) return { ok: false, error: "not_found", state };
  if (dispute.status !== "open") return { ok: false, error: "invalid_action", state, detail: { reason: "already_resolved" } };
  const repA = await queryOne<{ reputation: number }>(db, "SELECT reputation FROM character_state WHERE character_id = ?", dispute.claimant_a);
  const repB = await queryOne<{ reputation: number }>(db, "SELECT reputation FROM character_state WHERE character_id = ?", dispute.claimant_b);
  const winner = (repA?.reputation ?? 0) >= (repB?.reputation ?? 0) ? dispute.claimant_a : dispute.claimant_b;
  const status = winner === dispute.claimant_a ? "resolved_a" : "resolved_b";
  await execute(db, "UPDATE title_disputes SET status = ?, resolved_by = ? WHERE id = ?", status, winner, disputeId);
  // Mulk kazanana gecir.
  await execute(db, "UPDATE character_properties SET character_id = ? WHERE id = ?", winner, dispute.property_id);
  return { ok: true, state, detail: { winner, status } };
}

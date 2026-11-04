/**
 * Sirket, ortaklik, hisse, birlesme/devralma ve isletme oynanis servisi
 * (tasarim belgesi 20, 9.x).
 *
 * Belge 20: "Karmasik sirket hisseleri, birlesme/devralma ve kurumsal
 * burokrasi ... nihai oyun hedefinin parcasidir." Ayrica "isletmeler,
 * calisanlar, sube agi ve isletmeler arasi ortakliklar desteklenir."
 *
 * Saf mantik `economy/property.ts` icindedir (tek kaynak); bu dosya yalnizca
 * KALICI duruma baglar. Tum dogrulamalar SUNUCUDA yapilir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { loadState, saveState, type PlayResult } from "./service";
import {
  branchNetworkIncome,
  canAcquire,
  companyValuation,
  controllingPartner,
  distributeProfit,
  mergeCompanies,
  payroll,
  staffEfficiency,
  validPartnership,
  type Branch,
  type Company,
  type Employee,
  type Partner,
  type Property,
  type PropertyType,
} from "../economy/property";

async function gameDay(db: SqlDatabase): Promise<number> {
  const row = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return row?.game_day ?? 1;
}

export interface CompanyView {
  id: string;
  name: string;
  capital: number;
  partners: Partner[];
  controllingPartnerId: string | null;
  valuation: number;
  employees: number;
  branches: number;
  dailyPayroll: number;
}

async function loadCompany(db: SqlDatabase, companyId: string): Promise<Company | null> {
  const row = await queryOne<{ id: string; name: string; capital: number }>(
    db,
    "SELECT id, name, capital FROM companies WHERE id = ?",
    companyId,
  );
  if (!row) return null;
  const partnerRows = await queryAll<{ owner_id: string; owner_type: Partner["ownerType"]; share: number }>(
    db,
    "SELECT owner_id, owner_type, share FROM company_partners WHERE company_id = ? ORDER BY share DESC",
    companyId,
  );
  const propRows = await queryAll<{ id: string }>(db, "SELECT id FROM company_properties WHERE company_id = ?", companyId);
  return {
    id: row.id,
    name: row.name,
    capital: row.capital,
    partners: partnerRows.map((p) => ({ ownerId: p.owner_id, ownerType: p.owner_type, share: p.share })),
    propertyIds: propRows.map((p) => p.id),
  };
}

async function loadCompanyProperties(db: SqlDatabase, companyId: string): Promise<Property[]> {
  const rows = await queryAll<{
    id: string;
    settlement_id: string | null;
    property_type: PropertyType;
    value: number;
    tax_rate: number;
  }>(db, "SELECT id, settlement_id, property_type, value, tax_rate FROM company_properties WHERE company_id = ?", companyId);
  return rows.map((r) => ({
    id: r.id,
    settlementId: r.settlement_id ?? "",
    propertyType: r.property_type,
    ownerType: "company",
    ownerId: companyId,
    value: r.value,
    taxRate: r.tax_rate,
  }));
}

async function companyEmployees(db: SqlDatabase, companyId: string): Promise<Employee[]> {
  const rows = await queryAll<{ id: string; name: string; wage: number; skill: number }>(
    db,
    "SELECT id, name, wage, skill FROM company_employees WHERE company_id = ?",
    companyId,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, wage: r.wage, skill: r.skill }));
}

async function companyBranches(db: SqlDatabase, companyId: string): Promise<Branch[]> {
  const rows = await queryAll<{ id: string; settlement_id: string; upkeep: number }>(
    db,
    "SELECT id, settlement_id, upkeep FROM company_branches WHERE company_id = ?",
    companyId,
  );
  return rows.map((r) => ({ id: r.id, companyId, settlementId: r.settlement_id, upkeep: r.upkeep }));
}

/** Karakterin kurdugu veya ortak oldugu sirketleri doner. */
export async function companyList(db: SqlDatabase, characterId: string): Promise<CompanyView[]> {
  const rows = await queryAll<{ company_id: string }>(
    db,
    "SELECT company_id FROM company_partners WHERE owner_id = ?",
    characterId,
  );
  const out: CompanyView[] = [];
  for (const row of rows) {
    const view = await companyDetail(db, row.company_id);
    if (view) out.push(view);
  }
  return out;
}

export async function companyDetail(db: SqlDatabase, companyId: string): Promise<CompanyView | null> {
  const company = await loadCompany(db, companyId);
  if (!company) return null;
  const props = await loadCompanyProperties(db, companyId);
  const employees = await companyEmployees(db, companyId);
  const branches = await companyBranches(db, companyId);
  const controlling = controllingPartner(company.partners);
  return {
    id: company.id,
    name: company.name,
    capital: company.capital,
    partners: company.partners,
    controllingPartnerId: controlling?.ownerId ?? null,
    valuation: companyValuation(company, props),
    employees: employees.length,
    branches: branches.length,
    dailyPayroll: payroll(employees),
  };
}

/** Sirket kurma (belge 20): kurucu tum sermayeyi koyar, tek ortak olur. */
export async function performFoundCompany(
  db: SqlDatabase,
  characterId: string,
  name: string,
  capital: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 40) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_name" } };
  }
  const value = Math.floor(capital);
  if (!Number.isFinite(value) || value < 100) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "capital_too_low" } };
  }
  if (state.gold < value) return { ok: false, error: "not_enough_gold", state, detail: { required: value } };
  const existing = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM companies WHERE name = ?",
    trimmed,
  );
  if (existing) return { ok: false, error: "invalid_action", state, detail: { reason: "name_taken" } };

  const id = crypto.randomUUID();
  await execute(db, "INSERT INTO companies (id, name, capital, founder_id, created_at) VALUES (?,?,?,?,?)", id, trimmed, value, characterId, nowMs);
  await execute(
    db,
    "INSERT INTO company_partners (company_id, owner_id, owner_type, share, joined_at) VALUES (?,?, 'character', 100, ?)",
    id,
    characterId,
    nowMs,
  );
  state.gold -= value;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { companyId: id, capital: value } };
}

/** Ortagi sermaye ile ekler/payini gunceller (belge 20). */
export async function performAddPartner(
  db: SqlDatabase,
  actorId: string,
  companyId: string,
  partnerId: string,
  share: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, actorId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const company = await loadCompany(db, companyId);
  if (!company) return { ok: false, error: "not_found", state };
  const controlling = controllingPartner(company.partners);
  // Yalnizca kontrol payina sahip ortak yeni ortak ekleyebilir.
  if (controlling?.ownerId !== actorId) {
    return { ok: false, error: "forbidden", state, detail: { reason: "not_controlling_partner" } };
  }
  const value = Math.round(share * 100) / 100;
  if (value <= 0 || value >= 100) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_share" } };
  const next = company.partners.map((p) => ({ ...p }));
  const target = next.find((p) => p.ownerId === partnerId);
  const controller = next.find((p) => p.ownerId === actorId)!;
  if (target) {
    const delta = value - target.share;
    target.share = value;
    controller.share = Math.round((controller.share - delta) * 100) / 100;
  } else {
    controller.share = Math.round((controller.share - value) * 100) / 100;
    next.push({ ownerId: partnerId, ownerType: "character", share: value });
  }
  if (!validPartnership(next)) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_partnership" } };
  await execute(db, "DELETE FROM company_partners WHERE company_id = ?", companyId);
  for (const p of next) {
    await execute(
      db,
      "INSERT INTO company_partners (company_id, owner_id, owner_type, share, joined_at) VALUES (?,?,?,?,?)",
      companyId,
      p.ownerId,
      p.ownerType,
      p.share,
      nowMs,
    );
  }
  return { ok: true, state, detail: { companyId, partners: next.length } };
}

/** Sirket kâr dagitimi: kontrol ortagi tetikler (belge 20). */
export async function performDistributeProfit(
  db: SqlDatabase,
  actorId: string,
  companyId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, actorId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const company = await loadCompany(db, companyId);
  if (!company) return { ok: false, error: "not_found", state };
  const controlling = controllingPartner(company.partners);
  if (controlling?.ownerId !== actorId) return { ok: false, error: "forbidden", state, detail: { reason: "not_controlling_partner" } };

  const props = await loadCompanyProperties(db, companyId);
  const employees = await companyEmployees(db, companyId);
  const branches = await companyBranches(db, companyId);
  const valuation = companyValuation(company, props);
  const marketFactor = 1;
  const efficiency = staffEfficiency(employees);
  const gross = Math.round(valuation * 0.05 * efficiency) + branchNetworkIncome(branches, marketFactor);
  const costs = payroll(employees) * 30;
  const profit = Math.max(0, gross - costs);
  if (profit <= 0) return { ok: false, error: "invalid_action", state, detail: { reason: "no_profit", gross, costs } };

  const payouts = distributeProfit(company.partners, profit);
  // Sermaye kâr kadar artar; ortaklara nakit dagitilir.
  for (const [ownerId, amount] of Object.entries(payouts)) {
    if (amount <= 0) continue;
    if (ownerId === actorId) {
      state.gold += amount;
    } else {
      const partnerState = await loadState(db, ownerId, nowMs);
      if (partnerState) {
        partnerState.gold += amount;
        await saveState(db, partnerState, nowMs);
      }
    }
  }
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { profit, payouts } };
}

/** Birlesme/devralma: alici degeri karsilayabiliyorsa hedefi devralir (belge 20). */
export async function performAcquireCompany(
  db: SqlDatabase,
  actorId: string,
  targetCompanyId: string,
  allPartnersAgree: boolean,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, actorId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const target = await loadCompany(db, targetCompanyId);
  if (!target) return { ok: false, error: "not_found", state };
  const acquirerRow = await queryOne<{ id: string }>(
    db,
    "SELECT company_id AS id FROM company_partners WHERE owner_id = ? AND share >= 50 LIMIT 1",
    actorId,
  );
  if (!acquirerRow) return { ok: false, error: "forbidden", state, detail: { reason: "no_company_control" } };
  const acquirer = await loadCompany(db, acquirerRow.id);
  if (!acquirer) return { ok: false, error: "not_found", state };
  const targetProps = await loadCompanyProperties(db, targetCompanyId);
  if (!canAcquire(acquirer.capital, target, targetProps, allPartnersAgree)) {
    return { ok: false, error: "invalid_action", state, detail: { reason: "cannot_acquire" } };
  }
  const valuation = companyValuation(target, targetProps);
  const merged = mergeCompanies(acquirer, target, targetProps, actorId);
  await execute(db, "UPDATE companies SET capital = ? WHERE id = ?", merged.capital, acquirer.id);
  // Hedefin mulk ve subelerini aliciya tasi.
  await execute(db, "UPDATE company_properties SET company_id = ? WHERE company_id = ?", acquirer.id, targetCompanyId);
  await execute(db, "UPDATE company_branches SET company_id = ? WHERE company_id = ?", acquirer.id, targetCompanyId);
  await execute(db, "UPDATE company_employees SET company_id = ? WHERE company_id = ?", acquirer.id, targetCompanyId);
  await execute(db, "DELETE FROM company_partners WHERE company_id = ?", targetCompanyId);
  await execute(db, "DELETE FROM companies WHERE id = ?", targetCompanyId);
  const day = await gameDay(db);
  await execute(
    db,
    "INSERT INTO company_mergers (id, acquirer_id, target_id, valuation, game_day, created_at) VALUES (?,?,?,?,?,?)",
    crypto.randomUUID(),
    acquirer.id,
    targetCompanyId,
    valuation,
    day,
    nowMs,
  );
  return { ok: true, state, detail: { acquirerId: acquirer.id, valuation } };
}

/** Calisan ise alma (belge 20). */
export async function performHireEmployee(
  db: SqlDatabase,
  actorId: string,
  companyId: string,
  name: string,
  wage: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, actorId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const company = await loadCompany(db, companyId);
  if (!company) return { ok: false, error: "not_found", state };
  const controlling = controllingPartner(company.partners);
  if (controlling?.ownerId !== actorId) return { ok: false, error: "forbidden", state, detail: { reason: "not_controlling_partner" } };
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, error: "invalid_action", state, detail: { reason: "invalid_name" } };
  const pay = Math.max(1, Math.min(100, Math.floor(wage)));
  await execute(
    db,
    "INSERT INTO company_employees (id, company_id, name, wage, skill, hired_at) VALUES (?,?,?,?,20,?)",
    crypto.randomUUID(),
    companyId,
    trimmed,
    pay,
    nowMs,
  );
  return { ok: true, state, detail: { companyId, wage: pay } };
}

/** Sube acma (belge 20): pazar buyuklugune gore sabit gider. */
export async function performOpenBranch(
  db: SqlDatabase,
  actorId: string,
  companyId: string,
  settlementId: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, actorId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const company = await loadCompany(db, companyId);
  if (!company) return { ok: false, error: "not_found", state };
  const controlling = controllingPartner(company.partners);
  if (controlling?.ownerId !== actorId) return { ok: false, error: "forbidden", state, detail: { reason: "not_controlling_partner" } };
  const settlement = await queryOne<{ id: string }>(db, "SELECT id FROM settlements WHERE id = ?", settlementId);
  if (!settlement) return { ok: false, error: "not_found", state, detail: { reason: "unknown_settlement" } };
  const upkeep = 20;
  if (state.gold < upkeep) return { ok: false, error: "not_enough_gold", state, detail: { required: upkeep } };
  await execute(
    db,
    "INSERT INTO company_branches (id, company_id, settlement_id, upkeep, opened_at) VALUES (?,?,?,?,?)",
    crypto.randomUUID(),
    companyId,
    settlementId,
    upkeep,
    nowMs,
  );
  state.gold -= upkeep;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { companyId, settlementId, upkeep } };
}

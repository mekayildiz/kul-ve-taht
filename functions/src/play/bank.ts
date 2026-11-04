/**
 * Bankacilik, emanet ve taraflar arasi finansman oynanis servisi
 * (tasarim belgesi 20, 9.x).
 *
 * Belge 20: "Bankalar, mevduat, kasa, emanet, kredi, faiz, borc, temerrut,
 * tahsilat, iflas, tasfiye ve oyuncular/NPC'ler arasi finansman sistemleri
 * tamamlanir."
 *
 * Tum hesaplar SUNUCUDA yapilir; istemci miktar otoritesi degildir (belge
 * 21.1). Saf mantik `economy/bank.ts` icindedir; bu dosya yalnizca KALICI
 * duruma baglar.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { loadState, saveState, type PlayResult } from "./service";
import {
  accrueDeposit,
  collectDefault,
  deposit,
  isBankrupt,
  liquidate,
  loanStatus,
  openEscrow,
  payoffAmount,
  peerLoan,
  refundEscrow,
  releaseEscrow,
  withdraw,
  type Account,
  type BankLoan,
  type Escrow,
} from "../economy/bank";

async function gameDay(db: SqlDatabase): Promise<number> {
  const row = await queryOne<{ game_day: number }>(db, "SELECT game_day FROM world_clock WHERE id = 1");
  return row?.game_day ?? 1;
}

// --- Mevduat ve kasa (belge 20) ---

export interface BankAccountView {
  id: string;
  kind: "current" | "vault";
  balance: number;
  interestRate: number;
}

async function loadAccount(db: SqlDatabase, accountId: string): Promise<Account | null> {
  const row = await queryOne<{
    id: string;
    owner_id: string;
    kind: "current" | "vault";
    balance: number;
    interest_rate: number;
    opened_game_day: number;
  }>(db, "SELECT id, owner_id, kind, balance, interest_rate, opened_game_day FROM bank_accounts WHERE id = ?", accountId);
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    balance: row.balance,
    interestRate: row.interest_rate,
    openedGameDay: row.opened_game_day,
  };
}

async function ensureAccount(
  db: SqlDatabase,
  ownerId: string,
  settlementId: string | null,
  kind: "current" | "vault",
  interestRate: number,
  day: number,
  nowMs: number,
): Promise<Account> {
  const existing = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM bank_accounts WHERE owner_id = ? AND settlement_id IS ? AND kind = ?",
    ownerId,
    settlementId,
    kind,
  );
  if (existing) return (await loadAccount(db, existing.id))!;
  const id = crypto.randomUUID();
  await execute(
    db,
    "INSERT INTO bank_accounts (id, owner_id, settlement_id, kind, balance, interest_rate, opened_game_day, updated_at) VALUES (?,?,?,?,0,?,?,?)",
    id,
    ownerId,
    settlementId,
    kind,
    interestRate,
    day,
    nowMs,
  );
  return { id, ownerId, kind, balance: 0, interestRate, openedGameDay: day };
}

/** Karakterin mevduat/kasa hesaplarini (faiz islenmis) doner. */
export async function bankSummary(db: SqlDatabase, characterId: string, nowMs = Date.now()): Promise<BankAccountView[]> {
  const day = await gameDay(db);
  const rows = await queryAll<{
    id: string;
    kind: "current" | "vault";
    balance: number;
    interest_rate: number;
    opened_game_day: number;
  }>(
    db,
    "SELECT id, kind, balance, interest_rate, opened_game_day FROM bank_accounts WHERE owner_id = ? ORDER BY kind",
    characterId,
  );
  const out: BankAccountView[] = [];
  for (const row of rows) {
    const account: Account = {
      id: row.id,
      ownerId: characterId,
      kind: row.kind,
      balance: row.balance,
      interestRate: row.interest_rate,
      openedGameDay: row.opened_game_day,
    };
    const accrued = accrueDeposit(account, Math.max(0, day - account.openedGameDay));
    if (accrued !== account.balance) {
      await execute(db, "UPDATE bank_accounts SET balance = ?, opened_game_day = ?, updated_at = ? WHERE id = ?", accrued, day, nowMs, account.id);
    }
    out.push({ id: account.id, kind: account.kind, balance: accrued, interestRate: account.interestRate });
  }
  return out;
}

const DEPOSIT_RATE = 3;

export async function performDeposit(
  db: SqlDatabase,
  characterId: string,
  amount: number,
  kind: "current" | "vault" = "current",
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const day = await gameDay(db);
  const settlement = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  const account = await ensureAccount(db, characterId, settlement?.current_settlement ?? null, kind, kind === "vault" ? 0 : DEPOSIT_RATE, day, nowMs);
  const result = deposit(account, amount, state.gold);
  if (!result.ok) return { ok: false, error: "invalid_action", state, detail: { reason: result.problem } };
  await execute(
    db,
    "UPDATE bank_accounts SET balance = ?, updated_at = ? WHERE id = ?",
    result.account.balance,
    nowMs,
    account.id,
  );
  state.gold = result.ownerGold;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { accountId: account.id, kind, balance: result.account.balance } };
}

export async function performWithdraw(
  db: SqlDatabase,
  characterId: string,
  amount: number,
  kind: "current" | "vault" = "current",
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const day = await gameDay(db);
  const settlement = await queryOne<{ current_settlement: string | null }>(
    db,
    "SELECT current_settlement FROM characters WHERE id = ?",
    characterId,
  );
  const account = await ensureAccount(db, characterId, settlement?.current_settlement ?? null, kind, kind === "vault" ? 0 : DEPOSIT_RATE, day, nowMs);
  // Cekimden once faizi isle (belge 20).
  const accrued = accrueDeposit(account, Math.max(0, day - account.openedGameDay));
  const withInterest: Account = { ...account, balance: accrued, openedGameDay: day };
  const result = withdraw(withInterest, amount);
  if (!result.ok) return { ok: false, error: "invalid_action", state, detail: { reason: result.problem } };
  await execute(db, "UPDATE bank_accounts SET balance = ?, opened_game_day = ?, updated_at = ? WHERE id = ?", result.account.balance, day, nowMs, account.id);
  state.gold += result.payout;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { accountId: account.id, kind, balance: result.account.balance, payout: result.payout } };
}

// --- Emanet (escrow) (belge 20) ---

export async function performOpenEscrow(
  db: SqlDatabase,
  characterId: string,
  toId: string,
  amount: number,
  condition: string,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const day = await gameDay(db);
  const result = openEscrow(characterId, toId, amount, condition, state.gold, day);
  if (!result.ok) return { ok: false, error: "invalid_action", state, detail: { reason: result.problem } };
  await execute(
    db,
    "INSERT INTO escrows (id, from_id, to_id, amount, condition, status, created_game_day, updated_at) VALUES (?,?,?,?,?,'held',?,?)",
    result.escrow.id,
    result.escrow.fromId,
    result.escrow.toId,
    result.escrow.amount,
    result.escrow.condition,
    result.escrow.createdGameDay,
    nowMs,
  );
  state.gold = result.fromGold;
  await saveState(db, state, nowMs);
  return { ok: true, state, detail: { escrowId: result.escrow.id, amount: result.escrow.amount } };
}

async function loadEscrow(db: SqlDatabase, id: string): Promise<Escrow | null> {
  const row = await queryOne<{
    id: string;
    from_id: string;
    to_id: string;
    amount: number;
    condition: string;
    status: Escrow["status"];
    created_game_day: number;
  }>(db, "SELECT id, from_id, to_id, amount, condition, status, created_game_day FROM escrows WHERE id = ?", id);
  return row
    ? { id: row.id, fromId: row.from_id, toId: row.to_id, amount: row.amount, condition: row.condition, status: row.status, createdGameDay: row.created_game_day }
    : null;
}

async function settleEscrow(
  db: SqlDatabase,
  characterId: string,
  escrowId: string,
  action: "release" | "refund",
  nowMs: number,
): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const escrow = await loadEscrow(db, escrowId);
  if (!escrow) return { ok: false, error: "not_found", state };
  const result = action === "release" ? releaseEscrow(escrow, characterId) : refundEscrow(escrow, characterId);
  if (!result.ok) return { ok: false, error: "invalid_action", state, detail: { reason: result.problem } };
  await execute(db, "UPDATE escrows SET status = ?, updated_at = ? WHERE id = ?", result.escrow.status, nowMs, escrowId);
  // Odeme aliciya (release) veya gonderene (refund) gider.
  if (result.payoutTo === characterId) {
    state.gold += result.amount;
    await saveState(db, state, nowMs);
  } else {
    await execute(
      db,
      "UPDATE character_state SET gold = gold + ?, updated_at = ? WHERE character_id = ?",
      result.amount,
      nowMs,
      result.payoutTo,
    );
  }
  return { ok: true, state, detail: { escrowId, status: result.escrow.status, payoutTo: result.payoutTo, amount: result.amount } };
}

export async function performReleaseEscrow(db: SqlDatabase, characterId: string, escrowId: string, nowMs = Date.now()): Promise<PlayResult> {
  return settleEscrow(db, characterId, escrowId, "release", nowMs);
}

export async function performRefundEscrow(db: SqlDatabase, characterId: string, escrowId: string, nowMs = Date.now()): Promise<PlayResult> {
  return settleEscrow(db, characterId, escrowId, "refund", nowMs);
}

export async function escrowList(db: SqlDatabase, characterId: string): Promise<Escrow[]> {
  const rows = await queryAll<{
    id: string;
    from_id: string;
    to_id: string;
    amount: number;
    condition: string;
    status: Escrow["status"];
    created_game_day: number;
  }>(
    db,
    "SELECT id, from_id, to_id, amount, condition, status, created_game_day FROM escrows WHERE (from_id = ? OR to_id = ?) AND status = 'held' ORDER BY created_game_day DESC",
    characterId,
    characterId,
  );
  return rows.map((r) => ({ id: r.id, fromId: r.from_id, toId: r.to_id, amount: r.amount, condition: r.condition, status: r.status, createdGameDay: r.created_game_day }));
}

// --- Taraflar arasi kredi (belge 20) ---

export async function performPeerLoan(
  db: SqlDatabase,
  lenderId: string,
  borrowerId: string,
  principal: number,
  interestRate: number,
  days: number,
  nowMs = Date.now(),
): Promise<PlayResult> {
  const state = await loadState(db, lenderId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const day = await gameDay(db);
  const result = peerLoan(lenderId, borrowerId, { principal, interestRate, dueGameDay: day + Math.max(1, days) }, state.gold, day);
  if (!result.ok) return { ok: false, error: "invalid_action", state, detail: { reason: result.problem } };
  await execute(
    db,
    `INSERT INTO bank_loans (id, borrower_id, lender_id, principal, outstanding, interest_rate, issued_game_day, due_game_day, status, updated_at)
     VALUES (?,?,?,?,?,?,?,?,'active',?)`,
    result.loan.id,
    result.loan.borrowerId,
    result.loan.lenderId,
    result.loan.principal,
    result.loan.outstanding,
    result.loan.interestRate,
    result.loan.issuedGameDay,
    result.loan.dueGameDay,
    nowMs,
  );
  state.gold = result.lenderGold;
  await saveState(db, state, nowMs);
  // Borcluya altin gecir (satir yoksa olusturulur).
  const borrowerState = await loadState(db, borrowerId, nowMs);
  if (borrowerState) {
    borrowerState.gold += result.loan.principal;
    borrowerState.debts += result.loan.principal;
    await saveState(db, borrowerState, nowMs);
  }
  return { ok: true, state, detail: { loanId: result.loan.id, principal: result.loan.principal } };
}

export async function bankLoanList(db: SqlDatabase, characterId: string): Promise<BankLoan[]> {
  const rows = await queryAll<{
    id: string;
    borrower_id: string;
    lender_id: string;
    principal: number;
    outstanding: number;
    interest_rate: number;
    issued_game_day: number;
    due_game_day: number;
  }>(
    db,
    "SELECT id, borrower_id, lender_id, principal, outstanding, interest_rate, issued_game_day, due_game_day FROM bank_loans WHERE (borrower_id = ? OR lender_id = ?) AND status = 'active' ORDER BY issued_game_day DESC",
    characterId,
    characterId,
  );
  return rows.map((r) => ({
    id: r.id,
    borrowerId: r.borrower_id,
    lenderId: r.lender_id,
    principal: r.principal,
    outstanding: r.outstanding,
    interestRate: r.interest_rate,
    issuedGameDay: r.issued_game_day,
    dueGameDay: r.due_game_day,
  }));
}

/** Taraflar arasi krediyi kapatir: faiz dahil toplam borclu tarafindan odenir. */
export async function performRepayPeerLoan(db: SqlDatabase, characterId: string, loanId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, characterId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{
    id: string;
    borrower_id: string;
    lender_id: string;
    principal: number;
    outstanding: number;
    interest_rate: number;
    issued_game_day: number;
    due_game_day: number;
  }>(db, "SELECT * FROM bank_loans WHERE id = ? AND status = 'active'", loanId);
  if (!row) return { ok: false, error: "not_found", state };
  if (row.borrower_id !== characterId) return { ok: false, error: "forbidden", state };
  const day = await gameDay(db);
  const loan: BankLoan = {
    id: row.id,
    borrowerId: row.borrower_id,
    lenderId: row.lender_id,
    principal: row.principal,
    outstanding: row.outstanding,
    interestRate: row.interest_rate,
    issuedGameDay: row.issued_game_day,
    dueGameDay: row.due_game_day,
  };
  const total = payoffAmount(loan, day);
  if (state.gold < total) return { ok: false, error: "not_enough_gold", state, detail: { total } };
  state.gold -= total;
  state.debts = Math.max(0, state.debts - row.principal);
  await saveState(db, state, nowMs);
  await execute(db, "UPDATE bank_loans SET outstanding = 0, status = 'repaid', updated_at = ? WHERE id = ?", nowMs, loanId);
  const lenderState = await loadState(db, row.lender_id, nowMs);
  if (lenderState) {
    lenderState.gold += total;
    await saveState(db, lenderState, nowMs);
  }
  return { ok: true, state, detail: { total, interest: total - row.principal } };
}

// --- Temerrut, iflas ve tasfiye (belge 20) ---

export interface BankruptcyResult {
  characterId: string;
  totalDebt: number;
  liquidated: number;
  paid: Record<string, number>;
}

/**
 * Temerrut ve iflas islemi (belge 20). Vadesi gecmis veya asiri borclanmis
 * krediler temerrude duser; borclunun varligi alacaklilara oransal dagitilir.
 * Bu islem dunya turu (saatlik) icinde cagrilir; idempotenttir.
 */
export async function settleBankruptcies(db: SqlDatabase, nowMs = Date.now()): Promise<BankruptcyResult[]> {
  const day = await gameDay(db);
  const rows = await queryAll<{
    id: string;
    borrower_id: string;
    lender_id: string;
    principal: number;
    outstanding: number;
    interest_rate: number;
    issued_game_day: number;
    due_game_day: number;
  }>(db, "SELECT * FROM bank_loans WHERE status = 'active'");
  const results: BankruptcyResult[] = [];

  // Borcluya gore kredileri grupla.
  const byBorrower = new Map<string, BankLoan[]>();
  for (const row of rows) {
    const loan: BankLoan = {
      id: row.id,
      borrowerId: row.borrower_id,
      lenderId: row.lender_id,
      principal: row.principal,
      outstanding: row.outstanding,
      interestRate: row.interest_rate,
      issuedGameDay: row.issued_game_day,
      dueGameDay: row.due_game_day,
    };
    if (loanStatus(loan, day) !== "defaulted") continue;
    const list = byBorrower.get(row.borrower_id) ?? [];
    list.push(loan);
    byBorrower.set(row.borrower_id, list);
  }

  for (const [borrowerId, loans] of byBorrower) {
    // Varlik: altin + mulk degeri; borc: toplam kalan.
    const goldRow = await queryOne<{ gold: number }>(db, "SELECT gold FROM character_state WHERE character_id = ?", borrowerId);
    const propRow = await queryOne<{ total: number | null }>(
      db,
      "SELECT SUM(value) AS total FROM character_properties WHERE character_id = ?",
      borrowerId,
    );
    const assets = (goldRow?.gold ?? 0) + (propRow?.total ?? 0);
    const totalDebt = loans.reduce((s, l) => s + l.outstanding, 0);
    const netWorth = assets - totalDebt;
    if (!isBankrupt(netWorth)) continue;

    const creditors = loans.map((l) => ({ id: l.lenderId, claim: l.outstanding }));
    const { payouts, remaining } = liquidate(assets, creditors);

    // Borclunun altinini ve mulklerini tasfiye et.
    await execute(db, "UPDATE character_state SET gold = ?, debts = 0, updated_at = ? WHERE character_id = ?", remaining, nowMs, borrowerId);
    await execute(db, "DELETE FROM character_properties WHERE character_id = ?", borrowerId);
    // Alacaklilara odeme.
    for (const [lenderId, amount] of Object.entries(payouts)) {
      if (amount > 0) await execute(db, "UPDATE character_state SET gold = gold + ?, updated_at = ? WHERE character_id = ?", amount, nowMs, lenderId);
    }
    // Kredileri temerrut olarak kapat.
    for (const loan of loans) {
      await execute(db, "UPDATE bank_loans SET status = 'defaulted', outstanding = 0, updated_at = ? WHERE id = ?", nowMs, loan.id);
    }
    await execute(
      db,
      "INSERT INTO bankruptcies (id, debtor_id, net_worth, total_debt, liquidated, game_day, created_at) VALUES (?,?,?,?,?,?,?)",
      crypto.randomUUID(),
      borrowerId,
      netWorth,
      totalDebt,
      assets - remaining,
      day,
      nowMs,
    );
    results.push({ characterId: borrowerId, totalDebt, liquidated: assets - remaining, paid: payouts });
  }
  return results;
}

/** Tek bir kredinin tahsilatini zorlar (alacakli tetikler). */
export async function performCollectDefault(db: SqlDatabase, creditorId: string, loanId: string, nowMs = Date.now()): Promise<PlayResult> {
  const state = await loadState(db, creditorId, nowMs);
  if (!state) return { ok: false, error: "character_not_found" };
  const row = await queryOne<{
    id: string;
    borrower_id: string;
    lender_id: string;
    principal: number;
    outstanding: number;
    interest_rate: number;
    issued_game_day: number;
    due_game_day: number;
  }>(db, "SELECT * FROM bank_loans WHERE id = ? AND status = 'active'", loanId);
  if (!row) return { ok: false, error: "not_found", state };
  if (row.lender_id !== creditorId) return { ok: false, error: "forbidden", state };
  const day = await gameDay(db);
  const loan: BankLoan = {
    id: row.id,
    borrowerId: row.borrower_id,
    lenderId: row.lender_id,
    principal: row.principal,
    outstanding: row.outstanding,
    interestRate: row.interest_rate,
    issuedGameDay: row.issued_game_day,
    dueGameDay: row.due_game_day,
  };
  if (loanStatus(loan, day) !== "defaulted") {
    return { ok: false, error: "invalid_action", state, detail: { reason: "not_defaulted" } };
  }
  const goldRow = await queryOne<{ gold: number }>(db, "SELECT gold FROM character_state WHERE character_id = ?", row.borrower_id);
  const { recovered, writtenOff } = collectDefault(loan, goldRow?.gold ?? 0);
  await execute(db, "UPDATE character_state SET gold = MAX(0, gold - ?), updated_at = ? WHERE character_id = ?", recovered, nowMs, row.borrower_id);
  state.gold += recovered;
  await saveState(db, state, nowMs);
  await execute(db, "UPDATE bank_loans SET status = 'defaulted', outstanding = 0, updated_at = ? WHERE id = ?", nowMs, loanId);
  return { ok: true, state, detail: { recovered, writtenOff } };
}

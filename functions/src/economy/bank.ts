/**
 * Bankacilik cekirdegi (tasarim belgesi 20, 9.x).
 *
 * Belge 20: "Bankalar, mevduat, kasa, emanet, kredi, faiz, borc, temerrut,
 * tahsilat, iflas, tasfiye ve oyuncular/NPC'ler arasi finansman sistemleri
 * tamamlanir."
 *
 * Bu modul SAF fonksiyonlardir: hicbir G/C yapmaz. Kalici duruma baglama
 * `play/bank.ts` icindedir. Tum hesaplar SUNUCUDA yapilir; istemci miktar
 * otoritesi degildir (belge 21.1).
 */

export type AccountKind = "current" | "vault";

export interface Account {
  id: string;
  ownerId: string;
  kind: AccountKind;
  balance: number;
  /** Yillik faiz orani (%). Kasa (vault) icin 0'dir. */
  interestRate: number;
  openedGameDay: number;
}

/** Mevduat faizi: gun sayisina gore bilesik faiz (yillik oran / 360 gun). */
export function accrueDeposit(account: Account, gameDays: number): number {
  if (account.kind === "vault" || account.interestRate <= 0) return account.balance;
  const dailyRate = account.interestRate / 100 / 360;
  return Math.round(account.balance * (1 + dailyRate * Math.max(0, gameDays)));
}

export type DepositProblem = "invalid_amount" | "insufficient_funds" | "account_not_found";

/** Mevduat yatirma: sahip yeterli altina sahipse hesaba gecer. */
export function deposit(account: Account, amount: number, ownerGold: number):
  | { ok: true; account: Account; ownerGold: number }
  | { ok: false; problem: DepositProblem } {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, problem: "invalid_amount" };
  if (ownerGold < value) return { ok: false, problem: "insufficient_funds" };
  return { ok: true, account: { ...account, balance: account.balance + value }, ownerGold: ownerGold - value };
}

/** Mevduat cekme: bakiye yeterliyse altin geri doner. */
export function withdraw(account: Account, amount: number):
  | { ok: true; account: Account; payout: number }
  | { ok: false; problem: DepositProblem } {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, problem: "invalid_amount" };
  if (account.balance < value) return { ok: false, problem: "insufficient_funds" };
  return { ok: true, account: { ...account, balance: account.balance - value }, payout: value };
}

// --- Emanet (escrow) ---

export type EscrowStatus = "held" | "released" | "refunded" | "disputed";

export interface Escrow {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  /** Serbest birakma kosulu (ornek: karsi taraf teslim etti). */
  condition: string;
  status: EscrowStatus;
  createdGameDay: number;
}

export type EscrowProblem = "invalid_amount" | "not_found" | "wrong_actor" | "not_held" | "insufficient_funds";

export function openEscrow(
  fromId: string,
  toId: string,
  amount: number,
  condition: string,
  fromGold: number,
  gameDay: number,
): { ok: true; escrow: Escrow; fromGold: number } | { ok: false; problem: EscrowProblem } {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, problem: "invalid_amount" };
  if (fromGold < value) return { ok: false, problem: "insufficient_funds" };
  return {
    ok: true,
    fromGold: fromGold - value,
    escrow: {
      id: crypto.randomUUID(),
      fromId,
      toId,
      amount: value,
      condition,
      status: "held",
      createdGameDay: gameDay,
    },
  };
}

/**
 * Emaneti serbest birakir. Yalnizca ALICI kosulun gerceklestigini onaylar;
 * gonderen tek tarafli serbest birakamaz (hile onleme, belge 21.1).
 */
export function releaseEscrow(
  escrow: Escrow,
  actorId: string,
): { ok: true; escrow: Escrow; payoutTo: string; amount: number } | { ok: false; problem: EscrowProblem } {
  if (escrow.status !== "held") return { ok: false, problem: "not_held" };
  if (actorId !== escrow.toId) return { ok: false, problem: "wrong_actor" };
  return { ok: true, escrow: { ...escrow, status: "released" }, payoutTo: escrow.toId, amount: escrow.amount };
}

/** Emaneti iade eder: yalnizca GONDEREN kosul gerceklesmeden iade alabilir. */
export function refundEscrow(
  escrow: Escrow,
  actorId: string,
): { ok: true; escrow: Escrow; payoutTo: string; amount: number } | { ok: false; problem: EscrowProblem } {
  if (escrow.status !== "held") return { ok: false, problem: "not_held" };
  if (actorId !== escrow.fromId) return { ok: false, problem: "wrong_actor" };
  return { ok: true, escrow: { ...escrow, status: "refunded" }, payoutTo: escrow.fromId, amount: escrow.amount };
}

// --- Kredi, temerrut, iflas ve tasfiye ---

export interface BankLoan {
  id: string;
  borrowerId: string;
  lenderId: string;
  principal: number;
  outstanding: number;
  interestRate: number;
  issuedGameDay: number;
  /** Son odeme gunu; bu gunden sonra temerrut. */
  dueGameDay: number;
}

export interface DebtPolicy {
  /** Temerrut esigi: borc anaparanin kac kati olunca temerrut. */
  defaultMultiplier: number;
  /** Ifas esigi: net varlik bu degerin altina dusunce iflas. */
  bankruptcyNetWorth: number;
}

export const DEFAULT_DEBT_POLICY: DebtPolicy = { defaultMultiplier: 2, bankruptcyNetWorth: 0 };

export type LoanStatus = "active" | "defaulted" | "repaid";

/** Kredinin durumu: gun ve borc oranina gore (belge 20). */
export function loanStatus(loan: BankLoan, gameDay: number, policy = DEFAULT_DEBT_POLICY): LoanStatus {
  if (loan.outstanding <= 0) return "repaid";
  const overdue = gameDay > loan.dueGameDay;
  const excessive = loan.outstanding > loan.principal * policy.defaultMultiplier;
  return overdue || excessive ? "defaulted" : "active";
}

/** Temerrude dusen borcun tahsilati: alacakli teminati alir, kalan silinir. */
export function collectDefault(
  loan: BankLoan,
  borrowerAssets: number,
): { recovered: number; writtenOff: number; loan: BankLoan } {
  const recovered = Math.max(0, Math.min(loan.outstanding, Math.floor(borrowerAssets)));
  return {
    recovered,
    writtenOff: Math.max(0, loan.outstanding - recovered),
    loan: { ...loan, outstanding: Math.max(0, loan.outstanding - recovered) },
  };
}

/** Iflas kontrolu: net varlik (varlik - borc) esigin altindaysa iflas. */
export function isBankrupt(netWorth: number, policy = DEFAULT_DEBT_POLICY): boolean {
  return netWorth < policy.bankruptcyNetWorth;
}

/**
 * Tasfiye: iflas eden borclunun varliklari alacaklilara oransal dagitilir.
 * Dagitim adil ve deterministiktir; kalan alacak silinir (belge 20).
 */
export function liquidate(
  assets: number,
  creditors: readonly { id: string; claim: number }[],
): { payouts: Record<string, number>; remaining: number } {
  const totalClaim = creditors.reduce((s, c) => s + Math.max(0, c.claim), 0);
  const pool = Math.max(0, Math.floor(assets));
  const payouts: Record<string, number> = {};
  if (totalClaim <= 0) return { payouts, remaining: pool };
  let distributed = 0;
  for (const creditor of creditors) {
    const claim = Math.max(0, creditor.claim);
    const share = Math.floor((pool * claim) / totalClaim);
    payouts[creditor.id] = (payouts[creditor.id] ?? 0) + share;
    distributed += share;
  }
  return { payouts, remaining: pool - distributed };
}

// --- Oyuncular/NPC'ler arasi finansman (belge 20) ---

export type PeerLoanProblem = "invalid_amount" | "insufficient_funds" | "self_loan" | "bad_rate";

export interface PeerLoanTerms {
  principal: number;
  interestRate: number;
  dueGameDay: number;
}

/** Taraflar arasi kredi: lender yeterli altina sahipse ve oran makulse. */
export function peerLoan(
  lenderId: string,
  borrowerId: string,
  terms: PeerLoanTerms,
  lenderGold: number,
  gameDay: number,
): { ok: true; loan: BankLoan; lenderGold: number } | { ok: false; problem: PeerLoanProblem } {
  if (lenderId === borrowerId) return { ok: false, problem: "self_loan" };
  const principal = Math.floor(terms.principal);
  if (!Number.isFinite(principal) || principal <= 0) return { ok: false, problem: "invalid_amount" };
  if (terms.interestRate < 0 || terms.interestRate > 100) return { ok: false, problem: "bad_rate" };
  if (lenderGold < principal) return { ok: false, problem: "insufficient_funds" };
  return {
    ok: true,
    lenderGold: lenderGold - principal,
    loan: {
      id: crypto.randomUUID(),
      borrowerId,
      lenderId,
      principal,
      outstanding: principal,
      interestRate: terms.interestRate,
      issuedGameDay: gameDay,
      dueGameDay: terms.dueGameDay,
    },
  };
}

/** Krediyi kapatir: faiz dahil toplam tutar hesaplanir. */
export function payoffAmount(loan: BankLoan, gameDay: number): number {
  const days = Math.max(0, gameDay - loan.issuedGameDay);
  const dailyRate = loan.interestRate / 100 / 360;
  return Math.round(loan.outstanding * (1 + dailyRate * days));
}

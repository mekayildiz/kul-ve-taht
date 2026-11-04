/**
 * Ekonomi: arz-talep, pazar, bankacilik, vergi (tasarim belgesi 9).
 *
 * Fiyatlar bolgeden bolgeye degisir; uretim, tuketim, arz ve talep etkiler.
 * Savas, kitlik ve ticaret yolu kesintileri fiyatlari bozar.
 */

export interface MarketState {
  itemId: string;
  settlementId: string;
  /** Pazardaki arz miktari. */
  supply: number;
  /** Talep miktari. */
  demand: number;
  /** Temel deger (esya tanimindan). */
  baseValue: number;
}

/**
 * Denge fiyati: talep arzdan fazlaysa fiyat yukselir. Fiyat taban degerin
 * %40'i ile %400'u arasinda kalir (asiri dalgalanma engellenir).
 */
export function priceFor(market: MarketState): number {
  const ratio = market.demand / Math.max(1, market.supply);
  const raw = market.baseValue * (0.5 + ratio * 0.5);
  const min = market.baseValue * 0.4;
  const max = market.baseValue * 4;
  return Math.round(Math.max(min, Math.min(max, raw)));
}

/** Alim fiyati (oyuncu alirken) satis fiyatindan yuksektir (komisyon). */
export function buyPrice(market: MarketState): number {
  return Math.round(priceFor(market) * 1.1);
}

export function sellPrice(market: MarketState): number {
  return Math.round(priceFor(market) * 0.85);
}

/** Alim/satim arz ve talebi gunceller. */
export function applyTrade(market: MarketState, quantity: number, side: "buy" | "sell"): MarketState {
  if (side === "buy") {
    return { ...market, supply: Math.max(0, market.supply - quantity), demand: market.demand + Math.round(quantity * 0.5) };
  }
  return { ...market, supply: market.supply + quantity, demand: Math.max(0, market.demand - Math.round(quantity * 0.3)) };
}

/** Bolgesel fark: uzak bolgede fiyat farkli (ticaret firsati). */
export function regionalPrice(basePrice: number, regionFactor: number): number {
  return Math.round(basePrice * regionFactor);
}

export interface Bank {
  id: string;
  settlementId: string;
  /** Yillik faiz orani (%). */
  interestRate: number;
  reserves: number;
}

export interface Loan {
  id: string;
  borrowerId: string;
  bankId: string;
  principal: number;
  /** Kalan borc. */
  outstanding: number;
  interestRate: number;
  issuedGameDay: number;
}

/** Kredi verilebilir mi: teminat ve itibar kontrolu (belge 9). */
export function canIssueLoan(amount: number, collateral: number, standing: number, bankReserves: number): boolean {
  if (amount <= 0) return false;
  if (amount > bankReserves * 0.5) return false;
  const secured = collateral >= amount * 0.5;
  const trusted = standing >= 50;
  return secured || trusted;
}

/** Gunluk faiz islemesi; borc odeme gucunu asarsa iflas bayragi. */
export function accrueInterest(loan: Loan, gameDays: number): Loan & { insolvent: boolean } {
  const dailyRate = loan.interestRate / 100 / 360;
  const outstanding = Math.round(loan.outstanding * (1 + dailyRate * gameDays));
  // Iflas esigi 2.5x anapara: borc odeme kapasitesini asiri asmissa.
  return { ...loan, outstanding, insolvent: outstanding > loan.principal * 2.5 };
}

/** Vergi: gelir ve mulk uzerinden (belge 9). */
export function taxDue(income: number, propertyValue: number, incomeRate: number, propertyRate: number): number {
  return Math.round(income * incomeRate + propertyValue * propertyRate);
}

/** Vergi toplama: hazineye girer, memnuniyetsizlik olusabilir. */
export function collectTax(treasury: number, due: number, compliance: number): { treasury: number; unrest: number } {
  const collected = Math.round(due * compliance);
  const unrest = Math.round((due - collected) / 100);
  return { treasury: treasury + collected, unrest };
}

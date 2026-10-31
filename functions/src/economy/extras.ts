/**
 * Ekonomi tamamlayicilari: depolama/bozulma, acik artirma, kira, tekel,
 * piyasa bozulmasi, devlet finansmani ve yolsuzluk (tasarim belgesi 9.3-9.9).
 *
 * Kural: Butun hesaplar SUNUCUDA; miktar/para istemciden alinmaz (belge 21.1).
 */

export type Perishability = "fresh" | "stable" | "durable";

export interface StockEntry {
  itemId: string;
  quantity: number;
  /** Bozulma sinifi. */
  perishability: Perishability;
  /** Stok yasi (oyun gunu). */
  ageDays: number;
}

/** Gunluk bozulma orani: taze gida hizli, dayanikli mal yavas bozulur. */
const DECAY_RATE: Record<Perishability, number> = { fresh: 0.08, stable: 0.02, durable: 0.002 };

export interface StorageDef {
  /** Depo kapasitesi (birim). */
  capacity: number;
  /** Soguk/iyi kosul carpani (0.5 = bozulma yariya iner). */
  preservationFactor: number;
}

export function storageUsed(entries: readonly StockEntry[]): number {
  return entries.reduce((sum, e) => sum + e.quantity, 0);
}

export function storageOverflow(entries: readonly StockEntry[], storage: StorageDef): number {
  return Math.max(0, storageUsed(entries) - storage.capacity);
}

/**
 * Gunluk bozulma: her girdi bozulma oranina ve kosullara gore azalir.
 * Kapasite asilirsa ek ceza uygulanir (belge 9.3).
 */
export function decayDay(entries: readonly StockEntry[], storage: StorageDef, gameDays = 1): StockEntry[] {
  const overflow = storageOverflow(entries, storage);
  const overloadPenalty = overflow > 0 ? 1.5 : 1;
  return entries.map((entry) => {
    const rate = DECAY_RATE[entry.perishability] * storage.preservationFactor * overloadPenalty;
    const decayed = entry.quantity * Math.pow(1 - rate, gameDays);
    return { ...entry, quantity: Math.max(0, Math.floor(decayed)), ageDays: entry.ageDays + gameDays };
  });
}

// --- Acik artirma (belge 9.11) ---

export interface Auction {
  id: string;
  itemId: string;
  quantity: number;
  /** En dusuk kabul edilen teklif. */
  reservePrice: number;
  /** Su anki en yuksek teklif. */
  currentBid: number;
  currentBidderId: string | null;
  /** Bitis zamani (ms). */
  endsAtMs: number;
}

export interface BidResult {
  ok: boolean;
  reason?: "below_reserve" | "not_highest" | "auction_ended" | "self_bid";
  auction: Auction;
}

/** Teklif: rezerv uzerinde ve mevcut en yuksekten fazla olmali; bitmemis olmali. */
export function placeBid(auction: Auction, bidderId: string, amount: number, nowMs: number): BidResult {
  if (nowMs >= auction.endsAtMs) return { ok: false, reason: "auction_ended", auction };
  if (auction.currentBidderId === bidderId) return { ok: false, reason: "self_bid", auction };
  if (amount < auction.reservePrice) return { ok: false, reason: "below_reserve", auction };
  if (amount <= auction.currentBid) return { ok: false, reason: "not_highest", auction };
  return { ok: true, auction: { ...auction, currentBid: amount, currentBidderId: bidderId } };
}

export function settleAuction(auction: Auction, nowMs: number): { sold: boolean; winnerId: string | null; price: number } {
  if (nowMs < auction.endsAtMs) return { sold: false, winnerId: null, price: 0 };
  if (!auction.currentBidderId || auction.currentBid < auction.reservePrice) return { sold: false, winnerId: null, price: 0 };
  return { sold: true, winnerId: auction.currentBidderId, price: auction.currentBid };
}

// --- Kira (belge 9.11) ---

export interface Rental {
  propertyValue: number;
  /** Aylik kira orani (%). */
  monthlyRate: number;
}

/** Aylik kira: mulk degeri * oran; bakim ve doluluk etkiler. */
export function monthlyRent(rental: Rental, occupancy: number): number {
  const base = rental.propertyValue * (rental.monthlyRate / 100);
  return Math.round(base * Math.max(0, Math.min(1, occupancy)));
}

/** Kira geliri vergiye tabidir (belge 9.7). */
export function rentAfterTax(rent: number, incomeTaxRate: number): number {
  return Math.round(rent * (1 - Math.max(0, Math.min(1, incomeTaxRate))));
}

// --- Tekel ve piyasa bozulmasi (belge 9.4) ---

/**
 * Piyasa payi: bir saticinin bolgedeki toplam arza orani. Pay %60'i asarsa
 * tekel gucu dogar ve fiyati yukseltebilir.
 */
export function marketShare(ownSupply: number, totalSupply: number): number {
  if (totalSupply <= 0) return 0;
  return Math.round((ownSupply / totalSupply) * 1000) / 1000;
}

export const MONOPOLY_THRESHOLD = 0.6;

/** Tekel fiyat etkisi: pay esigin uzerindeyse fiyat carpani buyur. */
export function monopolyPriceFactor(share: number): number {
  if (share <= MONOPOLY_THRESHOLD) return 1;
  const excess = (share - MONOPOLY_THRESHOLD) / (1 - MONOPOLY_THRESHOLD);
  return Math.round((1 + excess * 1.5) * 100) / 100;
}

export type DisruptionKind = "war" | "famine" | "trade_route_crisis" | "banditry" | "plague";

/** Piyasa bozulmasi: olay turune gore arz duser, fiyat yukselir (belge 12.5). */
export function disruptionImpact(kind: DisruptionKind): { supplyFactor: number; priceFactor: number } {
  switch (kind) {
    case "war":
      return { supplyFactor: 0.6, priceFactor: 1.5 };
    case "famine":
      return { supplyFactor: 0.4, priceFactor: 2.2 };
    case "trade_route_crisis":
      return { supplyFactor: 0.7, priceFactor: 1.35 };
    case "banditry":
      return { supplyFactor: 0.8, priceFactor: 1.2 };
    case "plague":
      return { supplyFactor: 0.55, priceFactor: 1.8 };
  }
}

// --- Devlet finansmani ve yolsuzluk (belge 9.7-9.9) ---

export interface KingdomBudget {
  treasury: number;
  debt: number;
  /** Aylik vergi geliri. */
  monthlyRevenue: number;
  /** Aylik gider (maas, ordu, altyapi). */
  monthlyExpense: number;
  /** Yolsuzluk orani 0-1 (gelirin kaybolan kismi). */
  corruption: number;
}

export interface BudgetMonth {
  treasury: number;
  debt: number;
  collected: number;
  /** Borc krizi: borc gelirin katini astiysa iflas riski. */
  debtCrisis: boolean;
}

/**
 * Aylik butce: vergi toplanir (yolsuzluk dusulur), gider odenir. Yetmezse
 * borclanir; borc gelirin 3 katini asarsa borc krizi (belge 9.9).
 */
export function runBudgetMonth(budget: KingdomBudget): BudgetMonth {
  const collected = Math.round(budget.monthlyRevenue * (1 - Math.max(0, Math.min(1, budget.corruption))));
  const net = collected - budget.monthlyExpense;
  let treasury = budget.treasury + net;
  let debt = budget.debt;
  if (treasury < 0) {
    debt += -treasury;
    treasury = 0;
  }
  const debtCrisis = debt > budget.monthlyRevenue * 3;
  return { treasury, debt, collected, debtCrisis };
}

/** Yolsuzluk denetimi: kayit tutulmasi kaybolan geliri ortaya cikarir (belge 9.8). */
export function auditCorruption(recorded: number, actual: number, auditStrength: number): { detected: number; newCorruption: number } {
  const gap = Math.max(0, recorded - actual);
  const detected = Math.round(gap * Math.max(0, Math.min(1, auditStrength)));
  return { detected, newCorruption: Math.max(0, gap - detected) };
}

/** Kamu mali mudahalesi: hazineden piyasaya tahil surerek fiyati dusurur (belge 9.9). */
export function marketIntervention(treasury: number, grainAmount: number, unitCost: number): { ok: boolean; treasury: number; priceRelief: number } {
  const cost = grainAmount * unitCost;
  if (treasury < cost) return { ok: false, treasury, priceRelief: 0 };
  const priceRelief = Math.round(Math.min(0.4, grainAmount / 1000) * 100) / 100;
  return { ok: true, treasury: treasury - cost, priceRelief };
}

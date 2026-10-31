/**
 * Yeralti orgutleri, karaborsa ve kacakcilik (tasarim belgesi 13.4).
 *
 * Kural: Yasal yol da suc dunyasi yolu da mumkundur; her ikisinin de riski,
 * getirisi ve itibar sonucu vardir. Islemler SUNUCUDA dogrulanir (belge 21.1).
 */

export type UnderworldAction = "theft" | "smuggling" | "fraud" | "assassination" | "black_market";

export interface UnderworldActionDef {
  action: UnderworldAction;
  name: string;
  /** Yakalanma riski carpani. */
  riskFactor: number;
  /** Beklenen getiri (altin). */
  reward: number;
  /** Itibar etkisi (yasal itibar). */
  reputationDelta: number;
  /** Suc derecesi (yargi sistemi icin). */
  crimeSeverity: number;
}

export const UNDERWORLD_ACTIONS: readonly UnderworldActionDef[] = [
  { action: "theft", name: "Hırsızlık", riskFactor: 1, reward: 25, reputationDelta: -5, crimeSeverity: 3 },
  { action: "smuggling", name: "Kaçakçılık", riskFactor: 1.2, reward: 60, reputationDelta: -8, crimeSeverity: 5 },
  { action: "fraud", name: "Dolandırıcılık", riskFactor: 0.9, reward: 40, reputationDelta: -6, crimeSeverity: 4 },
  { action: "assassination", name: "Suikast", riskFactor: 2, reward: 150, reputationDelta: -20, crimeSeverity: 9 },
  { action: "black_market", name: "Karaborsa", riskFactor: 0.8, reward: 35, reputationDelta: -3, crimeSeverity: 2 },
];

export interface UnderworldResult {
  ok: boolean;
  success: boolean;
  reward: number;
  caught: boolean;
  reputationDelta: number;
  crimeSeverity: number;
  reason?: string;
}

/**
 * Yeralti eylemi: basari ve yakalanma sansi beceri, guvenlik ve orgut
 * bagi ile belirlenir. `roll` 0-1 (deterministik test).
 */
export function commitUnderworldAct(
  action: UnderworldAction,
  skill: number,
  settlementSecurity: number,
  gangAffiliation: boolean,
  roll: () => number,
): UnderworldResult {
  const def = UNDERWORLD_ACTIONS.find((a) => a.action === action);
  if (!def) return { ok: false, success: false, reward: 0, caught: false, reputationDelta: 0, crimeSeverity: 0, reason: "unknown_action" };
  const skillFactor = Math.min(1.5, 0.5 + Math.max(0, skill) / 100);
  const gangBonus = gangAffiliation ? 0.15 : 0;
  const successChance = Math.max(0.1, Math.min(0.9, 0.7 * skillFactor + gangBonus - settlementSecurity / 200));
  const success = roll() < successChance;
  const catchChance = Math.max(0.05, Math.min(0.9, (def.riskFactor * (100 - skill)) / 150 + settlementSecurity / 150));
  const caught = roll() < catchChance;
  return {
    ok: true,
    success,
    reward: success ? Math.round(def.reward * (1 + gangBonus)) : 0,
    caught,
    reputationDelta: success ? def.reputationDelta : def.reputationDelta * 2,
    crimeSeverity: def.crimeSeverity,
  };
}

// --- Karaborsa (belge 13.4) ---

export interface BlackMarketListing {
  itemId: string;
  /** Karaborsa fiyati (resmi fiyatin katı). */
  priceMultiplier: number;
  /** Yasal risk: yakalanma carpani. */
  legalRisk: number;
}

/** Karaborsa fiyati: resmi fiyat * carpan; yuksek risk = yuksek fiyat. */
export function blackMarketPrice(basePrice: number, listing: BlackMarketListing): number {
  return Math.round(basePrice * listing.priceMultiplier);
}

/** Karaborsa alimi yakalanma riski: guvenlik ve risk carpani. */
export function blackMarketCatchChance(legalRisk: number, settlementSecurity: number): number {
  return Math.round(Math.min(0.95, legalRisk * 0.3 + settlementSecurity / 250) * 100) / 100;
}

// --- Suç orgutleri (belge 13.4) ---

export interface CrimeGang {
  id: string;
  name: string;
  /** Orgut gucu 0-100. */
  power: number;
  /** Hangi yerlesimlerde etkin. */
  settlements: string[];
  /** Oyuncuyla iliski -100..100. */
  standing: number;
}

/** Orgute katilma: itibar esigi ve guven. */
export function canJoinGang(gang: CrimeGang, underworldReputation: number): { ok: boolean; reason?: string } {
  if (underworldReputation < 20) return { ok: false, reason: "not_trusted" };
  if (gang.standing < 0) return { ok: false, reason: "hostile" };
  return { ok: true };
}

/** Orgut iliskisi degisimi. */
export function adjustGangStanding(gang: CrimeGang, delta: number): CrimeGang {
  return { ...gang, standing: Math.max(-100, Math.min(100, gang.standing + delta)) };
}

/** Koruma parasi (haraç): orgut gucleriyle talep buyur (belge 13.4). */
export function protectionMoney(gang: CrimeGang, businessValue: number): number {
  return Math.round((businessValue * 0.05 * gang.power) / 50);
}

/**
 * Suc, yargi ve hapis (tasarim belgesi 13.4, 13.5, 20).
 *
 * Suc isleme, yakalanma, yargilama, ceza ve kacis. Ceza turleri: para
 * cezasi, hapis, surgun. Hapiste kacis, rusvet ve baglanti kullanilabilir.
 * Tum kararlar sunucuda; itibar ve delil agirligi sonucu etkiler.
 */

export type CrimeType =
  | "theft"
  | "smuggling"
  | "fraud"
  | "assassination"
  | "banditry"
  | "black_market"
  | "dark_magic";

export const CRIME_SEVERITY: Record<CrimeType, number> = {
  theft: 15,
  smuggling: 25,
  fraud: 20,
  assassination: 90,
  banditry: 60,
  black_market: 30,
  dark_magic: 80,
};

export interface Crime {
  id: string;
  type: CrimeType;
  settlementId: string;
  committedGameDay: number;
  /** Delil gucu 0-100: yakalanma ve mahkumiyet olasiligini artirir. */
  evidence: number;
  /** Tanik var mi. */
  witnessed: boolean;
}

export interface LegalProfile {
  /** 0-100: yerel otoriteye guven. */
  standing: number;
  /** Rüsvet kapasitesi (para). */
  bribeCapacity: number;
  /** Siyasi baglantilar 0-100. */
  connections: number;
}

export interface ArrestOutcome {
  arrested: boolean;
  /** Yakalanma olasiligi (seffaflik icin). */
  chance: number;
}

/** Yakalanma olasiligi: delil + tanik + guvenlik - baglanti. */
export function arrestChance(crime: Crime, securityLevel: number, profile: LegalProfile): number {
  const base = crime.evidence * 0.5 + (crime.witnessed ? 25 : 0) + securityLevel * 0.3;
  const mitigation = profile.connections * 0.4;
  return Math.max(5, Math.min(95, Math.round(base - mitigation)));
}

export function rollArrest(chance: number, roll: number): ArrestOutcome {
  return { arrested: roll * 100 < chance, chance };
}

export type SentenceType = "fine" | "imprisonment" | "exile" | "acquitted";

export interface Sentence {
  type: SentenceType;
  /** Para cezasi tutari. */
  fine: number;
  /** Hapis suresi (oyun gunu). */
  prisonDays: number;
  /** Mahkumiyet gerekcesi. */
  reason: string;
}

/**
 * Yargi: delil gucu ve itibar mahkumiyeti belirler. Zayif delilde beraat
 * olasiligi yuksektir (sebepsiz ceza olmaz).
 */
export function sentence(
  crime: Crime,
  profile: LegalProfile,
  wealth: number,
  roll: number,
): Sentence {
  const severity = CRIME_SEVERITY[crime.type];
  const convictionChance = Math.max(10, Math.min(95, crime.evidence * 0.6 + (crime.witnessed ? 20 : 0) - profile.standing * 0.3));
  if (roll * 100 >= convictionChance) {
    return { type: "acquitted", fine: 0, prisonDays: 0, reason: "Yeterli delil yok" };
  }

  const fine = Math.round(severity * 10 + wealth * 0.1);
  if (severity >= 80) {
    return { type: "exile", fine, prisonDays: 0, reason: `Ağır suç: ${crime.type}` };
  }
  if (severity >= 40) {
    return { type: "imprisonment", fine: Math.round(fine / 2), prisonDays: Math.round(severity / 10), reason: `Suç: ${crime.type}` };
  }
  return { type: "fine", fine, prisonDays: 0, reason: `Hafif suç: ${crime.type}` };
}

export interface PrisonState {
  characterId: string;
  settlementId: string;
  daysRemaining: number;
  /** Kacis denemesi hakki. */
  escapeAttempts: number;
}

/** Kacis olasiligi: ceviklik + zeka + rusvet - gardiyan gucu. */
export function escapeChance(
  agility: number,
  intellect: number,
  bribe: number,
  guardStrength: number,
): number {
  const base = agility * 1.5 + intellect * 1.0 + bribe * 0.15;
  // Taban 5: rusvet/gardiyan etkisi tabana takilmasin diye once carpim,
  // sonra kirpma; boylece kucuk farklar da gorunur.
  return Math.max(1, Math.min(90, Math.round(base - guardStrength * 0.4)));
}

export function attemptEscape(prison: PrisonState, chance: number, roll: number): { escaped: boolean; prison: PrisonState } {
  const escaped = roll * 100 < chance;
  return {
    escaped,
    prison: {
      ...prison,
      daysRemaining: escaped ? 0 : prison.daysRemaining + 2,
      escapeAttempts: prison.escapeAttempts + 1,
    },
  };
}

/** Rusvet: para karsiliginda ceza azaltma. */
export function bribe(profile: LegalProfile, amount: number, corruptionLevel: number): { accepted: boolean; cost: number } {
  const accepted = amount >= 50 * (1 + corruptionLevel / 100);
  return { accepted, cost: accepted ? amount : 0 };
}

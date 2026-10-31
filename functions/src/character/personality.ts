/** Kisilik ozellikleri (tasarim belgesi 5.6). Sabit etiket degildir. */

export const PERSONALITY_KEYS = [
  "courage",
  "mercy",
  "ambition",
  "loyalty",
  "discipline",
  "patience",
] as const;

export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];
export type Personality = Record<PersonalityKey, number>;

export const PERSONALITY_MIN = 0;
export const PERSONALITY_MAX = 100;

export function neutralPersonality(): Personality {
  return { courage: 50, mercy: 50, ambition: 50, loyalty: 50, discipline: 50, patience: 50 };
}

export interface PersonalityShift {
  key: PersonalityKey;
  delta: number;
}

/**
 * Oyuncu secimleri ve olaylar kisiligi zamanla degistirir. Degerler
 * sinirlar icinde tutulur (0-100).
 */
export function applyPersonalityShift(personality: Personality, shift: PersonalityShift): Personality {
  const next = personality[shift.key] + shift.delta;
  return {
    ...personality,
    [shift.key]: Math.max(PERSONALITY_MIN, Math.min(PERSONALITY_MAX, next)),
  };
}

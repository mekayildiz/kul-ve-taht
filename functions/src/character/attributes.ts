/** Yedi temel nitelik (tasarim belgesi 5.5). Sans ayri nitelik DEGILDIR. */

export const ATTRIBUTE_KEYS = [
  "strength",
  "endurance",
  "agility",
  "intellect",
  "perception",
  "charisma",
  "leadership",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 20;
/** Baslangicta dagitilabilir toplam puan (7 x ortalama 8 = 56). */
export const STARTING_POINT_POOL = 56;

export interface AttributeValidation {
  valid: boolean;
  problems: string[];
}

export function validateAttributes(attributes: Attributes): AttributeValidation {
  const problems: string[] = [];
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const value = attributes[key];
    if (!Number.isInteger(value)) problems.push(`${key} tam sayi olmalidir`);
    if (value < ATTRIBUTE_MIN || value > ATTRIBUTE_MAX) {
      problems.push(`${key} ${ATTRIBUTE_MIN}-${ATTRIBUTE_MAX} araliginda olmalidir`);
    }
    total += value;
  }
  if (total !== STARTING_POINT_POOL) {
    problems.push(`toplam puan ${STARTING_POINT_POOL} olmalidir (mevcut: ${total})`);
  }
  return { valid: problems.length === 0, problems };
}

export function emptyAttributes(): Attributes {
  return {
    strength: 8,
    endurance: 8,
    agility: 8,
    intellect: 8,
    perception: 8,
    charisma: 8,
    leadership: 8,
  };
}

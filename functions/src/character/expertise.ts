/** Uzmanlik yollari ve meslekler (tasarim belgesi 5.7 ve 5.8). Sinif yok. */

export const EXPERTISE_PATHS = [
  "elemental_mage",
  "spirit_caller",
  "shaman",
  "knight",
  "sword_master",
  "archer",
  "shadow_master",
] as const;

export type ExpertisePath = (typeof EXPERTISE_PATHS)[number];

export const PRODUCTION_PROFESSIONS = ["blacksmith", "carpenter", "tailor", "cook"] as const;
export const GATHERING_PROFESSIONS = ["miner", "woodcutter", "hunter", "herbalist"] as const;
export const TRADE_PROFESSIONS = ["merchant", "market_trader", "caravaneer"] as const;
export const OTHER_PROFESSIONS = ["farmer", "herder", "builder"] as const;

export const PROFESSIONS = [
  ...PRODUCTION_PROFESSIONS,
  ...GATHERING_PROFESSIONS,
  ...TRADE_PROFESSIONS,
  ...OTHER_PROFESSIONS,
] as const;

export type Profession = (typeof PROFESSIONS)[number];

/** Karanlik sanatlar nadir kaynak/ogretmen gerektirir; bazi kralliklar yasaklar. */
export const RESTRICTED_PATHS: readonly ExpertisePath[] = ["spirit_caller"];

export interface ExpertiseProgress {
  path: ExpertisePath;
  level: number;
  xp: number;
}

export const EXPERTISE_MAX_LEVEL = 100;

/**
 * Ustalik zaman, egitim, kaynak ve tecrube ister. Tecrube eklenir; seviye
 * esikleri asildikca artar (kademeli maliyet).
 */
export function gainExpertiseXp(progress: ExpertiseProgress, xp: number): ExpertiseProgress {
  const totalXp = progress.xp + Math.max(0, xp);
  let level = 0;
  let remaining = totalXp;
  let cost = 100;
  while (remaining >= cost && level < EXPERTISE_MAX_LEVEL) {
    remaining -= cost;
    level += 1;
    cost = Math.round(cost * 1.15);
  }
  return { ...progress, level, xp: totalXp };
}

/** Karakter birden fazla yol ogrenebilir (sinif kilidi yok). */
export function canLearnPath(learned: readonly ExpertisePath[], path: ExpertisePath): boolean {
  return !learned.includes(path);
}

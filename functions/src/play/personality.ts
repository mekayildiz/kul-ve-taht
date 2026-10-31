/**
 * Kalici kisilik durumu (tasarim belgesi 5.6, 10.2, 12.4).
 *
 * Oyuncunun secimleri ve uzun vadeli olay sonuclari kisiligi zamanla
 * degistirir. Degerler 0-100 araliginda tutulur; saf kural
 * `character/personality.applyPersonalityShift` tek kaynaktir. Durum
 * `character_personality` tablosunda kalici tutulur.
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";
import {
  applyPersonalityShift,
  neutralPersonality,
  type Personality,
  type PersonalityShift,
} from "../character/personality";

/** Uzun vadeli gorev sonuclarinin kisilige etkisi (belge 12.4). */
const EFFECT_SHIFTS: Record<string, PersonalityShift> = {
  valedorn_introduced: { key: "courage", delta: 3 },
  family_reputation_up: { key: "loyalty", delta: 3 },
};

export function shiftForEffect(effect: string | null): PersonalityShift | null {
  if (!effect) return null;
  return EFFECT_SHIFTS[effect] ?? null;
}

export async function loadPersonality(db: SqlDatabase, characterId: string): Promise<Personality> {
  const row = await queryOne<{
    courage: number;
    mercy: number;
    ambition: number;
    loyalty: number;
    discipline: number;
    patience: number;
  }>(
    db,
    "SELECT courage, mercy, ambition, loyalty, discipline, patience FROM character_personality WHERE character_id = ?",
    characterId,
  );
  if (!row) return neutralPersonality();
  return {
    courage: row.courage,
    mercy: row.mercy,
    ambition: row.ambition,
    loyalty: row.loyalty,
    discipline: row.discipline,
    patience: row.patience,
  };
}

/** Uzun vadeli sonucu kalici kisilige uygular; etki yoksa null doner. */
export async function applyEffectToPersonality(
  db: SqlDatabase,
  characterId: string,
  effect: string | null,
  gameDay: number,
): Promise<PersonalityShift | null> {
  const shift = shiftForEffect(effect);
  if (!shift) return null;
  const next = applyPersonalityShift(await loadPersonality(db, characterId), shift);
  await execute(
    db,
    `INSERT INTO character_personality (character_id, courage, mercy, ambition, loyalty, discipline, patience, updated_day)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(character_id) DO UPDATE SET
       courage = excluded.courage,
       mercy = excluded.mercy,
       ambition = excluded.ambition,
       loyalty = excluded.loyalty,
       discipline = excluded.discipline,
       patience = excluded.patience,
       updated_day = excluded.updated_day`,
    characterId,
    next.courage,
    next.mercy,
    next.ambition,
    next.loyalty,
    next.discipline,
    next.patience,
    gameDay,
  );
  return shift;
}

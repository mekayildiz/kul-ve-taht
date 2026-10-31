/**
 * Karakter olusturma servisi (tasarim belgesi bolum 5).
 *
 * Kritik kural: Istemciden gelen nitelik/meslek/gectmis verisi SUNUCUDA
 * dogrulanir. Istemci hicbir zaman otorite degildir (belge 21.1).
 *
 * Dogum yeri secimi baslangic firsatlarini belirler ama karakteri bir
 * meslege/sinifa/kralliga KILITLEMEZ (belge 5.1, 5.7).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";
import { type Attributes, validateAttributes, ATTRIBUTE_KEYS } from "./attributes";
import { type Personality, neutralPersonality } from "./personality";
import { type ExpertisePath, type Profession, EXPERTISE_PATHS, PROFESSIONS } from "./expertise";

export interface Appearance {
  faceShape?: string;
  skinTone?: string;
  eyeColor?: string;
  hairColor?: string;
  hairStyle?: string;
  beardStyle?: string;
  heightCm?: number;
  build?: string;
  scars?: string;
  tattoos?: string;
  outfit?: string;
}

export interface Background {
  familyWealth?: "destitute" | "poor" | "modest" | "comfortable" | "wealthy" | "noble";
  familyProfession?: string;
  familyResidence?: string;
  nobleTies?: string;
  childhoodEvent?: string;
  childhoodEducation?: string;
  adolescentChoice?: string;
}

export interface CreateCharacterInput {
  accountId: string;
  givenName: string;
  surname: string;
  gender?: string;
  birthSettlement: string;
  attributes: Attributes;
  personality?: Partial<Personality>;
  /** Baslangicta secilen uzmanlik yollari (en fazla 2). */
  expertisePaths?: ExpertisePath[];
  /** Baslangicta ogrenilen meslekler (en fazla 2). */
  professions?: Profession[];
  appearance?: Appearance;
  background?: Background;
}

export type CreateCharacterResult =
  | { ok: true; characterId: string }
  | {
      ok: false;
      error:
        | "invalid_name"
        | "invalid_birth_settlement"
        | "invalid_attributes"
        | "too_many_expertise"
        | "too_many_professions"
        | "invalid_expertise"
        | "invalid_profession";
      problems?: string[];
    };

export const MAX_STARTING_EXPERTISE = 2;
export const MAX_STARTING_PROFESSIONS = 2;

export async function createCharacter(
  db: SqlDatabase,
  input: CreateCharacterInput,
  nowMs: number = Date.now(),
): Promise<CreateCharacterResult> {
  const givenName = input.givenName.trim();
  const surname = input.surname.trim();
  if (givenName.length < 2 || surname.length < 2) {
    return { ok: false, error: "invalid_name" };
  }

  const settlement = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM settlements WHERE id = ?",
    input.birthSettlement,
  );
  if (!settlement) return { ok: false, error: "invalid_birth_settlement" };

  const attributeCheck = validateAttributes(input.attributes);
  if (!attributeCheck.valid) {
    return { ok: false, error: "invalid_attributes", problems: attributeCheck.problems };
  }

  const paths = input.expertisePaths ?? [];
  if (paths.length > MAX_STARTING_EXPERTISE) return { ok: false, error: "too_many_expertise" };
  for (const path of paths) {
    if (!EXPERTISE_PATHS.includes(path)) return { ok: false, error: "invalid_expertise" };
  }

  const professions = input.professions ?? [];
  if (professions.length > MAX_STARTING_PROFESSIONS) return { ok: false, error: "too_many_professions" };
  for (const profession of professions) {
    if (!PROFESSIONS.includes(profession)) return { ok: false, error: "invalid_profession" };
  }

  const characterId = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO characters (id, account_id, given_name, surname, gender, birth_settlement, age_years, alive, generation, current_settlement, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    characterId,
    input.accountId,
    givenName,
    surname,
    input.gender ?? null,
    input.birthSettlement,
    16,
    1,
    1,
    input.birthSettlement,
    nowMs,
  );

  await execute(
    db,
    `INSERT INTO character_attributes (character_id, strength, endurance, agility, intellect, perception, charisma, leadership)
     VALUES (?,?,?,?,?,?,?,?)`,
    characterId,
    input.attributes.strength,
    input.attributes.endurance,
    input.attributes.agility,
    input.attributes.intellect,
    input.attributes.perception,
    input.attributes.charisma,
    input.attributes.leadership,
  );

  const personality = { ...neutralPersonality(), ...input.personality };
  for (const [trait, value] of Object.entries(personality)) {
    await execute(
      db,
      "INSERT INTO character_traits (character_id, trait, value) VALUES (?,?,?)",
      characterId,
      trait,
      value,
    );
  }

  for (const path of paths) {
    await execute(
      db,
      "INSERT INTO character_expertise (character_id, expertise, level, xp) VALUES (?,?,?,?)",
      characterId,
      path,
      0,
      0,
    );
  }

  for (const profession of professions) {
    await execute(
      db,
      "INSERT INTO character_professions (character_id, profession, started_at) VALUES (?,?,?)",
      characterId,
      profession,
      nowMs,
    );
  }

  const appearance = input.appearance ?? {};
  await execute(
    db,
    `INSERT INTO character_appearance (character_id, face_shape, skin_tone, eye_color, hair_color, hair_style, beard_style, height_cm, build, scars, tattoos, outfit)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    characterId,
    appearance.faceShape ?? null,
    appearance.skinTone ?? null,
    appearance.eyeColor ?? null,
    appearance.hairColor ?? null,
    appearance.hairStyle ?? null,
    appearance.beardStyle ?? null,
    appearance.heightCm ?? null,
    appearance.build ?? null,
    appearance.scars ?? null,
    appearance.tattoos ?? null,
    appearance.outfit ?? null,
  );

  const background = input.background ?? {};
  await execute(
    db,
    `INSERT INTO character_background (character_id, family_wealth, family_profession, family_residence, noble_ties, childhood_event, childhood_education, adolescent_choice)
     VALUES (?,?,?,?,?,?,?,?)`,
    characterId,
    background.familyWealth ?? null,
    background.familyProfession ?? null,
    background.familyResidence ?? null,
    background.nobleTies ?? null,
    background.childhoodEvent ?? null,
    background.childhoodEducation ?? null,
    background.adolescentChoice ?? null,
  );

  // Itibar gruplari sifirdan baslar (belge 5.9).
  for (const group of ["commoners", "merchants", "nobles", "soldiers"]) {
    await execute(
      db,
      "INSERT INTO character_reputation (character_id, group_name, value) VALUES (?,?,0)",
      characterId,
      group,
    );
  }

  return { ok: true, characterId };
}

/** Nitelik anahtarlarini disariya acar (API dogrulamasi icin). */
export { ATTRIBUTE_KEYS };

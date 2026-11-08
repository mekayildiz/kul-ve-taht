/**
 * Olum, miras ve kusak devri (tasarim belgesi 7.6, 7.7).
 *
 * Olum kalicidir; oyuncu varisiyle devam eder. Miras mulku, altini, borcu ve
 * unvani kapsar; birden fazla varis varsa vasiyet yoksa anlasmazlik cikabilir.
 * Butun paylasim SUNUCUDA hesaplanir (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne, queryAll } from "../db/client";
import {
  distributeInheritance,
  assignPropertyToHeirs,
  adjustReputation,
  type Family,
  type FamilyMember,
} from "../family/dynasty";
import { notifyCharacter } from "../notify/notifications";

export interface SuccessionResult {
  familyId: string;
  heirCharacterId: string | null;
  gold: number;
  properties: { propertyId: string; heirId: string }[];
  dispute: boolean;
  titles: string[];
}

/** Kayitli aileyi ve uyelerini yukler (family_members + characters). */
async function loadFamily(db: SqlDatabase, familyId: string): Promise<{ family: Family; members: FamilyMember[] } | null> {
  const row = await queryOne<{ id: string; name: string; reputation: number; wealth: number; debt: number }>(
    db,
    "SELECT id, name, reputation, wealth, debt FROM families WHERE id = ?",
    familyId,
  );
  if (!row) return null;
  const memberRows = await queryAll<{ character_id: string; relation: string; alive: number; age_years: number; given_name: string; surname: string; generation: number }>(
    db,
    `SELECT fm.character_id, fm.relation, c.alive, c.age_years, c.given_name, c.surname, c.generation
     FROM family_members fm JOIN characters c ON c.id = fm.character_id
     WHERE fm.family_id = ?`,
    familyId,
  );
  const members: FamilyMember[] = memberRows.map((m) => ({
    id: m.character_id,
    name: `${m.given_name} ${m.surname}`,
    role: (m.relation === "head" ? "parent" : m.relation === "spouse" ? "spouse" : "child") as FamilyMember["role"],
    isPlayer: true,
    alive: m.alive === 1,
    ageYears: m.age_years,
  }));
  return {
    family: {
      id: row.id,
      surname: row.name,
      crest: "",
      members,
      reputation: row.reputation,
      wealth: row.wealth,
      debt: row.debt,
      titles: [],
      chronicle: [],
    },
    members,
  };
}

/**
 * Olumu isler ve mirasi dagitir (belge 7.6). Olen karakterin mulku varislere
 * gecer; altin paylasilir; olenin bayragi kalici olarak kapatilir. Varis
 * yoksa mulk hazineye kalir (belge 9.10 devlet mulku ilkesi).
 */
export async function settleDeath(
  db: SqlDatabase,
  characterId: string,
  note: string,
  gameDay: number,
): Promise<SuccessionResult | null> {
  const membership = await queryOne<{ family_id: string }>(
    db,
    "SELECT family_id FROM family_members WHERE character_id = ? LIMIT 1",
    characterId,
  );
  const char = await queryOne<{ alive: number; generation: number }>(
    db,
    "SELECT alive, generation FROM characters WHERE id = ?",
    characterId,
  );
  if (!char) return null;

  // Olum kaydi kalicidir; tekrar islenmez.
  if (char.alive === 0) return null;
  await execute(db, "UPDATE characters SET alive = 0 WHERE id = ?", characterId);

  const properties = await queryAll<{ id: string; value: number }>(
    db,
    "SELECT id, value FROM character_properties WHERE character_id = ?",
    characterId,
  );

  if (!membership) {
    // Aile bagi yoksa mulk devlete kalir (belge 9.10).
    await execute(db, "DELETE FROM character_properties WHERE character_id = ?", characterId);
    return { familyId: "", heirCharacterId: null, gold: 0, properties: [], dispute: false, titles: [] };
  }

  const loaded = await loadFamily(db, membership.family_id);
  if (!loaded) return null;
  const inheritance = distributeInheritance(loaded.family, null, characterId);
  const assignments = assignPropertyToHeirs(properties, inheritance.heirs);

  for (const assignment of assignments) {
    await execute(
      db,
      "UPDATE character_properties SET character_id = ? WHERE id = ?",
      assignment.heirId,
      assignment.propertyId,
    );
  }
  for (const heir of inheritance.heirs) {
    if (heir.gold > 0) {
      await execute(db, "UPDATE character_state SET gold = gold + ? WHERE character_id = ?", heir.gold, heir.memberId);
    }
  }

  const primary = inheritance.heirs[0]?.memberId ?? null;
  const titleRows = await queryAll<{ title: string }>(
    db,
    "SELECT title FROM character_offices WHERE character_id = ?",
    characterId,
  );
  // Unvan devri: varis olenin makamini devralir (tek makam kurali).
  if (primary && titleRows.length > 0) {
    await execute(
      db,
      `INSERT INTO character_offices (character_id, kingdom_id, title, rank, service_points, updated_at)
       SELECT ?, kingdom_id, title, rank, service_points, ? FROM character_offices WHERE character_id = ?
       ON CONFLICT(character_id) DO NOTHING`,
      primary,
      gameDay,
      characterId,
    );
  }
  await execute(db, "DELETE FROM character_offices WHERE character_id = ?", characterId);

  const updated = adjustReputation(loaded.family, inheritance.dispute ? -3 : 1);
  await execute(db, "UPDATE families SET reputation = ? WHERE id = ?", updated.reputation, membership.family_id);

  if (primary) {
    await notifyCharacter(db, primary, "family_growth", `${note} Miras size ulasti.`, gameDay);
  }
  return {
    familyId: membership.family_id,
    heirCharacterId: primary,
    gold: inheritance.heirs.reduce((s, h) => s + h.gold, 0),
    properties: assignments,
    dispute: inheritance.dispute,
    titles: titleRows.map((t) => t.title),
  };
}

/** Olen karakterin varisini dondurur (varsa). */
export async function heirOf(db: SqlDatabase, characterId: string): Promise<string | null> {
  const membership = await queryOne<{ family_id: string }>(
    db,
    "SELECT family_id FROM family_members WHERE character_id = ? LIMIT 1",
    characterId,
  );
  if (!membership) return null;
  const loaded = await loadFamily(db, membership.family_id);
  if (!loaded) return null;
  const inheritance = distributeInheritance(loaded.family, null, characterId);
  return inheritance.heirs[0]?.memberId ?? null;
}

/**
 * Gunluk ilerleme bildirimi entegrasyonu (belge 6, 19).
 *
 * Gercek SQLite motoru uzerinde dogrular: dunya gunu ilerleyip karakter gunluk
 * olarak degistiginde (aclik artisi, olum) oyuncunun hesabina bildirim yazilir.
 * Ilk gun (baslangic) yaniltici bildirim URETMEZ.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import { execute, queryAll, queryOne, type SqlDatabase } from "../db/client";
import { advanceCharacterDay } from "./service";

async function newCharacter(db: SqlDatabase, id = "c1"): Promise<string> {
  await execute(
    db,
    `INSERT INTO characters (id, account_id, given_name, surname, birth_settlement, current_settlement, age_years, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id,
    "acc1",
    "Kael",
    "Veyr",
    "varkhenn-drahkmar",
    "varkhenn-drahkmar",
    16,
    0,
  );
  await execute(
    db,
    `INSERT INTO character_attributes (character_id, strength, agility, endurance, intellect, charisma, perception, leadership)
     VALUES (?,8,8,8,8,8,8,8)`,
    id,
  );
  return id;
}

async function notifications(db: SqlDatabase): Promise<{ kind: string; summary: string }[]> {
  return queryAll<{ kind: string; summary: string }>(
    db,
    "SELECT kind, summary FROM player_notifications WHERE account_id = 'acc1' ORDER BY created_at",
  );
}

/** Baslangic gunu ve saglik durumunu ayarlar (gercekci ilerleme icin). */
async function prime(db: SqlDatabase, id: string, day: number, health: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify({
    health: 100,
    hunger: 0,
    fatigue: 0,
    injuries: [],
    diseases: [],
    alive: true,
    permanentConditions: [],
    ...health,
  });
  await execute(
    db,
    `INSERT INTO character_state (character_id, health_json, inventory_json, gold, last_advanced_day, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(character_id) DO UPDATE SET health_json=excluded.health_json, last_advanced_day=excluded.last_advanced_day`,
    id,
    json,
    JSON.stringify([]),
    20,
    day,
    0,
  );
}

describe("Gunluk ilerleme bildirimi (belge 6, 19)", () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = createTestDb();
    await seedWorld(db);
    await execute(db, "UPDATE world_clock SET game_day = ? WHERE id = 1", 100);
    await execute(
      db,
      `INSERT OR IGNORE INTO accounts (id, email, password_hash, role, created_at, updated_at)
       VALUES ('acc1','a@b.tr','x','player',0,0)`,
    );
  });

  it("ilk ilerleme (baslangic gunu) bildirim uretmez", async () => {
    const id = await newCharacter(db);
    await advanceCharacterDay(db, id, 105);
    expect(await notifications(db)).toEqual([]);
  });

  it("ikinci ilerleme degisimi bildirir", async () => {
    const id = await newCharacter(db);
    await prime(db, id, 100, { hunger: 10, health: 95 });
    await advanceCharacterDay(db, id, 103); // delta 3 -> bildirir
    const list = await notifications(db);
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("daily_progress");
    expect(list[0]!.summary).toContain("3 gün geçti");
    expect(list[0]!.summary).toContain("açlığın arttı (+24)");
  });

  it("olum bildirimi kritik tur ile yazilir", async () => {
    const id = await newCharacter(db);
    // Siddetli, tedavi edilmemis yara + aclik: toparlanmayi asan hasar olum getirir.
    await prime(db, id, 100, {
      health: 1,
      hunger: 95,
      injuries: [{ id: "i1", kind: "cut", severity: 40, bleeding: 100, infection: 100, treated: false, occurredGameDay: 100 }],
    });
    await advanceCharacterDay(db, id, 115);
    const row = await queryOne<{ kind: string; priority: number }>(
      db,
      "SELECT kind, priority FROM player_notifications WHERE account_id = 'acc1' ORDER BY created_at DESC LIMIT 1",
    );
    expect(row?.kind).toBe("character_death");
    expect(row?.priority).toBe(3);
  });
});

/**
 * Yokluk ozeti entegrasyonu (belge 6, 19).
 *
 * Gercek SQLite motoru uzerinde dogrular: dunya gunu ilerlediginde ve
 * karakter gunluk olarak degistiginde (aclik, saglik, olum), sonraki
 * durum okumasinda `readAbsence` dogru rapor uretir ve `markSeen` goruntuyu
 * tazeler. Boylece oyuncu raporu yalnizca BIR kez gorur.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import { execute, queryOne, type SqlDatabase } from "../db/client";
import { loadState, saveState, advanceCharacterDay, readAbsence, markSeen } from "./service";

async function newCharacter(db: SqlDatabase, id = "c1"): Promise<string> {
  const account = await queryOne<{ id: string }>(db, "SELECT id FROM accounts LIMIT 1");
  await execute(
    db,
    `INSERT INTO characters (id, account_id, given_name, surname, birth_settlement, current_settlement, age_years, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id,
    account?.id ?? null,
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

async function setDay(db: SqlDatabase, day: number): Promise<void> {
  await execute(db, "UPDATE world_clock SET game_day = ? WHERE id = 1", day);
}

describe("Yokluk ozeti (belge 6, 19)", () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = createTestDb();
    await seedWorld(db);
    await setDay(db, 100);
    await execute(
      db,
      `INSERT OR IGNORE INTO accounts (id, email, password_hash, role, created_at, updated_at)
       VALUES ('acc1','a@b.tr','x','player',0,0)`,
    );
  });

  it("anlik goruntu yoksa rapor null olur", async () => {
    const id = await newCharacter(db);
    const state = await loadState(db, id, Date.now());
    expect(await readAbsence(db, id, state!)).toBeNull();
  });

  it("gun ilerleyip aclik artinca rapor uretir ve bir kez gosterilir", async () => {
    const id = await newCharacter(db);
    let state = await loadState(db, id, Date.now());
    await markSeen(db, id, state!);

    // Dunya gunu ilerler; karakter gunluk olarak yaslanir/acikir.
    await setDay(db, 104);
    await advanceCharacterDay(db, id, 104);
    state = await loadState(db, id, Date.now());

    const report = await readAbsence(db, id, state!);
    expect(report).not.toBeNull();
    expect(report!.daysPassed).toBe(4);

    // Goruldu isaretlenince rapor temizlenir (bir kez gosterilir).
    await markSeen(db, id, state!);
    expect(await readAbsence(db, id, state!)).toBeNull();
  });

  it("olum raporlanir", async () => {
    const id = await newCharacter(db);
    const state = await loadState(db, id, Date.now());
    state!.health.alive = true;
    state!.health.health = 100;
    await saveState(db, state!, Date.now());
    await markSeen(db, id, state!);

    // Karakteri olume gotur ve gunu ilerlet.
    await execute(db, "UPDATE character_state SET health_json = ? WHERE character_id = ?", JSON.stringify({
      ...state!.health,
      health: 0,
      alive: false,
    }), id);
    await setDay(db, 101);
    const after = await loadState(db, id, Date.now());
    const report = await readAbsence(db, id, after!);
    expect(report?.died).toBe(true);
  });
});

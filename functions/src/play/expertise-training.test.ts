/**
 * Uzmanlik ilerlemesi, usta egitimi ve kitap kaynagi testleri (belge 5.7, 13.1).
 *
 * Onceden `character_expertise` hic artmiyordu; buyu ogrenme yalnizca tek bir
 * kitabi taniyordu ve "training" kaynagi erisilemez durumdaydi. Bu testler
 * ilerlemenin ve kaynaklarin GERCEKTEN calistigini dogrular.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import { execute, queryOne, type SqlDatabase } from "../db/client";
import {
  loadState,
  saveState,
  performWork,
  performCraft,
  performLearnSpell,
  performTrainSpell,
  expertiseLevel,
} from "./service";
import { masterKingdoms } from "../magic/lore";
import { SETTLEMENTS } from "../world/settlements";

/** Usta bulunan bir kralliktaki ilk yerlesim kimligi. */
function masterSettlement(): string {
  const kingdom = masterKingdoms()[0]!;
  return SETTLEMENTS.find((s) => s.kingdomId === kingdom)!.id;
}

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

/** Envanteri bozulma uygulanmadan yerlestirir (depolama bozulmasi testi bozmasin). */
async function seedInventory(db: SqlDatabase, id: string, entries: { itemId: string; quantity: number; condition: number }[]): Promise<void> {
  const now = Date.now();
  const state = (await loadState(db, id, now))!;
  state.inventory = entries;
  await saveState(db, state, now);
  await execute(
    db,
    "UPDATE character_state SET inventory_decay_day = (SELECT game_day FROM world_clock WHERE id = 1) WHERE character_id = ?",
    id,
  );
}

describe("Uzmanlik ve usta egitimi calisir (belge 5.7, 13.1)", () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = createTestDb();
    await seedWorld(db);
    await execute(
      db,
      `INSERT OR IGNORE INTO accounts (id, email, password_hash, role, created_at, updated_at)
       VALUES ('acc1','a@b.tr','x','player',0,0)`,
    );
  });

  it("calisma meslek uzmanligini ilerletir (onceden hic artmiyordu)", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    expect(await expertiseLevel(db, id, "blacksmith")).toBe(0);

    const res = await performWork(db, id, "blacksmith", 8, now);
    expect(res.ok).toBe(true);
    const row = await queryOne<{ xp: number }>(
      db,
      "SELECT xp FROM character_expertise WHERE character_id = ? AND expertise = ?",
      id,
      "blacksmith",
    );
    expect(row!.xp).toBeGreaterThan(0);
  });

  it("uretim (craft) tarif yolunda uzmanlik kazandirir", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    await seedInventory(db, id, [
      { itemId: "iron-ore", quantity: 3, condition: 1 },
      { itemId: "oak-wood", quantity: 1, condition: 1 },
      { itemId: "woodcutter-axe", quantity: 1, condition: 100 },
    ]);
    await execute(db, "INSERT OR IGNORE INTO character_expertise (character_id, expertise, level, xp) VALUES (?,?,?,?)", id, "blacksmith", 5, 0);

    const res = await performCraft(db, id, "craft-sword", () => 0.01, now);
    expect(res.ok).toBe(true);
    const row = await queryOne<{ xp: number }>(
      db,
      "SELECT xp FROM character_expertise WHERE character_id = ? AND expertise = ?",
      id,
      "blacksmith",
    );
    expect(row!.xp).toBeGreaterThan(0);
  });

  it("tarif gerektirdigi uzmanlik yoksa uretim reddedilir", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    await seedInventory(db, id, [
      { itemId: "iron-ore", quantity: 3, condition: 1 },
      { itemId: "oak-wood", quantity: 1, condition: 1 },
    ]);

    const res = await performCraft(db, id, "craft-sword", () => 0.01, now);
    expect(res.ok).toBe(false);
    expect(res.detail!.reason).toBe("missing_expertise");
  });

  it("buyu ogrenme yolun KENDI kitabini kabul eder (yalnizca tek kitap degil)", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    await seedInventory(db, id, [{ itemId: "tome-of-arcana", quantity: 1, condition: 1 }]);

    const res = await performLearnSpell(db, id, "elemental", now);
    expect(res.ok).toBe(true);
    expect((await loadState(db, id, now))!.magicPaths).toContain("elemental");
  });

  it("kitap ve usta yoksa buyu ogrenme anlasilir neden dondurur", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const res = await performLearnSpell(db, id, "elemental", now);
    expect(res.ok).toBe(false);
    expect(res.detail!.reason).toBe("no_source");
  });

  it("usta egitimi buyu seviyesini artirir ve altin harcar", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    // Usta bulunan kralliga tasi.
    await execute(db, "UPDATE characters SET current_settlement = ? WHERE id = ?", masterSettlement(), id);
    const state = (await loadState(db, id, now))!;
    state.gold = 100;
    state.magicLevel = 0;
    await saveState(db, state, now);

    const res = await performTrainSpell(db, id, now);
    expect(res.ok).toBe(true);
    const after = (await loadState(db, id, now))!;
    expect(after.magicLevel).toBe(1);
    expect(after.gold).toBeLessThan(100);
  });

  it("usta yoksa egitim reddedilir", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.gold = 100;
    await saveState(db, state, now);

    const res = await performTrainSpell(db, id, now);
    expect(res.ok).toBe(false);
    expect(res.detail!.reason).toBe("no_master");
  });

  it("altin yetersizse egitim not_enough_gold dondurur", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    await execute(db, "UPDATE characters SET current_settlement = ? WHERE id = ?", masterSettlement(), id);
    const state = (await loadState(db, id, now))!;
    state.gold = 0;
    await saveState(db, state, now);

    const res = await performTrainSpell(db, id, now);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("not_enough_gold");
    expect(res.detail!.reason).toBe("not_enough_gold");
  });
});

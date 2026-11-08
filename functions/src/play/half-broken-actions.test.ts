/**
 * "Yarim" kalan aksiyonlarin duzeltildigini dogrular.
 *
 * Kapsam: enerji toparlama, tapinak "bilgi"/"barinma" etkileri, evcilleştirmede
 * yem tuketimi ve hata NEDENLERININ (reason) istemciye kadar tasinmasi.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import { execute, queryOne, type SqlDatabase } from "../db/client";
import {
  loadState,
  saveState,
  performRest,
  performTame,
  performTempleService,
  performActivity,
  performUnderworldAct,
} from "./service";

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

describe("Yarim aksiyonlar tamamlandi", () => {
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

  it("dinlenme buyu enerjisini toparlar (aksi halde enerji geri gelmezdi)", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.energy = 10;
    await saveState(db, state, now);

    const res = await performRest(db, id, 4, now);
    expect(res.ok).toBe(true);
    expect((await loadState(db, id, now))!.energy).toBeGreaterThan(10);
  });

  it("tapinak 'bilgi' hizmeti buyu seviyesini artirir", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.gold = 100;
    state.magicLevel = 0;
    await saveState(db, state, now);

    const res = await performTempleService(db, id, "knowledge", now);
    expect(res.ok).toBe(true);
    expect((await loadState(db, id, now))!.magicLevel).toBe(1);
  });

  it("tapinak 'barinma' hizmeti bitkinligi dusurur (onceden etkisizdi)", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.gold = 100;
    state.health = { ...state.health, fatigue: 60 };
    await saveState(db, state, now);

    const res = await performTempleService(db, id, "shelter", now);
    expect(res.ok).toBe(true);
    expect((await loadState(db, id, now))!.health.fatigue).toBeLessThan(60);
  });

  it("evcilleştirme yalnizca ekmek varken de calisir ve ekmegi tuketir", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.weaponMastery = 25;
    state.inventory = [{ itemId: "bread", quantity: 2, condition: 1 }];
    await saveState(db, state, now);
    // Bozulmayi devre disi birak: aksi halde ekmek yuklemede azalip testi bozar.
    await execute(db, "UPDATE character_state SET inventory_decay_day = 1 WHERE character_id = ?", id);

    const res = await performTame(db, id, "fox", now);
    expect(res.ok).toBe(true);
    const after = (await loadState(db, id, now))!;
    expect(after.inventory.find((e) => e.itemId === "bread")?.quantity ?? 0).toBe(1);
  });

  it("evcilleştirme yem yoksa anlasilir neden dondurur", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.weaponMastery = 25;
    state.inventory = [];
    await saveState(db, state, now);

    const res = await performTame(db, id, "fox", now);
    expect(res.ok).toBe(false);
    expect(res.detail!.reason).toBe("no_feed");
  });

  it("bilinmeyen etkinlik not_enough_gold degil invalid_action + reason dondurur", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const state = (await loadState(db, id, now))!;
    state.gold = 1000;
    await saveState(db, state, now);

    const res = await performActivity(db, id, "does-not-exist" as never, Math.random, now);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid_action");
    expect(res.detail!.reason).toBe("unknown_activity");
  });

  it("yeralti aksiyonunun nedeni kaybolmaz", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const res = await performUnderworldAct(db, id, "does-not-exist" as never, 50, false, Math.random, now);
    expect(res.ok).toBe(false);
    expect(res.detail!.reason).toBe("unknown_action");
  });
});

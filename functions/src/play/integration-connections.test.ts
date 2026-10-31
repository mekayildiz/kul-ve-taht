/**
 * Bagli saf fonksiyon testleri (belge 9.7-9.9, 12.4, 14.4, 16.5).
 *
 * Modul olarak var olan ancak oynanisa baglanmamis fonksiyonlarin artik
 * GERCEKTEN calistigini dogrular: lonca kazanci, vergi toplama/huzursuzluk,
 * kitlik riski, gorev-kisilik etkilesimi, PvP kurali ve hedef ilerletme.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import { execute, queryOne, type SqlDatabase } from "../db/client";
import { performWork, performJoinGuild, loadState, saveState } from "./service";
import { runKingdomBudget } from "./storage";
import { runWorldSimulation } from "./world-sim";
import { duelAllowed } from "./systems";
import { startQuest, advanceQuestByTag, claimQuestReward, questLog } from "./quests";
import { loadPersonality } from "./personality";
import { guildBenefits } from "../magic/lore";

async function newCharacter(db: SqlDatabase, id = "c1"): Promise<string> {
  const account = await queryOne<{ id: string }>(db, "SELECT id FROM accounts LIMIT 1");
  await execute(
    db,
    `INSERT INTO characters (id, account_id, given_name, surname, birth_settlement, current_settlement, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    id,
    account?.id ?? null,
    "Kael",
    "Veyr",
    "varkhenn-drahkmar",
    "varkhenn-drahkmar",
    0,
  );
  await execute(
    db,
    `INSERT INTO character_attributes (character_id, strength, agility, endurance, intellect, charisma, perception, leadership)
     VALUES (?,8,8,8,8,8,8,8)`,
    id,
  );
  const state = await loadState(db, id, Date.now());
  if (state) {
    state.gold = 1000;
    state.weaponMastery = 15;
    await saveState(db, state, Date.now());
  }
  return id;
}

describe("Bagli saf fonksiyonlar oynanista calisir (belge 9, 12, 14, 16)", () => {
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

  it("lonca uyeligi calisma kazancini artirir (belge 14.4)", async () => {
    const id = await newCharacter(db);
    const now = Date.now();
    const before = (await loadState(db, id, now))!.gold;
    const plain = await performWork(db, id, "blacksmith", 4, now);
    const plainGain = plain.detail!.income as number;

    const join = await performJoinGuild(db, id, "smiths", now);
    expect(join.ok).toBe(true);
    const afterJoin = (await loadState(db, id, now))!.gold;
    expect(afterJoin).toBeLessThan(before + plainGain); // dues odendi

    // Kidem ilerledikce lonca bonusu acilir (belge 14.4).
    await execute(db, "UPDATE character_guilds SET joined_at = ? WHERE character_id = ?", now - 180 * 86_400_000, id);
    const guilded = await performWork(db, id, "blacksmith", 4, now);
    expect(guilded.detail!.guildBonus).toBeGreaterThan(0);
    expect(guilded.detail!.income as number).toBeGreaterThan(plainGain);
    expect(guildBenefits("smiths", 180).workBonus).toBeGreaterThan(0);
  });

  it("vergi toplama uyum ve huzursuzluk uretir (belge 9.7-9.8)", async () => {
    const res = await runKingdomBudget(db, "varkhenn");
    expect(res).not.toBeNull();
    const row = await queryOne<{ tax_compliance: number; unrest: number }>(
      db,
      "SELECT tax_compliance, unrest FROM kingdoms WHERE id = 'varkhenn'",
    );
    expect(row!.tax_compliance).toBeGreaterThan(0);
    expect(row!.unrest).toBeGreaterThanOrEqual(0);
  });

  it("kitlik riski gunluk olayi kitlige cevirebilir (belge 9.9)", async () => {
    // Tahil stogunu sifira cekip nufusu yuksek tutarak riski zorla.
    await execute(db, "UPDATE market_state SET supply = 0 WHERE item_id = 'wheat'");
    await execute(db, "UPDATE settlements SET population = 50000");
    const result = await runWorldSimulation(db, 1);
    expect(result.events.length).toBeGreaterThan(0);
    const log = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM world_event_log WHERE game_day = 1");
    expect(log!.n).toBeGreaterThan(0);
  });

  it("gorev odulu kalici kisiligi degistirir (belge 12.4)", async () => {
    const id = await newCharacter(db);
    await startQuest(db, id, "main-ashes-1");
    await advanceQuestByTag(db, id, "explore:forest", 2);
    await advanceQuestByTag(db, id, "hunt:wolf", 1);
    const log = await questLog(db, id);
    expect(log[0]!.objectives.every((o) => o.progress >= o.required)).toBe(true);

    const before = await loadPersonality(db, id);
    const reward = await claimQuestReward(db, id, "main-ashes-1");
    expect(reward.ok).toBe(true);
    expect(reward.detail!.personalityShift).not.toBeNull();
    const after = await loadPersonality(db, id);
    expect(after.courage).toBeGreaterThan(before.courage);
  });

  it("guvenli sehirde duello riza olmadan reddedilir; savasta serbesttir (belge 16.5)", async () => {
    const id = await newCharacter(db);
    const noConsent = await duelAllowed(db, id, false);
    expect(noConsent.allowed).toBe(false);
    expect(noConsent.safeCity).toBe(true);

    const consent = await duelAllowed(db, id, true);
    expect(consent.allowed).toBe(true);
  });
});

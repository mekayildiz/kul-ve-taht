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
import { performWork, performJoinGuild, loadState, saveState, advanceCharacterDay, advanceAllCharacters, performCastSpell } from "./service";
import { runKingdomBudget } from "./storage";
import { runWorldSimulation } from "./world-sim";
import { duelAllowed, performSetRelationship } from "./systems";
import { performMarry } from "./multiplayer";
import { areMutualFriends } from "./multiplayer-extras";
import { auditKingdomCorruption } from "./storage";
import { execute as exec2, queryOne as q1 } from "../db/client";
import { startQuest, advanceQuestByTag, claimQuestReward, questLog } from "./quests";
import { loadPersonality } from "./personality";
import { guildBenefits } from "../magic/lore";

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

  it("karakter gunluk ilerlemesi dunya saatine baglidir ve idempotenttir (belge 6)", async () => {
    const id = await newCharacter(db);
    // Dunya gunu 1'den 5'e ilerledi; karakter aclik ve yaslanma ile ilerler.
    const first = await advanceCharacterDay(db, id, 5);
    expect(first.ok).toBe(true);
    expect(first.detail!.advancedDays).toBe(5);

    const hungry = (await loadState(db, id, Date.now()))!.health.hunger;
    expect(hungry).toBeGreaterThan(0);

    // Ayni gun icin tekrar cagrilirsa ilerleme YAPILMAZ (idempotent).
    const again = await advanceCharacterDay(db, id, 5);
    expect(again.detail!.advancedDays).toBe(0);
    expect((await loadState(db, id, Date.now()))!.health.hunger).toBe(hungry);
  });

  it("dunya saati turunda butun canli karakterler ilerletilir (belge 6)", async () => {
    const a = await newCharacter(db, "c-a");
    await newCharacter(db, "c-b");
    const processed = await advanceAllCharacters(db, 3);
    expect(processed).toBeGreaterThanOrEqual(2);
    const row = await q1<{ last_advanced_day: number }>(
      db,
      "SELECT last_advanced_day FROM character_state WHERE character_id = ?",
      a,
    );
    expect(row!.last_advanced_day).toBe(3);
  });

  it("kara buyu yasakli krallikta suc sayilir (belge 13.1, 13.4)", async () => {
    const id = await newCharacter(db);
    // varkhenn ruh cagirmayi yasaklar; ogrenme yasagi nedeniyle once seviye verilir.
    await exec2(db, "UPDATE character_state SET magic_level = 30, energy = 100 WHERE character_id = ?", id);
    await exec2(
      db,
      "INSERT OR IGNORE INTO character_expertise (character_id, expertise, level, xp) VALUES (?,?,?,?)",
      id, "spirit_caller", 30, 0,
    );
    const cast = await performCastSpell(db, id, "raise-spirit");
    expect(cast.ok).toBe(true);
    expect(cast.detail!.outlawed).toBe(true);

    // Yasak olmayan yolda suc sayilmaz.
    await exec2(db, "UPDATE character_state SET magic_level = 5, energy = 100 WHERE character_id = ?", id);
    const ok = await performCastSpell(db, id, "flame-bolt");
    expect(ok.ok).toBe(true);
    expect(ok.detail!.outlawed).toBe(false);
  });

  it("oyuncu-oyuncu evliligi karsilikli arkadaslik ister (belge 7.1, 16.3)", async () => {
    const a = await newCharacter(db, "c-a");
    const b = await newCharacter(db, "c-b");
    // Tek tarafli arkadaslik yeterli degildir.
    await performSetRelationship(db, a, b, "friend");
    expect(await areMutualFriends(db, a, b)).toBe(false);
    const denied = await performMarry(db, a, "B Kisi", b, true);
    expect(denied.ok).toBe(false);
    expect(denied.detail!.reason).toBe("no_mutual_consent");

    // Iki tarafli riza (karsilikli arkadaslik) ile evlilik kurulur.
    await performSetRelationship(db, b, a, "friend");
    expect(await areMutualFriends(db, a, b)).toBe(true);
    const married = await performMarry(db, a, "B Kisi", b, true);
    expect(married.ok).toBe(true);
  });

  it("yolsuzluk denetimi kayip geliri ortaya cikarir ve hazineye doner (belge 9.8)", async () => {
    const before = await q1<{ treasury: number }>(db, "SELECT treasury FROM kingdoms WHERE id = 'varkhenn'");
    const res = await auditKingdomCorruption(db, "varkhenn", 0, 0.5);
    expect(res).not.toBeNull();
    expect(res!.detected).toBeGreaterThan(0);
    const after = await q1<{ treasury: number }>(db, "SELECT treasury FROM kingdoms WHERE id = 'varkhenn'");
    expect(after!.treasury).toBe(before!.treasury + res!.detected);
  });
});

/**
 * Belge 8 (NPC simulasyonu), 9 (ekonomi) ve 19 (olay gunlugu) kapsam testi.
 *
 * Modul olarak var olan ancak hicbir zaman calistirilmayan katmanli NPC
 * simulasyonunun gercekten calistigini, Free plan sinirlari icinde partili
 * oldugunu ve dunya olaylarinin kalici yazildigini dogrular.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import {
  simulateNpcBatch,
  runWorldSimulation,
  applyWorldDisruption,
  disruptionFor,
  intervalFor,
} from "./world-sim";
import type { SqlDatabase } from "../db/client";
import { queryAll, queryOne } from "../db/client";

async function count(db: SqlDatabase, sql: string, ...params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: number }>(db, sql, ...params);
  return row?.n ?? 0;
}

describe("Katmanli dunya simulasyonu (belge 8.8, 9.4, 19.4)", () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = createTestDb();
    await seedWorld(db);
  });

  it("her yerlesime katmanli NPC tohumlar (belge 8.8)", async () => {
    const total = await count(db, "SELECT COUNT(*) AS n FROM npcs");
    expect(total).toBeGreaterThan(900);

    const important = await count(db, "SELECT COUNT(*) AS n FROM npcs WHERE importance = 'critical'");
    const local = await count(db, "SELECT COUNT(*) AS n FROM npcs WHERE importance = 'notable'");
    const background = await count(db, "SELECT COUNT(*) AS n FROM npcs WHERE importance = 'background'");
    expect(important).toBeGreaterThan(0);
    expect(local).toBeGreaterThan(important);
    expect(background).toBeGreaterThan(local);
  });

  it("tohumlama idempotenttir; ikinci cagri yeni NPC eklemez", async () => {
    const before = await count(db, "SELECT COUNT(*) AS n FROM npcs");
    await seedWorld(db);
    const after = await count(db, "SELECT COUNT(*) AS n FROM npcs");
    expect(after).toBe(before);
  });

  it("katman araliklari onemli=1, yerel=7, arka plan=30 gundur (belge 8.8)", () => {
    expect(intervalFor("critical")).toBe(1);
    expect(intervalFor("notable")).toBe(7);
    expect(intervalFor("background")).toBe(30);
  });

  it("onemli NPC 1. gunde islenir, arka plan nufus islenmez (belge 8.8)", async () => {
    const processed = await simulateNpcBatch(db, 1);
    expect(processed).toBeGreaterThan(0);

    const importantSim = await count(
      db,
      "SELECT COUNT(*) AS n FROM npcs WHERE importance = 'critical' AND last_simulated_day = 1",
    );
    expect(importantSim).toBeGreaterThan(0);

    const backgroundSim = await count(
      db,
      "SELECT COUNT(*) AS n FROM npcs WHERE importance = 'background' AND last_simulated_day = 1",
    );
    expect(backgroundSim).toBe(0);
  });

  it("islenen NPC'nin ihtiyac ve hedefi guncellenir (belge 8.1)", async () => {
    await simulateNpcBatch(db, 1);
    const row = await queryOne<{ needs_json: string; goals_json: string; gold: number }>(
      db,
      "SELECT needs_json, goals_json, gold FROM npcs WHERE importance = 'critical' AND last_simulated_day = 1 LIMIT 1",
    );
    expect(row).not.toBeNull();
    const needs = JSON.parse(row!.needs_json) as Record<string, number>;
    expect(Object.keys(needs)).toContain("food");
    const goals = JSON.parse(row!.goals_json) as string[];
    expect(goals.length).toBeGreaterThan(0);
  });

  it("tek parti Free plan yazma kotasini asmaz (belge 8.8)", async () => {
    const processed = await simulateNpcBatch(db, 1, 50);
    expect(processed).toBeLessThanOrEqual(50);
  });

  it("dunya turu olay uretir ve gunluge yazar (belge 19.4)", async () => {
    const result = await runWorldSimulation(db, 1);
    expect(result.processed).toBeGreaterThan(0);
    expect(result.events.length).toBe(1);

    const logged = await count(db, "SELECT COUNT(*) AS n FROM world_event_log WHERE game_day = 1");
    expect(logged).toBe(1);
  });

  it("dunya turu idempotenttir; ayni gun tekrar olay uretmez (belge 19.4)", async () => {
    await runWorldSimulation(db, 5);
    const second = await runWorldSimulation(db, 5);
    expect(second.events).toHaveLength(0);
    const logged = await count(db, "SELECT COUNT(*) AS n FROM world_event_log WHERE game_day = 5");
    expect(logged).toBe(1);
  });

  it("bozulma olayi pazar carpanini ve olay gunlugunu yazar (belge 9.4)", async () => {
    await applyWorldDisruption(db, 3, "varkhenn-drahkmar", "famine", Date.now());
    const market = await queryOne<{ supply: number; demand: number }>(
      db,
      "SELECT supply, demand FROM market_state WHERE settlement_id = ? AND item_id = '*'",
      "varkhenn-drahkmar",
    );
    expect(market).not.toBeNull();
    expect(market!.supply).toBeGreaterThan(0);

    const events = await queryAll<{ event_type: string; settlement_id: string }>(
      db,
      "SELECT event_type, settlement_id FROM world_event_log WHERE game_day = 3",
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.event_type).toBe("famine");
    expect(events[0]!.settlement_id).toBe("varkhenn-drahkmar");
  });

  it("bozulma turleri dongusel ve gecerli (belge 9.4)", () => {
    const kinds = new Set(["war", "famine", "trade_route_crisis", "banditry", "plague"]);
    for (let day = 0; day < 10; day += 1) {
      expect(kinds.has(disruptionFor(day))).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestDb } from "../test-support/sqlite-harness";
import { queryOne } from "../db/client";
import { KINGDOMS } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";
import { FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";

const MIGRATION = join(process.cwd(), "db", "migrations", "0003_world_reference.sql");

describe("dunya referans migration'i", () => {
  it("uygulandiginda 5 krallik ve 130 krallik yerlesimi yukler", async () => {
    const db = createTestDb();
    const kingdoms = await queryOne<{ c: number }>(db, "SELECT COUNT(*) AS c FROM kingdoms");
    const settlements = await queryOne<{ c: number }>(db, "SELECT COUNT(*) AS c FROM settlements");
    expect(kingdoms?.c).toBe(5);
    // 130 krallik yerlesimi + bagimsiz sehirler + tarafsiz bolgeler.
    expect(settlements?.c).toBe(130 + FREE_CITIES.length + NEUTRAL_ZONES.length);
  });

  it("her krallikta tam 26 yerlesim vardir", async () => {
    const db = createTestDb();
    for (const kingdom of KINGDOMS) {
      const row = await queryOne<{ c: number }>(
        db,
        "SELECT COUNT(*) AS c FROM settlements WHERE kingdom_id = ?",
        kingdom.id,
      );
      expect(row?.c, `${kingdom.id} icin 26 yerlesim bekleniyordu`).toBe(26);
    }
  });

  it("TS kaynagi ile migration senkrondur (tek kaynak)", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    for (const kingdom of KINGDOMS) {
      expect(sql).toContain(`'${kingdom.id}'`);
      expect(sql).toContain(`'${kingdom.capital}'`);
    }
    for (const settlement of SETTLEMENTS) {
      expect(sql).toContain(`'${settlement.id}'`);
    }
    // Yerlesim sayisi = 130 krallik yerlesimi + bagimsiz sehir + tarafsiz bolge.
    const inserts = sql.split("INSERT OR IGNORE INTO settlements").length - 1;
    expect(inserts).toBe(SETTLEMENTS.length + FREE_CITIES.length + NEUTRAL_ZONES.length);
  });

  it("yabanci anahtar: kralliga bagli yerlesimler gecerli kralliga baglidir", async () => {
    const db = createTestDb();
    // Bagimsiz sehirler/tarafsiz bolgeler NULL kingdom_id tasir; onlar haric.
    const orphan = await queryOne<{ c: number }>(
      db,
      "SELECT COUNT(*) AS c FROM settlements WHERE kingdom_id IS NOT NULL AND kingdom_id NOT IN (SELECT id FROM kingdoms)",
    );
    expect(orphan?.c).toBe(0);
  });

  it("her yerlesim belge 20 geregi nufus ve guvenlik verisi tasir", async () => {
    const db = createTestDb();
    const missing = await queryOne<{ c: number }>(
      db,
      "SELECT COUNT(*) AS c FROM settlements WHERE population <= 0 OR security <= 0",
    );
    expect(missing?.c).toBe(0);
  });
});

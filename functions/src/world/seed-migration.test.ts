import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestDb } from "../test-support/sqlite-harness";
import { queryOne } from "../db/client";
import { KINGDOMS } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";

const MIGRATION = join(process.cwd(), "db", "migrations", "0003_world_reference.sql");

describe("dunya referans migration'i", () => {
  it("uygulandiginda 5 krallik ve 130 yerlesim yukler", async () => {
    const db = createTestDb();
    const kingdoms = await queryOne<{ c: number }>(db, "SELECT COUNT(*) AS c FROM kingdoms");
    const settlements = await queryOne<{ c: number }>(db, "SELECT COUNT(*) AS c FROM settlements");
    expect(kingdoms?.c).toBe(5);
    expect(settlements?.c).toBe(130);
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
    // Yerlesim sayisi migration'daki INSERT sayisiyla eslesmeli.
    const inserts = sql.split("INSERT OR IGNORE INTO settlements").length - 1;
    expect(inserts).toBe(SETTLEMENTS.length);
  });

  it("yabanci anahtar: yerlesimler gecerli kralliga baglidir", async () => {
    const db = createTestDb();
    const orphan = await queryOne<{ c: number }>(
      db,
      "SELECT COUNT(*) AS c FROM settlements WHERE kingdom_id NOT IN (SELECT id FROM kingdoms)",
    );
    expect(orphan?.c).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { queryAll, queryOne, execute, type SqlDatabase, type SqlStatement } from "./client";

/**
 * Saglayici bagimsizlik testi: ayni repository kodu, gercek SQLite motoru
 * uzerinde calisir. D1 ve Turso ayni SQLite ortak alt kumesini kullandigi
 * icin bu test SQL uyumlulugunu ve veri butunlugunu dogrular.
 */

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

function makeDb(): SqlDatabase {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (p: string) => SqliteDb };
  const raw = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(dir, file), "utf8"));
  }
  raw.exec("PRAGMA foreign_keys = ON");

  const wrap = (sql: string, params: unknown[]): SqlStatement => {
    const statement = {
      bind: (...values: unknown[]) => wrap(sql, values),
      first: async <T,>() => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
      all: async <T,>() => ({ results: raw.prepare(sql).all(...params) as T[] }),
      run: async () => {
        raw.prepare(sql).run(...params);
        return { success: true };
      },
    };
    return statement;
  };

  return {
    prepare: (sql: string) => wrap(sql, []),
    batch: async () => [],
    exec: async (sql: string) => {
      raw.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

describe("saglayici bagimsiz veri katmani", () => {
  it("parametreli sorgu ile kayit ekler ve okur", async () => {
    const db = makeDb();
    const now = Date.now();
    await execute(
      db,
      "INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
      "acc-1", "a@example.com", "hash", "player", "tr", "active", now, now,
    );
    const row = await queryOne<{ email: string }>(db, "SELECT email FROM accounts WHERE id = ?", "acc-1");
    expect(row?.email).toBe("a@example.com");
  });

  it("SQL enjeksiyonunu parametreleme ile onler", async () => {
    const db = makeDb();
    const malicious = "x'; DROP TABLE accounts; --";
    const now = Date.now();
    await execute(
      db,
      "INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
      "acc-2", malicious, "hash", "player", "tr", "active", now, now,
    );
    const rows = await queryAll<{ email: string }>(db, "SELECT email FROM accounts");
    expect(rows.some((r) => r.email === malicious)).toBe(true);
    // Tablo hala yerinde (enjeksiyon calismadi)
    const tables = await queryAll<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'",
    );
    expect(tables).toHaveLength(1);
  });

  it("dis anahtar butunlugunu korur", async () => {
    const db = makeDb();
    await expect(
      execute(db, "INSERT INTO characters (id, account_id, given_name, surname, age_years, created_at) VALUES (?,?,?,?,?,?)",
        "c1", "olmayan-hesap", "Ali", "Veyr", 20, Date.now()),
    ).rejects.toThrow();
  });

  it("benzersizlik kisitini uygular (veri butunlugu)", async () => {
    const db = makeDb();
    const now = Date.now();
    const insert = (id: string) =>
      execute(
        db,
        "INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        id, "tek@example.com", "hash", "player", "tr", "active", now, now,
      );
    await insert("acc-3");
    await expect(insert("acc-4")).rejects.toThrow();
  });

  it("idempotency anahtari tekrar saldirisini engeller", async () => {
    const db = makeDb();
    const now = Date.now();
    await execute(
      db,
      "INSERT INTO settlements (id, name, kind, x, y, primary_output) VALUES (?,?,?,?,?,?)",
      "varkhenn-drahkmar", "Drahkmar", "capital", 50, 15, "Yönetim",
    );
    await execute(
      db,
      "INSERT INTO trade_offers (id, offerer_type, offerer_id, settlement_id, status, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)",
      "o1", "character", "c1", "varkhenn-drahkmar", "open", "key-1", now,
    );
    await expect(
      execute(
        db,
        "INSERT INTO trade_offers (id, offerer_type, offerer_id, settlement_id, status, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)",
        "o2", "character", "c1", "varkhenn-drahkmar", "open", "key-1", now,
      ),
    ).rejects.toThrow();
  });
});

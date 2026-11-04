import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

// node:sqlite Vite tarafindan statik olarak cozulemedigi icin hesaplanmis
// belirtec ile dinamik import edilir.
type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[]; get(): unknown; run(...args: unknown[]): unknown };
};

function loadSqlite(): new (path: string) => SqliteDb {
  // createRequire, Vite'in import analizini tamamen baypas eder; boylece
  // node:sqlite yerlesik modulu oldugu gibi yuklenir.
  const require = createRequire(import.meta.url);
  const mod = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDb };
  return mod.DatabaseSync;
}

function freshDb(): SqliteDb {
  const DatabaseSync = loadSqlite();
  const db = new DatabaseSync(":memory:");
  for (const file of migrationFiles()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/** 21.2'deki 19 varlik grubunu temsil eden zorunlu tablolar. */
const REQUIRED_TABLES = [
  "accounts",
  "characters",
  "character_attributes",
  "families",
  "npcs",
  "memories",
  "kingdoms",
  "settlements",
  "map_nodes",
  "items",
  "professions",
  "properties",
  "markets",
  "banks",
  "units",
  "quests",
  "messages",
  "visual_assets",
  "notifications",
];

describe("D1 semasi", () => {
  it("tum migration'lari hatasiz uygular", () => {
    expect(() => freshDb()).not.toThrow();
  });

  it("21.2'deki 19 varlik grubunu kapsar", () => {
    const db = freshDb();
    const names = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => String((r as { name: string }).name)),
    );
    for (const table of REQUIRED_TABLES) {
      expect(names.has(table), `eksik tablo: ${table}`).toBe(true);
    }
  });

  it("dunya saatini 6 gercek saat = 1 oyun gunu ile baslatir", () => {
    const db = freshDb();
    const clock = db.prepare("SELECT * FROM world_clock WHERE id = 1").get() as Record<string, unknown>;
    expect(clock.game_day).toBe(1);
    expect(clock.real_hours_per_game_day).toBe(6);
  });

  it("dis anahtar kisitlarini uygular", () => {
    const db = freshDb();
    db.exec("PRAGMA foreign_keys = ON");
    expect(() =>
      db
        .prepare("INSERT INTO sessions (id, account_id, token_hash, issued_at, expires_at) VALUES (?,?,?,?,?)")
        .run("s1", "yok-boyle-hesap", "h", 0, 1),
    ).toThrow();
  });

  it("RLS yerine sunucu tarafli yetkilendirme icin audit_log icerir", () => {
    const db = freshDb();
    const names = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => String((r as { name: string }).name)),
    );
    expect(names.has("audit_log")).toBe(true);
  });
});

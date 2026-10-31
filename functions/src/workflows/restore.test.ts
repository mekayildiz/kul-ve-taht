import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { verifyBackupIntegrity, restoreFromBackup, CRITICAL_TABLES } from "./restore";

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown; run(...p: unknown[]): unknown };
}

function loadSqlite(): new (path: string) => RawDb {
  const require = createRequire(import.meta.url);
  return (require("node:sqlite") as { DatabaseSync: new (p: string) => RawDb }).DatabaseSync;
}

function applyMigrations(raw: RawDb): void {
  const dir = join(process.cwd(), "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(dir, file), "utf8"));
  }
}

describe("yedek butunlugu", () => {
  it("beklenen tablolar varsa gecerli sayar", () => {
    const sql = "CREATE TABLE accounts (id TEXT PRIMARY KEY); CREATE TABLE settlements (id TEXT PRIMARY KEY);";
    const result = verifyBackupIntegrity(sql, ["accounts", "settlements"]);
    expect(result.valid).toBe(true);
    expect(result.tables).toEqual(["accounts", "settlements"]);
  });

  it("eksik tabloyu tespit eder", () => {
    const result = verifyBackupIntegrity("CREATE TABLE accounts (id TEXT);", ["accounts", "settlements"]);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("settlements"))).toBe(true);
  });

  it("yikici ifadeleri (DROP TABLE) reddeder", () => {
    const sql = "CREATE TABLE accounts (id TEXT); DROP TABLE accounts;";
    const result = verifyBackupIntegrity(sql, ["accounts"]);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.toLowerCase().includes("drop"))).toBe(true);
  });

  it("kritik tablo listesi 21.2 varliklarini kapsar", () => {
    expect(CRITICAL_TABLES).toContain("accounts");
    expect(CRITICAL_TABLES).toContain("settlements");
    expect(CRITICAL_TABLES).toContain("world_clock");
  });
});

describe("gercek yedek -> geri yukleme dongusu", () => {
  it("semayi ve veriyi gercek SQLite'a geri yukler", async () => {
    const DatabaseSync = loadSqlite();
    const source = new DatabaseSync(":memory:");
    applyMigrations(source);
    source.exec(
      "INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at) VALUES ('a1','x@y.tr','h','player','tr','active',1,1)",
    );

    // Kaynak semadan gercek bir dump uret.
    const schemaSql = readdirSync(join(process.cwd(), "db", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(process.cwd(), "db", "migrations", f), "utf8"))
      .join("\n");
    // Dump = sema + referans veri + oyuncu verisi (0003 zaten yerlesimleri ekler).
    const dump = `${schemaSql}
INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at) VALUES ('a1','x@y.tr','h','player','tr','active',1,1);`;

    // Bos hedef veritabani.
    const target = new DatabaseSync(":memory:");
    const result = await restoreFromBackup(
      { exec: async (sql: string) => void target.exec(sql) },
      dump,
      CRITICAL_TABLES,
    );

    expect(result.restored).toBe(true);
    expect(result.integrity.valid).toBe(true);
    const row = target.prepare("SELECT email FROM accounts WHERE id = 'a1'").get() as { email: string } | undefined;
    expect(row?.email).toBe("x@y.tr");
    const count = target.prepare("SELECT COUNT(*) AS c FROM settlements").get() as { c: number };
    // Referans veri (0003) da geri yuklenir: 130 yerlesim.
    expect(count.c).toBe(130);
  });

  it("bozuk dump HICBIR sey uygulamaz (kismi geri yukleme yok)", async () => {
    const DatabaseSync = loadSqlite();
    const target = new DatabaseSync(":memory:");
    let applied = 0;
    const result = await restoreFromBackup(
      {
        exec: async (sql: string) => {
          applied += 1;
          target.exec(sql);
        },
      },
      "DROP TABLE accounts;",
      CRITICAL_TABLES,
    );
    expect(result.restored).toBe(false);
    expect(applied).toBe(0);
  });
});

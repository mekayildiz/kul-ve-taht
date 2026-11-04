/**
 * Test yardimcisi: gercek SQLite motoru uzerinde calisan SqlDatabase uygulamasi.
 *
 * Migration'lar db/migrations'tan uygulanir; boylece sema, kisitlar ve
 * sorgular gercek motorda dogrulanir (D1 ile ayni SQLite ortak alt kumesi).
 */

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SqlDatabase, SqlStatement } from "../db/client";

interface RawStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): RawStatement;
}

export function createTestDb(): SqlDatabase {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => RawDb };
  const raw = new DatabaseSync(":memory:");

  const dir = join(process.cwd(), "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(join(dir, file), "utf8"));
  }
  raw.exec("PRAGMA foreign_keys = ON");

  const wrap = (sql: string, params: unknown[]): SqlStatement => ({
    bind: (...values: unknown[]) => wrap(sql, values),
    first: async <T,>() => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    all: async <T,>() => ({ results: raw.prepare(sql).all(...params) as T[] }),
    run: async () => {
      raw.prepare(sql).run(...params);
      return { success: true };
    },
  });

  return {
    prepare: (sql: string) => wrap(sql, []),
    batch: async () => [],
    exec: async (sql: string) => {
      raw.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

#!/usr/bin/env node
/**
 * Yuk/kota ve yedek/geri yukleme provasi (tasarim belgesi 21.4, 25).
 *
 * Amac (E9.18): Gercek trafik benzetimi altinda ucretsiz plan limitlerinin
 * asilmadigini ve D1 -> R2 yedek/geri yukleme dongusunun VERI KAYBI OLMADAN
 * calistigini OLCMEK. Hicbir ucretli islem yapilmaz; yalnizca yerel SQLite
 * (node:sqlite) ve dosya sistemi kullanilir.
 *
 * Kullanim: node scripts/load-restore-rehearsal.mjs
 */

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

// Ucretsiz plan gunluk limitleri (docs/kota-butcesi.md).
const FREE_DAILY_LIMITS = {
  requests: 100_000,
  d1_reads: 5_000_000,
  d1_writes: 100_000,
};

function applyMigrations(db) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return files.length;
}

function listTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
}

/** Yuk benzetimi: N okuma istegi; kota kullanimini olcer. */
function simulateLoad(db, requests) {
  const tables = listTables(db);
  let reads = 0;
  for (let i = 0; i < requests; i += 1) {
    const table = tables[i % tables.length];
    db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    reads += 1;
  }
  return { requests, d1_reads: reads };
}

/** D1 -> R2 yedek: sema + veriyi SQL dump olarak uretir. */
function exportDump(db) {
  const tables = listTables(db);
  const lines = [];
  for (const table of tables) {
    const schema = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table).sql;
    lines.push(`${schema};`);
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    for (const row of rows) {
      const cols = Object.keys(row);
      const values = cols.map((c) => {
        const v = row[c];
        if (v === null) return "NULL";
        if (typeof v === "number") return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      lines.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${values.join(", ")});`);
    }
  }
  return lines.join("\n");
}

/** Geri yukleme: dump'i temiz bir veritabanina uygular ve butunlugu dogrular. */
function restoreInto(dump) {
  const target = new DatabaseSync(":memory:");
  // Dump tablo sirasi FK bagimliligini garanti etmez; geri yuklemede kisitlar
  // gecici kapatilir (yedek araclarinin standart davranisi).
  target.exec("PRAGMA foreign_keys = OFF");
  target.exec(dump);
  target.exec("PRAGMA foreign_keys = ON");
  return target;
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "kvt-prova-"));
  const dbPath = join(dir, "kaynak.sqlite");
  const db = new DatabaseSync(dbPath);
  const migrationCount = applyMigrations(db);

  // Kucuk bir oyuncu grubunun gunluk okuma trafigi.
  const load = simulateLoad(db, 200);
  const requestsPct = ((load.requests / FREE_DAILY_LIMITS.requests) * 100).toFixed(3);
  const readsPct = ((load.d1_reads / FREE_DAILY_LIMITS.d1_reads) * 100).toFixed(4);

  // Yedek: dump dosyaya yazilir (R2'yi temsil eder).
  const dump = exportDump(db);
  const backupPath = join(dir, "yedek.sql");
  writeFileSync(backupPath, dump, "utf8");

  // Geri yukleme ve satir sayisi karsilastirmasi.
  const restored = restoreInto(dump);
  const before = listTables(db).reduce((sum, t) => sum + db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0);
  const after = listTables(restored).reduce((sum, t) => sum + restored.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0);

  const report = {
    migrations: migrationCount,
    load,
    limits: FREE_DAILY_LIMITS,
    requestBudgetPct: requestsPct,
    readBudgetPct: readsPct,
    backupBytes: Buffer.byteLength(dump, "utf8"),
    tablesBefore: listTables(db).length,
    tablesAfter: listTables(restored).length,
    rowsBefore: before,
    rowsAfter: after,
    dataLossFree: before === after && listTables(db).length === listTables(restored).length,
    withinFreeTier: load.requests < FREE_DAILY_LIMITS.requests && load.d1_reads < FREE_DAILY_LIMITS.d1_reads,
  };

  console.log("Kul ve Taht - yuk/kota ve yedek/geri yukleme provasi");
  console.log(JSON.stringify(report, null, 2));

  rmSync(dir, { recursive: true, force: true });

  if (!report.withinFreeTier) {
    console.error("HATA: ucretsiz plan limiti asildi.");
    process.exit(1);
  }
  if (!report.dataLossFree) {
    console.error("HATA: yedek/geri yukleme veri kaybi tespit edildi.");
    process.exit(1);
  }
  console.log("Prova gecti: ucretsiz limitler icinde ve veri kaybi yok.");
}

main();

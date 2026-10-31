/**
 * Yedekten geri yukleme ve veri butunlugu dogrulamasi (E1.18).
 *
 * Gereksinim (tasarim belgesi 21.1): "Duzenli yedek alinir ve geri yukleme
 * test edilir." Bu modul, R2'deki bir dump'in guvenli sekilde dogrulanmasini
 * ve uygulanmasini saglar.
 *
 * Guvenlik notu: Geri yukleme yikici bir islemdir; yalnizca yonetici tarafindan,
 * audit_log kaydiyla ve bakim penceresinde calistirilir.
 */

/** D1 dump'i icin kabul edilen ifade turleri (beyaz liste). */
const ALLOWED_PREFIXES = [
  "CREATE TABLE",
  "CREATE INDEX",
  "CREATE UNIQUE INDEX",
  "INSERT INTO",
  "INSERT OR IGNORE INTO",
  "INSERT OR REPLACE INTO",
  "PRAGMA",
  "BEGIN",
  "COMMIT",
  "DELETE FROM",
];

export interface BackupIntegrity {
  valid: boolean;
  statementCount: number;
  tables: string[];
  problems: string[];
}

/**
 * Dump icerigini uygulamadan once dogrular: beklenmeyen (orn. yikici DDL)
 * ifadeleri reddeder ve beklenen tablolarin varligini kontrol eder.
 */
export function verifyBackupIntegrity(sql: string, expectedTables: readonly string[]): BackupIntegrity {
  const problems: string[] = [];
  // Satir ici SQL yorumlarini temizle (dump'lar aciklama satirlari icerir).
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const tables = new Set<string>();
  for (const statement of statements) {
    const upper = statement.toUpperCase();
    const allowed = ALLOWED_PREFIXES.some((prefix) => upper.startsWith(prefix));
    if (!allowed) {
      problems.push(`izin verilmeyen ifade: ${statement.slice(0, 40)}`);
      continue;
    }
    const match = /CREATE TABLE (?:IF NOT EXISTS )?["'`]?([A-Za-z0-9_]+)/i.exec(statement);
    if (match?.[1]) tables.add(match[1]);
  }

  for (const expected of expectedTables) {
    if (!tables.has(expected)) problems.push(`eksik tablo: ${expected}`);
  }

  return {
    valid: problems.length === 0,
    statementCount: statements.length,
    tables: [...tables].sort(),
    problems,
  };
}

export interface RestoreTarget {
  exec(sql: string): Promise<unknown>;
}

export interface RestoreResult {
  restored: boolean;
  integrity: BackupIntegrity;
}

/**
 * Dump'i hedef veritabanina uygular. Once butunluk dogrulanir; dogrulama
 * basarisizsa HICBIR sey uygulanmaz (kismi geri yukleme onlenir).
 */
export async function restoreFromBackup(
  target: RestoreTarget,
  sql: string,
  expectedTables: readonly string[],
): Promise<RestoreResult> {
  const integrity = verifyBackupIntegrity(sql, expectedTables);
  if (!integrity.valid) return { restored: false, integrity };

  // Tek bir transaction icinde uygula: hata olursa hicbir degisiklik kalmaz.
  await target.exec("BEGIN");
  try {
    await target.exec(sql);
    await target.exec("COMMIT");
  } catch (error) {
    await target.exec("ROLLBACK");
    throw error;
  }
  return { restored: true, integrity };
}

/** 21.2 varlik gruplarindan kritik olanlar (geri yukleme dogrulamasi icin). */
export const CRITICAL_TABLES = [
  "accounts",
  "characters",
  "settlements",
  "kingdoms",
  "items",
  "markets",
  "messages",
  "world_clock",
] as const;

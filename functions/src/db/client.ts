/**
 * Saglayici bagimsiz veri katmani (ADR-005).
 *
 * Tum sorgular bu arayuzden gecer. D1 ve Turso (libSQL) ayni SQLite ortak
 * alt kumesini kullanir; saglayiciya ozel kod bu katmanda izole edilir.
 * Otomatik gecis YOKTUR: D1 -> Turso gecisi ancak butunluk testleri gecince
 * yapilir.
 */

/** D1 binding'inin (ve test sahtelerinin) kullandigi minimal arayuz. */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: Record<string, unknown> }>;
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement;
  batch<T = unknown>(statements: SqlStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  list(limit?: number): Promise<T[]>;
  insert(entity: T): Promise<void>;
}

/** Parametreli sorgu yardimcisi; SQL enjeksiyonunu onler. */
export async function queryOne<T>(db: SqlDatabase, sql: string, ...params: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>();
}

export async function queryAll<T>(db: SqlDatabase, sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results;
}

export async function execute(db: SqlDatabase, sql: string, ...params: unknown[]): Promise<void> {
  await db.prepare(sql).bind(...params).run();
}

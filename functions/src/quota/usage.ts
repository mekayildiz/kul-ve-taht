/**
 * Kota kullanim olcumu (E1.11).
 *
 * Gercek ucretsiz plan tuketimini sayar ve gunluk sinirlarla karsilastirir.
 * Amac: olcum ve belgeleme. Kota asildiginda ucretli plana GECILMEZ;
 * yalnizca kuyruklama / yavaslatma / read-only uygulanir (quota/guard.ts).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryOne } from "../db/client";

export type QuotaMetric =
  | "requests"
  | "d1_reads"
  | "d1_writes"
  | "do_requests"
  | "workflow_steps";

/** Cloudflare Free plan gunluk sinirlari (resmi belge). */
export const FREE_DAILY_LIMITS: Record<QuotaMetric, number> = {
  requests: 100_000,
  d1_reads: 5_000_000,
  d1_writes: 100_000,
  do_requests: 100_000,
  workflow_steps: 3_000,
};

/** UTC gun anahtari (YYYY-MM-DD). */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function recordUsage(
  db: SqlDatabase,
  metric: QuotaMetric,
  amount = 1,
  nowMs: number = Date.now(),
): Promise<void> {
  if (amount <= 0) return;
  await execute(
    db,
    `INSERT INTO quota_usage (day, metric, count) VALUES (?,?,?)
     ON CONFLICT(day, metric) DO UPDATE SET count = count + excluded.count`,
    dayKey(nowMs),
    metric,
    amount,
  );
}

export interface QuotaReportRow {
  metric: QuotaMetric;
  used: number;
  limit: number;
  percentUsed: number;
  state: "ok" | "warning" | "critical" | "exhausted";
}

export interface QuotaReport {
  day: string;
  rows: QuotaReportRow[];
}

const WARNING_THRESHOLD = 0.7;
const CRITICAL_THRESHOLD = 0.9;

export function classify(used: number, limit: number): QuotaReportRow["state"] {
  const ratio = limit <= 0 ? 1 : used / limit;
  if (ratio >= 1) return "exhausted";
  if (ratio >= CRITICAL_THRESHOLD) return "critical";
  if (ratio >= WARNING_THRESHOLD) return "warning";
  return "ok";
}

export async function quotaReport(db: SqlDatabase, nowMs: number = Date.now()): Promise<QuotaReport> {
  const day = dayKey(nowMs);
  const rows: QuotaReportRow[] = [];
  for (const metric of Object.keys(FREE_DAILY_LIMITS) as QuotaMetric[]) {
    const row = await queryOne<{ count: number }>(
      db,
      "SELECT count FROM quota_usage WHERE day = ? AND metric = ?",
      day,
      metric,
    );
    const used = row?.count ?? 0;
    const limit = FREE_DAILY_LIMITS[metric];
    rows.push({
      metric,
      used,
      limit,
      percentUsed: Math.round((used / limit) * 1000) / 10,
      state: classify(used, limit),
    });
  }
  return { day, rows };
}

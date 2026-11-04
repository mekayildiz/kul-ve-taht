import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { recordUsage, quotaReport, classify, dayKey, FREE_DAILY_LIMITS } from "./usage";

const DAY = Date.UTC(2026, 9, 31, 12, 0, 0);

describe("gun anahtari", () => {
  it("UTC gununu dondurur", () => {
    expect(dayKey(DAY)).toBe("2026-10-31");
  });
});

describe("kota siniflandirma", () => {
  it("esiklere gore durum belirler", () => {
    expect(classify(0, 100)).toBe("ok");
    expect(classify(75, 100)).toBe("warning");
    expect(classify(95, 100)).toBe("critical");
    expect(classify(100, 100)).toBe("exhausted");
    expect(classify(150, 100)).toBe("exhausted");
  });
});

describe("kota olcumu", () => {
  it("ayni gun ve metrik icin sayaci artirir", async () => {
    const db = createTestDb();
    await recordUsage(db, "requests", 3, DAY);
    await recordUsage(db, "requests", 2, DAY);
    const report = await quotaReport(db, DAY);
    const requests = report.rows.find((r) => r.metric === "requests");
    expect(requests?.used).toBe(5);
  });

  it("gunleri ayri tutar", async () => {
    const db = createTestDb();
    await recordUsage(db, "requests", 10, DAY);
    await recordUsage(db, "requests", 7, DAY + 24 * 60 * 60 * 1000);
    const first = await quotaReport(db, DAY);
    expect(first.rows.find((r) => r.metric === "requests")?.used).toBe(10);
    const second = await quotaReport(db, DAY + 24 * 60 * 60 * 1000);
    expect(second.rows.find((r) => r.metric === "requests")?.used).toBe(7);
  });

  it("tum metrikleri Free sinirlariyla raporlar", async () => {
    const db = createTestDb();
    const report = await quotaReport(db, DAY);
    expect(report.rows).toHaveLength(5);
    for (const row of report.rows) {
      expect(row.limit).toBe(FREE_DAILY_LIMITS[row.metric]);
      expect(row.state).toBe("ok");
    }
  });

  it("sifir veya negatif miktari saymaz", async () => {
    const db = createTestDb();
    await recordUsage(db, "d1_writes", 0, DAY);
    await recordUsage(db, "d1_writes", -5, DAY);
    const report = await quotaReport(db, DAY);
    expect(report.rows.find((r) => r.metric === "d1_writes")?.used).toBe(0);
  });
});

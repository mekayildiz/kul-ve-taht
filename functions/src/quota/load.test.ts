/**
 * Ucretsiz kota dogrulama ve yuk testi (E7.4, belge 25).
 *
 * Amac: Gercek trafik benzetimi altinda ucretsiz plan limitlerinin asilmadigini
 * OLCMEK. Kota asiminda ucretli plana gecis YOKTUR; guard yalnizca kuyruklar /
 * yavaslatir / read-only uygular.
 */

import { describe, expect, it } from "vitest";
import worker, { type Env } from "../index";
import { createTestDb } from "../test-support/sqlite-harness";
import { decideQuota, type QuotaState } from "./guard";
import { FREE_DAILY_LIMITS, quotaReport } from "./usage";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: createTestDb(), SESSION_SECRET: "test-secret-degistir", ...overrides };
}

async function call(path: string, env: Env, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://kulvetah.local${path}`, init), env, {} as ExecutionContext);
}

describe("Ucretsiz kota dogrulama (E7.4)", () => {
  it("free plan gunluk limitleri tanimlidir ve makuldur", () => {
    expect(FREE_DAILY_LIMITS.requests).toBe(100_000);
    expect(FREE_DAILY_LIMITS.d1_reads).toBe(5_000_000);
    expect(FREE_DAILY_LIMITS.d1_writes).toBe(100_000);
  });

  it("kucuk bir yuk altinda gunluk istek butcesi asilmaz", async () => {
    const env = makeEnv();
    // 200 istek = kucuk bir es zamanli oyuncu grubunun gunluk okuma trafigi.
    for (let i = 0; i < 200; i += 1) {
      const res = await call("/api/world/summary", env);
      expect(res.status).toBe(200);
    }
    const report = await quotaReport(env.DB);
    const requests = report.rows.find((r) => r.metric === "requests");
    expect(requests?.used).toBe(200);
    expect((requests?.used ?? 0) < FREE_DAILY_LIMITS.requests).toBe(true);
    expect(requests?.state).toBe("ok");
  });

  it("butce tukendiginde ucretli plana gecilmez; istek reddedilir/kuyruga alinir", () => {
    const exhausted: QuotaState = { requestsRemainingToday: 0, nonCriticalBudgetRemaining: 0, overloaded: false };
    expect(decideQuota(exhausted, { critical: false }).kind).toBe("throttle");
    expect(decideQuota(exhausted, { critical: true }).kind).toBe("queue");
  });

  it("asiri yukte kritik olmayan is kuyruga alinir, kritik is degrade olur", () => {
    const overloaded: QuotaState = { requestsRemainingToday: 50_000, nonCriticalBudgetRemaining: 50_000, overloaded: true };
    expect(decideQuota(overloaded, { critical: false }).kind).toBe("queue");
    expect(decideQuota(overloaded, { critical: true }).kind).toBe("degrade");
  });

  it("butce asiminda 429/202/503 uretilir ama 402/200 (odeme) uretilmez", async () => {
    const env = makeEnv({ REQUESTS_REMAINING: "0" });
    const res = await call("/api/world/summary", env);
    expect([429, 202, 503]).toContain(res.status);
    expect(res.status).not.toBe(402);
  });

  it("overload bayragi ile gelen istekte ucretli tetikleyici olusmaz", async () => {
    const env = makeEnv({ OVERLOADED: "1" });
    const res = await call("/api/world/settlements", env);
    expect([202, 503]).toContain(res.status);
  });
});

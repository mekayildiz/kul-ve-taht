import { describe, expect, it } from "vitest";
import { decideQuota, quotaResponse, type QuotaState } from "./guard";

const healthy: QuotaState = {
  requestsRemainingToday: 50_000,
  nonCriticalBudgetRemaining: 10_000,
  overloaded: false,
};

describe("decideQuota", () => {
  it("saglikli durumda izin verir", () => {
    expect(decideQuota(healthy, { critical: true })).toEqual({ kind: "allow" });
    expect(decideQuota(healthy, { critical: false })).toEqual({ kind: "allow" });
  });

  it("butce bitince kritik islemi kuyruga alir, kritik olmayani sinirlar", () => {
    const exhausted: QuotaState = { ...healthy, requestsRemainingToday: 0 };
    expect(decideQuota(exhausted, { critical: true })).toEqual({
      kind: "queue",
      reason: "daily_request_budget_exhausted",
    });
    expect(decideQuota(exhausted, { critical: false })).toEqual({
      kind: "throttle",
      retryAfterSeconds: 60,
    });
  });

  it("asiri yukte kritik islemi bozar, kritik olmayani kuyruga alir", () => {
    const overloaded: QuotaState = { ...healthy, overloaded: true };
    expect(decideQuota(overloaded, { critical: true }).kind).toBe("degrade");
    expect(decideQuota(overloaded, { critical: false }).kind).toBe("queue");
  });

  it("kritik olmayan butce bitince read-only moda gecer", () => {
    const nonCriticalEmpty: QuotaState = { ...healthy, nonCriticalBudgetRemaining: 0 };
    expect(decideQuota(nonCriticalEmpty, { critical: false }).kind).toBe("readonly");
    expect(decideQuota(nonCriticalEmpty, { critical: true }).kind).toBe("allow");
  });

  it("hicbir karar ucretli plana gecisi tetiklemez (yalnizca yanit uretir)", () => {
    expect(quotaResponse({ kind: "allow" })).toBeNull();
    expect(quotaResponse({ kind: "throttle", retryAfterSeconds: 5 })?.status).toBe(429);
    expect(quotaResponse({ kind: "queue", reason: "x" })?.status).toBe(202);
    expect(quotaResponse({ kind: "degrade", reason: "x" })?.status).toBe(503);
    expect(quotaResponse({ kind: "readonly", reason: "x" })?.status).toBe(503);
  });
});

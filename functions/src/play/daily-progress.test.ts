/**
 * Gunluk ilerleme ozeti testleri (belge 6, 12.8, 19).
 */

import { describe, expect, it } from "vitest";
import { healthyState, type HealthState } from "../health/state";
import { buildDailyProgress, dailyProgressSummary } from "./daily-progress";

function withHealth(over: Partial<HealthState>): HealthState {
  return { ...healthyState(), ...over };
}

describe("buildDailyProgress", () => {
  it("hicbir degisim yoksa null doner", () => {
    const s = withHealth({});
    expect(buildDailyProgress(s, s, 1, 0)).toBeNull();
  });

  it("aclik ve saglik degisimini yakalar", () => {
    const before = withHealth({ hunger: 10, health: 90 });
    const after = withHealth({ hunger: 34, health: 87 });
    const p = buildDailyProgress(before, after, 3, 0)!;
    expect(p.hungerDelta).toBe(24);
    expect(p.healthDelta).toBe(-3);
    expect(p.days).toBe(3);
  });

  it("iyilesen ve yeni yaralari sayar", () => {
    const before = withHealth({
      injuries: [
        { id: "i1", kind: "cut", severity: 10, bleeding: 5, infection: 0, treated: true, occurredGameDay: 1 },
        { id: "i2", kind: "blunt", severity: 8, bleeding: 3, infection: 0, treated: true, occurredGameDay: 1 },
      ],
    });
    const after = withHealth({
      injuries: [{ id: "i2", kind: "blunt", severity: 4, bleeding: 0, infection: 0, treated: true, occurredGameDay: 1 }],
    });
    const p = buildDailyProgress(before, after, 2, 0)!;
    expect(p.injuriesHealed).toBe(1);
    expect(p.injuriesGained).toBe(0);
  });

  it("olumu isaretler", () => {
    const before = withHealth({ health: 5 });
    const after = withHealth({ health: 0, alive: false });
    const p = buildDailyProgress(before, after, 1, 0)!;
    expect(p.died).toBe(true);
  });

  it("yaslanmayi isaretler", () => {
    const s = withHealth({ hunger: 20 });
    const p = buildDailyProgress(withHealth({ hunger: 0 }), s, 360, 1)!;
    expect(p.years).toBe(1);
  });
});

describe("dailyProgressSummary", () => {
  it("tek cumlelik ozet uretir", () => {
    const text = dailyProgressSummary({
      days: 3,
      years: 0,
      healthDelta: -4,
      hungerDelta: 24,
      fatigueDelta: 0,
      injuriesHealed: 1,
      injuriesGained: 0,
      died: false,
    });
    expect(text).toContain("3 gün geçti");
    expect(text).toContain("açlığın arttı (+24)");
    expect(text).toContain("sağlığın azaldı (-4)");
    expect(text).toContain("1 yaran iyileşti");
  });

  it("tek gunu tekil yazar", () => {
    const text = dailyProgressSummary({
      days: 1,
      years: 0,
      healthDelta: 0,
      hungerDelta: 8,
      fatigueDelta: 0,
      injuriesHealed: 0,
      injuriesGained: 0,
      died: false,
    });
    expect(text.startsWith("1 gün geçti")).toBe(true);
  });
});

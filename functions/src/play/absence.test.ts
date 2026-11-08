import { describe, expect, it } from "vitest";
import { buildAbsenceReport, snapshotFrom, absenceSummary, type AbsenceSnapshot } from "./absence";

function snap(over: Partial<AbsenceSnapshot> = {}): AbsenceSnapshot {
  return {
    day: 100,
    gold: 50,
    health: 100,
    hunger: 0,
    fatigue: 0,
    alive: true,
    injuries: [],
    ...over,
  };
}

describe("absence", () => {
  it("degisim yoksa null doner", () => {
    expect(buildAbsenceReport(snap(), snap())).toBeNull();
  });

  it("gecen gun sayisini ve aclik artisini bildirir", () => {
    const report = buildAbsenceReport(snap(), snap({ day: 103, hunger: 45 }));
    expect(report?.daysPassed).toBe(3);
    expect(report?.hungerDelta).toBe(45);
  });

  it("iyilesen ve yeni yaralari sayar", () => {
    const before = snap({ injuries: ["a", "b"] });
    const after = snap({ injuries: ["b", "c"] });
    const report = buildAbsenceReport(before, after);
    expect(report?.injuriesHealed).toBe(1);
    expect(report?.injuriesGained).toBe(1);
  });

  it("olum bildirir", () => {
    const report = buildAbsenceReport(snap(), snap({ alive: false, health: 0 }));
    expect(report?.died).toBe(true);
  });

  it("altin farkini hesaplar", () => {
    expect(buildAbsenceReport(snap(), snap({ gold: 30 }))?.goldDelta).toBe(-20);
    expect(buildAbsenceReport(snap(), snap({ gold: 90 }))?.goldDelta).toBe(40);
  });

  it("ozet metni degisimleri icerir", () => {
    const report = buildAbsenceReport(snap(), snap({ day: 102, hunger: 30, health: 80 }));
    const text = absenceSummary(report!);
    expect(text).toContain("2 oyun günü geçti");
    expect(text).toContain("açlığın arttı");
    expect(text).toContain("sağlığın azaldı");
  });

  it("snapshotFrom saglik alanlarini kopyalar", () => {
    const s = snapshotFrom({
      day: 7,
      gold: 12,
      health: { health: 80, hunger: 20, fatigue: 5, alive: true, injuries: [{ id: "x" }] },
    });
    expect(s).toEqual({ day: 7, gold: 12, health: 80, hunger: 20, fatigue: 5, alive: true, injuries: ["x"] });
  });
});

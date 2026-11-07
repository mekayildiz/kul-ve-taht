import { describe, expect, it } from "vitest";
import { getDictionary } from "../i18n";
import type { AbsenceReportDto } from "../api/client";
import { describeAbsence } from "./absenceReport";

const t = getDictionary();

function report(over: Partial<AbsenceReportDto> = {}): AbsenceReportDto {
  return {
    daysPassed: 0,
    goldDelta: 0,
    healthDelta: 0,
    hungerDelta: 0,
    fatigueDelta: 0,
    injuriesHealed: 0,
    injuriesGained: 0,
    died: false,
    ...over,
  };
}

describe("describeAbsence", () => {
  it("degisim yoksa bos doner", () => {
    expect(describeAbsence(t, report())).toEqual([]);
  });

  it("gecen gun sayisini gosterir", () => {
    const lines = describeAbsence(t, report({ daysPassed: 4 }));
    expect(lines[0]!.label).toContain("4");
    expect(lines[0]!.label).toContain("oyun günü");
  });

  it("olumde erken doner ve tek satir verir", () => {
    const lines = describeAbsence(t, report({ daysPassed: 2, died: true, goldDelta: 5 }));
    expect(lines).toHaveLength(2);
    expect(lines[1]!.tone).toBe("bad");
  });

  it("aclik artisini kotu olarak isaretler", () => {
    const line = describeAbsence(t, report({ hungerDelta: 20 })).find((l) => l.label.includes("Açlığın"));
    expect(line?.tone).toBe("bad");
    expect(line?.value).toBe("+20");
  });

  it("iyilesen yarayi iyi olarak isaretler", () => {
    const line = describeAbsence(t, report({ injuriesHealed: 2 })).find((l) => l.label.includes("yaran"));
    expect(line?.tone).toBe("gain");
  });

  it("altin kaybini gosterir", () => {
    const line = describeAbsence(t, report({ goldDelta: -15 })).find((l) => l.label.includes("Kasandan"));
    expect(line?.value).toBe("-15");
  });
});

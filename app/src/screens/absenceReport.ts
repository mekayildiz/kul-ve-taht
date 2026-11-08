/**
 * "Yoklugunda ne oldu" raporu bicimlendiricisi (tasarim belgesi 6, 19).
 *
 * Sunucu, son gorulme anindan bu yana olusan degisimi ozet olarak dondurur.
 * Bu modul o ozeti okunabilir Turkce satirlara cevirir. Yalnizca degisen
 * alanlar gosterilir; boylece rapor kisa ve anlamli kalir.
 */

import type { Dictionary } from "../i18n";
import type { AbsenceReportDto } from "../api/client";
import type { OutcomeLine } from "./playOutcome";

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Raporu gosterilecek satirlara cevirir. Degisim yoksa bos dizi doner. */
export function describeAbsence(t: Dictionary, report: AbsenceReportDto): OutcomeLine[] {
  const a = t.play.absence;
  const lines: OutcomeLine[] = [];

  if (report.daysPassed > 0) {
    lines.push({ label: `${report.daysPassed} ${a.daysPassed}`, value: "", tone: "neutral" });
  }
  if (report.died) {
    lines.push({ label: a.died, value: "", tone: "bad" });
    return lines;
  }

  if (report.healthDelta !== 0) {
    lines.push({
      label: report.healthDelta > 0 ? a.healthUp : a.healthDown,
      value: signed(report.healthDelta),
      tone: report.healthDelta > 0 ? "gain" : "bad",
    });
  }
  if (report.hungerDelta !== 0) {
    lines.push({
      label: report.hungerDelta > 0 ? a.hungerUp : a.hungerDown,
      value: signed(report.hungerDelta),
      tone: report.hungerDelta > 0 ? "bad" : "gain",
    });
  }
  if (report.fatigueDelta !== 0) {
    lines.push({
      label: report.fatigueDelta > 0 ? a.fatigueUp : a.fatigueDown,
      value: signed(report.fatigueDelta),
      tone: report.fatigueDelta > 0 ? "bad" : "gain",
    });
  }
  if (report.injuriesHealed > 0) {
    lines.push({ label: `${report.injuriesHealed} ${a.injuriesHealed}`, value: "", tone: "gain" });
  }
  if (report.injuriesGained > 0) {
    lines.push({ label: `${report.injuriesGained} ${a.injuriesGained}`, value: "", tone: "bad" });
  }
  if (report.goldDelta !== 0) {
    lines.push({
      label: report.goldDelta > 0 ? a.goldGain : a.goldLoss,
      value: signed(report.goldDelta),
      tone: report.goldDelta > 0 ? "gain" : "loss",
    });
  }

  return lines;
}

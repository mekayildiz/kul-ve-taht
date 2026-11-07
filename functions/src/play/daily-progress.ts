/**
 * Gunluk ilerleme ozeti (tasarim belgesi 6, 12.8, 19).
 *
 * Dunya saati ilerledikce karakter gunluk olarak degisir: aclik artar, saglik
 * toparlanir ya da duser, yaralar iyilesir/kotulesir, yaslanma olur ve olum
 * gelebilir. Bu degisim su ana kadar TAMAMEN SESSIZDI; oyuncu neden zayifladigini
 * ya da iyilestigini goremiyordu. Bu modul degisimi tek cumlelik Turkce ozete
 * cevirir; boylece "olay oldu ama gorunmedi" hissi kirilir.
 *
 * Saf fonksiyonlar: veritabani erisimi cagiran katmana aittir.
 */

import type { HealthState } from "../health/state";

export interface DailyProgress {
  /** Gecen oyun gunu sayisi. */
  days: number;
  /** Bu ilerlemede gecen oyun yili (0 ise yaslanma yok). */
  years: number;
  healthDelta: number;
  hungerDelta: number;
  fatigueDelta: number;
  injuriesHealed: number;
  injuriesGained: number;
  died: boolean;
}

function injuryIds(state: HealthState): Set<string> {
  return new Set(state.injuries.map((i) => i.id));
}

/** Iki saglik durumunu karsilastirir; hicbir degisim yoksa null doner. */
export function buildDailyProgress(
  before: HealthState,
  after: HealthState,
  days: number,
  years: number,
): DailyProgress | null {
  const beforeIds = injuryIds(before);
  const afterIds = injuryIds(after);
  const progress: DailyProgress = {
    days,
    years,
    healthDelta: after.health - before.health,
    hungerDelta: after.hunger - before.hunger,
    fatigueDelta: after.fatigue - before.fatigue,
    injuriesHealed: before.injuries.filter((i) => !afterIds.has(i.id)).length,
    injuriesGained: after.injuries.filter((i) => !beforeIds.has(i.id)).length,
    died: before.alive && !after.alive,
  };
  const changed =
    progress.healthDelta !== 0 ||
    progress.hungerDelta !== 0 ||
    progress.fatigueDelta !== 0 ||
    progress.injuriesHealed > 0 ||
    progress.injuriesGained > 0 ||
    progress.died ||
    progress.years > 0;
  return changed ? progress : null;
}

/** Gunluk ilerlemeyi tek cumlelik ozete cevirir. */
export function dailyProgressSummary(progress: DailyProgress): string {
  const parts: string[] = [];
  const gun = progress.days === 1 ? "1 gün" : `${progress.days} gün`;
  parts.push(`${gun} geçti`);
  if (progress.died) parts.push("karakterin hayatını kaybetti");
  if (progress.years > 0) parts.push(`${progress.years} yaş yaşlandın`);
  if (progress.hungerDelta > 0) parts.push(`açlığın arttı (+${progress.hungerDelta})`);
  else if (progress.hungerDelta < 0) parts.push(`açlığın azaldı (${progress.hungerDelta})`);
  if (progress.healthDelta > 0) parts.push(`sağlığın toparlandı (+${progress.healthDelta})`);
  else if (progress.healthDelta < 0) parts.push(`sağlığın azaldı (${progress.healthDelta})`);
  if (progress.fatigueDelta !== 0) parts.push(`bitkinlik ${progress.fatigueDelta > 0 ? "+" : ""}${progress.fatigueDelta}`);
  if (progress.injuriesHealed > 0) parts.push(`${progress.injuriesHealed} yaran iyileşti`);
  if (progress.injuriesGained > 0) parts.push(`${progress.injuriesGained} yeni yara aldın`);
  return parts.join(", ") + ".";
}

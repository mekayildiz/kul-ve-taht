/**
 * "Yoklugunda ne oldu" ozeti (tasarim belgesi 6, 19).
 *
 * Oyuncu cevrimdisiyken dunya saati ilerler ve karakter gunluk olarak degisir
 * (aclik, saglik, yara iyilesmesi, yaslanma, olum). Bu degisim sessizdir;
 * oyuncu geri dondugunde ne oldugunu goremez. Cozum: son gorulme anindaki
 * kucuk bir anlik goruntu saklanir, donuste guncel durumla karsilastirilir.
 *
 * Saf fonksiyonlar: veritabani erisimi cagiran katmana aittir; boylece kural
 * testlerle dogrulanabilir.
 */

export interface AbsenceSnapshot {
  day: number;
  gold: number;
  health: number;
  hunger: number;
  fatigue: number;
  alive: boolean;
  /** Yara kimlikleri; iyilesenleri saptamak icin. */
  injuries: string[];
}

export interface AbsenceReport {
  /** Yokluk boyunca gecen oyun gunu sayisi. */
  daysPassed: number;
  goldDelta: number;
  healthDelta: number;
  hungerDelta: number;
  fatigueDelta: number;
  /** Yoklukta iyilesen yara sayisi. */
  injuriesHealed: number;
  /** Yoklukta olusan yeni yara sayisi. */
  injuriesGained: number;
  /** Bu yoklukta karakter oldu mu. */
  died: boolean;
}

/** Durumdan kucuk anlik goruntu uretir (tam envanter kopyasi tutulmaz). */
export function snapshotFrom(input: {
  day: number;
  gold: number;
  health: { health: number; hunger: number; fatigue: number; alive: boolean; injuries: readonly { id: string }[] };
}): AbsenceSnapshot {
  return {
    day: input.day,
    gold: input.gold,
    health: input.health.health,
    hunger: input.health.hunger,
    fatigue: input.health.fatigue,
    alive: input.health.alive,
    injuries: input.health.injuries.map((i) => i.id),
  };
}

/**
 * Anlik goruntu ile guncel durumu karsilastirir. Yokluk yoksa (gun farki 0 ve
 * hicbir degisim yoksa) `null` doner; boylece bos bir rapor gosterilmez.
 */
export function buildAbsenceReport(
  before: AbsenceSnapshot,
  after: AbsenceSnapshot,
): AbsenceReport | null {
  const daysPassed = Math.max(0, after.day - before.day);
  const beforeIds = new Set(before.injuries);
  const afterIds = new Set(after.injuries);
  const injuriesHealed = before.injuries.filter((id) => !afterIds.has(id)).length;
  const injuriesGained = after.injuries.filter((id) => !beforeIds.has(id)).length;

  const report: AbsenceReport = {
    daysPassed,
    goldDelta: after.gold - before.gold,
    healthDelta: after.health - before.health,
    hungerDelta: after.hunger - before.hunger,
    fatigueDelta: after.fatigue - before.fatigue,
    injuriesHealed,
    injuriesGained,
    died: before.alive && !after.alive,
  };

  const changed =
    daysPassed > 0 ||
    report.goldDelta !== 0 ||
    report.healthDelta !== 0 ||
    report.hungerDelta !== 0 ||
    report.fatigueDelta !== 0 ||
    injuriesHealed > 0 ||
    injuriesGained > 0 ||
    report.died;
  return changed ? report : null;
}

/** Raporu tek cumlelik Turkce ozete cevirir (yokluk ozeti icin). */
export function absenceSummary(report: AbsenceReport): string {
  const parts: string[] = [];
  if (report.daysPassed > 0) parts.push(`${report.daysPassed} oyun günü geçti`);
  if (report.died) parts.push("karakterin hayatını kaybetti");
  if (report.hungerDelta > 0) parts.push(`açlığın arttı (+${report.hungerDelta})`);
  else if (report.hungerDelta < 0) parts.push(`açlığın azaldı (${report.hungerDelta})`);
  if (report.healthDelta > 0) parts.push(`sağlığın toparlandı (+${report.healthDelta})`);
  else if (report.healthDelta < 0) parts.push(`sağlığın azaldı (${report.healthDelta})`);
  if (report.fatigueDelta !== 0) parts.push(`bitkinlik ${report.fatigueDelta > 0 ? "+" : ""}${report.fatigueDelta}`);
  if (report.injuriesHealed > 0) parts.push(`${report.injuriesHealed} yaran iyileşti`);
  if (report.injuriesGained > 0) parts.push(`${report.injuriesGained} yeni yara aldın`);
  if (report.goldDelta > 0) parts.push(`kasana ${report.goldDelta} altın girdi`);
  else if (report.goldDelta < 0) parts.push(`kasandan ${-report.goldDelta} altın çıktı`);
  if (parts.length === 0) return "";
  return parts.join(", ") + ".";
}

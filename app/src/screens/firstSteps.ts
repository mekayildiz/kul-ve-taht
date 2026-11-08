/**
 * Ilk adimlar rehberi (tasarim belgesi 19).
 *
 * Neden: oyuncu karakter olusturduktan sonra 79 aksiyonluk bir ekranla
 * karsi karsiya kaliyordu ve ilk birkac dakikada ne yapacagini bilmiyordu.
 * Bu modul, karakterin gecmisinden olculen ilerlemeye bakip siradaki TEK
 * adimi verir ve tamamlananlari isaretler.
 *
 * Saf fonksiyon: girdi karakter/oyun durumu, cikti adim listesi; yan etkisi
 * yok, ag/veritabani erisimi yok. Bu yuzden kolayca test edilir.
 */

export type StepId = "firstAction" | "work" | "travel" | "explore" | "quest" | "develop";

export interface StepInput {
  /** En az bir aksiyon tamamlandi mi (ilk dokunus). */
  hasActed: boolean;
  /** Is/ticaret ile para kazanildi mi (baslangic altinindan fazlasi). */
  hasEarnedGold: boolean;
  /** Dogdugu yerlesimden ayrildi mi. */
  hasTravelled: boolean;
  /** Av/kesif yapildi mi. */
  hasExplored: boolean;
  /** Alinan ya da tamamlanan gorev var mi. */
  hasQuest: boolean;
  /** Toplam gelisim puani (ustalik + itibar + yeralti). */
  progressionPoints: number;
}

export interface Step {
  id: StepId;
  done: boolean;
  /** Sirasiz ilk tamamlanmamis adim; oyuncuya gosterilir. */
  current: boolean;
}

/** Rehberin adim sirasi; tamamlanmamis ilk adim "su an" olur. */
export const STEP_ORDER: StepId[] = ["firstAction", "work", "travel", "explore", "quest", "develop"];

/** Gelisim adiminin tamamlanmis sayildigi puan esigi. */
export const DEVELOP_THRESHOLD = 5;

export function firstSteps(input: StepInput): Step[] {
  const done: Record<StepId, boolean> = {
    firstAction: input.hasActed,
    work: input.hasEarnedGold,
    travel: input.hasTravelled,
    explore: input.hasExplored,
    quest: input.hasQuest,
    develop: input.progressionPoints >= DEVELOP_THRESHOLD,
  };

  const steps = STEP_ORDER.map((id) => ({ id, done: done[id], current: false }));
  const firstOpen = steps.find((s) => !s.done);
  if (firstOpen) firstOpen.current = true;
  return steps;
}

/** Rehber tamamen bitince (tum adimlar isaretli) gizlenir. */
export function firstStepsComplete(steps: Step[]): boolean {
  return steps.every((s) => s.done);
}

/**
 * Sunucu durumundan cikarilamayan iki gercek (ilk aksiyon, kesif) karakter
 * basina yerel olarak hatirlanir. Boylece sayfa yenilense de rehber
 * ilerlemesi kaybolmaz ve sunucuya ek yuk binmez.
 */
export interface StepProgress {
  acted: boolean;
  explored: boolean;
}

const EMPTY_PROGRESS: StepProgress = { acted: false, explored: false };

function storageKey(characterId: string): string {
  return `kvt.steps.${characterId}`;
}

export function loadStepProgress(characterId: string): StepProgress {
  try {
    const raw = localStorage.getItem(storageKey(characterId));
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<StepProgress>;
    return { acted: parsed.acted === true, explored: parsed.explored === true };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveStepProgress(characterId: string, progress: StepProgress): void {
  try {
    localStorage.setItem(storageKey(characterId), JSON.stringify(progress));
  } catch {
    // Depolama kapaliysa rehber yine calisir, yalnizca hatirlanmaz.
  }
}

/** Aksiyon adindan hangi adimin isaretlenecegini soyler. */
export function stepSignalForAction(action: string): keyof StepProgress | null {
  if (action === "explore" || action === "hunt") return "explored";
  return null;
}

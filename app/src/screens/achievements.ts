/**
 * Basarimlar (tasarim belgesi 19).
 *
 * Neden: oyuncunun uzun vadeli hedefi yoktu; ilerleme yalnizca sayilarla
 * gorunuyordu. Basarimlar bu sayilari "kutlanacak anlara" cevirir.
 *
 * Tamamen turetilmis (derived): sunucuda ayri tablo yok, kayit yok.
 * Durumdan hesaplanir, bu yuzden sunucuya yuk bindirmez ve kolayca test edilir.
 * Yalnizca "yeni acildi" bildirimi icin karakter basina yerel bir isaret
 * kumesi tutulur.
 */

export type AchievementId =
  | "ilkKazanc"
  | "zengin"
  | "usta"
  | "efsane"
  | "unlu"
  | "karanlik"
  | "gorevci"
  | "gorevUstasi"
  | "mulkSahibi"
  | "tacir"
  | "aile"
  | "ordu"
  | "denizci"
  | "buyucu"
  | "guclu";

export interface AchievementInput {
  gold: number;
  weaponMastery: number;
  reputation: number;
  underworldRep: number;
  magicLevel: number;
  strength: number;
  /** Tamamlanmis gorev sayisi. */
  completedQuests: number;
  properties: number;
  companies: number;
  units: number;
  ships: number;
  children: number;
}

/**
 * Oyun durumundan basarim girdisini cikarir.
 *
 * PlayPanel'e bagimli olmamak icin gereken alanlar yapisal (structural)
 * olarak istenir; boylece modul saf ve test edilebilir kalir.
 */
export interface AchievementSource {
  play: {
    gold: number;
    weaponMastery: number;
    reputation: number;
    underworldRep: number;
    magicLevel: number;
    strength: number;
  } | null;
  quests: { status: string }[];
  properties: unknown[];
  companies: unknown[];
  units: unknown[];
  ships: unknown[];
  children: unknown[];
}

export function achievementInputFrom(state: AchievementSource): AchievementInput {
  const play = state.play;
  return {
    gold: play?.gold ?? 0,
    weaponMastery: play?.weaponMastery ?? 0,
    reputation: play?.reputation ?? 0,
    underworldRep: play?.underworldRep ?? 0,
    magicLevel: play?.magicLevel ?? 0,
    strength: play?.strength ?? 0,
    completedQuests: state.quests.filter((q) => q.status === "completed").length,
    properties: state.properties.length,
    companies: state.companies.length,
    units: state.units.length,
    ships: state.ships.length,
    children: state.children.length,
  };
}

export interface AchievementDef {
  id: AchievementId;
  /** Ulasilmasi gereken deger. */
  target: number;
  /** Guncel durumdan okunan deger. */
  value: (input: AchievementInput) => number;
}

export interface Achievement {
  id: AchievementId;
  value: number;
  target: number;
  unlocked: boolean;
  /** 0..1 arasi ilerleme; kilitli basarimlarda cubuk icin. */
  ratio: number;
}

/** Basarim tanimlari; sira arayuzde de bu sirayla gosterilir. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "ilkKazanc", target: 50, value: (i) => i.gold },
  { id: "zengin", target: 500, value: (i) => i.gold },
  { id: "usta", target: 10, value: (i) => i.weaponMastery },
  { id: "efsane", target: 25, value: (i) => i.weaponMastery },
  { id: "unlu", target: 50, value: (i) => i.reputation },
  { id: "karanlik", target: 25, value: (i) => i.underworldRep },
  { id: "gorevci", target: 1, value: (i) => i.completedQuests },
  { id: "gorevUstasi", target: 5, value: (i) => i.completedQuests },
  { id: "mulkSahibi", target: 1, value: (i) => i.properties },
  { id: "tacir", target: 1, value: (i) => i.companies },
  { id: "aile", target: 1, value: (i) => i.children },
  { id: "ordu", target: 1, value: (i) => i.units },
  { id: "denizci", target: 1, value: (i) => i.ships },
  { id: "buyucu", target: 1, value: (i) => i.magicLevel },
  { id: "guclu", target: 15, value: (i) => i.strength },
];

export function achievementsFor(input: AchievementInput): Achievement[] {
  return ACHIEVEMENTS.map((def) => {
    const value = def.value(input);
    const ratio = def.target > 0 ? Math.min(1, Math.max(0, value / def.target)) : 1;
    return { id: def.id, value, target: def.target, unlocked: value >= def.target, ratio };
  });
}

export interface AchievementSummary {
  unlocked: number;
  total: number;
  ratio: number;
}

export function achievementSummary(list: Achievement[]): AchievementSummary {
  const total = list.length;
  const unlocked = list.filter((a) => a.unlocked).length;
  return { unlocked, total, ratio: total > 0 ? unlocked / total : 0 };
}

/** Onceki turda gorulmemis, yeni acilan basarimlar. */
export function newlyUnlocked(seen: string[], list: Achievement[]): AchievementId[] {
  const known = new Set(seen);
  return list.filter((a) => a.unlocked && !known.has(a.id)).map((a) => a.id);
}

function storageKey(characterId: string): string {
  return `kvt.achv.${characterId}`;
}

export function loadSeenAchievements(characterId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(characterId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSeenAchievements(characterId: string, ids: string[]): void {
  try {
    localStorage.setItem(storageKey(characterId), JSON.stringify(ids));
  } catch {
    // Depolama kapaliysa basarimlar yine gorunur, yalnizca bildirim tekrarlanir.
  }
}

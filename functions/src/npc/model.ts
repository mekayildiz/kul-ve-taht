/**
 * NPC hedef/hafiza/iliski modeli (tasarim belgesi 8.1-8.6).
 *
 * NPC'ler oyuncularla AYNI KURALLARA tabidir: nitelik gelistirir, uzmanlik
 * ogrenir, meslek gelistirir, egitim alir, rutbe kazanir (belge 8.5).
 * Oyunculara ozel sinirsiz guc YOKTUR.
 *
 * Karar modeli 5 etkene dayanir: kisilik, ihtiyaclar, ekonomi, iliskiler,
 * hedefler (belge 8.1).
 */

import type { Attributes } from "../character/attributes";
import type { Personality } from "../character/personality";

export type NpcTier = "important" | "local" | "background";

export type NpcGoal =
  | "wealth"
  | "marriage"
  | "power"
  | "travel"
  | "dynasty"
  | "mastery"
  | "safety";

export interface NpcNeeds {
  food: number;
  shelter: number;
  safety: number;
  social: number;
}

export interface NpcMemoryEntry {
  /** Olayin oznesi (karakter/NPC id). */
  subjectId: string;
  /** -100 (buyuk kotuluk) .. +100 (buyuk iyilik). */
  sentiment: number;
  kind: "favor" | "harm" | "event" | "relationship";
  gameDay: number;
  note: string;
}

export interface Npc {
  id: string;
  name: string;
  tier: NpcTier;
  settlementId: string;
  attributes: Attributes;
  personality: Personality;
  goals: NpcGoal[];
  needs: NpcNeeds;
  /** Meslek ve ustalik (belge 8.5). */
  profession: string;
  expertise: { path: string; level: number }[];
  /** Ekonomik durum. */
  gold: number;
  debts: number;
  propertyValue: number;
  /** Askeri rutbe (0 = yok). */
  militaryRank: number;
  /** Siyasi makam (bos ise yok). */
  office: string | null;
  memory: NpcMemoryEntry[];
  alive: boolean;
  ageYears: number;
}

export function emptyNeeds(): NpcNeeds {
  return { food: 50, shelter: 50, safety: 50, social: 50 };
}

export function recordMemory(npc: Npc, entry: NpcMemoryEntry): Npc {
  // Hafiza sinirlidir: en yeni 50 kayit tutulur (performans).
  const memory = [...npc.memory, entry].slice(-50);
  return { ...npc, memory };
}

/** Bir ozne karsi toplam duygu (guven/güvensizlik deneyime dayanir, belge 8.2). */
export function sentimentToward(npc: Npc, subjectId: string): number {
  const entries = npc.memory.filter((m) => m.subjectId === subjectId);
  if (entries.length === 0) return 0;
  const total = entries.reduce((s, m) => s + m.sentiment, 0);
  return Math.max(-100, Math.min(100, Math.round(total / entries.length)));
}

/**
 * Karar skoru: hedefler + ihtiyaclar + ekonomi + iliskiler (belge 8.1).
 * En yuksek skorlu hedef secilir. Deterministik ve olceklenebilir.
 */
export function decideGoal(npc: Npc): NpcGoal {
  const scores = new Map<NpcGoal, number>();
  const add = (goal: NpcGoal, value: number) => scores.set(goal, (scores.get(goal) ?? 0) + value);

  // Ihtiyaclar
  if (npc.needs.food > 70) add("wealth", 30);
  if (npc.needs.shelter > 70) add("wealth", 25);
  if (npc.needs.safety > 70) add("safety", 30);
  if (npc.needs.social > 70) add("marriage", 20);

  // Ekonomi
  if (npc.gold < 20) add("wealth", 25);
  if (npc.debts > 100) add("wealth", 35);
  if (npc.gold > 200) add("power", 15);

  // Kisilik
  if (npc.personality.ambition > 60) add("power", 25);
  if (npc.personality.ambition > 60) add("dynasty", 15);
  // Kisilik anahtarlari belge 5.6 ile sinirlidir: courage, mercy, ambition,
  // loyalty, discipline, patience. Sabirsiz karakter seyahate, disiplinli
  // karakter ustaliga yonelir.
  if (npc.personality.patience < 40) add("travel", 20);
  if (npc.personality.discipline > 60) add("mastery", 15);
  if (npc.personality.loyalty > 60) add("dynasty", 10);
  if (npc.personality.courage < 40) add("safety", 20);

  // Hedefler zaten varsa pekistir
  for (const goal of npc.goals) add(goal, 10);

  let best: NpcGoal = "wealth";
  let bestScore = -Infinity;
  for (const [goal, score] of scores) {
    if (score > bestScore) {
      best = goal;
      bestScore = score;
    }
  }
  return best;
}

/** Ihtiyaclarin gunluk artisi ve ekonomi guncellemesi (cevrim disi icin ozet). */
export function advanceNpcDay(npc: Npc, gameDay: number): Npc {
  if (!npc.alive) return npc;
  const needs: NpcNeeds = {
    food: Math.min(100, npc.needs.food + 6),
    shelter: Math.min(100, npc.needs.shelter + 2),
    safety: Math.min(100, npc.needs.safety + 3),
    social: Math.min(100, npc.needs.social + 4),
  };
  // Meslek geliri ihtiyaclari karsilar; borc varsa faiz isler.
  const income = 5 + npc.expertise.reduce((s, e) => s + e.level, 0);
  const gold = npc.gold + income - 3;
  let debts = npc.debts;
  if (debts > 0) {
    debts = Math.min(debts * 1.01, debts + 5);
  }
  if (gold >= 10) {
    needs.food = Math.max(0, needs.food - 30);
    needs.shelter = Math.max(0, needs.shelter - 20);
  }
  if (gold >= 5) needs.safety = Math.max(0, needs.safety - 10);
  return { ...npc, needs, gold: Math.max(0, Math.round(gold)), debts: Math.round(debts), ageYears: npc.ageYears + (gameDay % 360 === 0 ? 1 : 0) };
}

/**
 * Katmanli simulasyon (belge 8.8): onemli NPC'ler ayrintili, yerel NPC'ler
 * toplu, arka plan nufusu istatistiksel. Bu, Free plan sinirlari icin ZORUNLU.
 */
export function simulationIntervalDays(tier: NpcTier): number {
  switch (tier) {
    case "important":
      return 1;
    case "local":
      return 7;
    case "background":
      return 30;
  }
}

export function shouldSimulate(npc: Npc, gameDay: number): boolean {
  return gameDay % simulationIntervalDays(npc.tier) === 0;
}

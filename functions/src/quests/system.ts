/**
 * Kesif, gorevler ve dunya olaylari (tasarim belgesi 12.1-12.5).
 *
 * Gorevlerin birden fazla cozumu ve uzun vadeli sonuclari vardir. Yan
 * gorevler ve serbest isler NPC yasamina baglidir.
 */

export type QuestType = "main" | "side" | "work" | "exploration" | "crisis";
export type QuestStatus = "available" | "active" | "completed" | "failed";

export interface QuestObjective {
  id: string;
  description: string;
  /** Gereken ilerleme miktari. */
  required: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  giverNpcId: string | null;
  objectives: QuestObjective[];
  rewardGold: number;
  /** Birden fazla cozum yolu (belge 12.4). */
  solutions: string[];
  /** Uzun vadeli sonuc anahtari (belge 12.4). */
  longTermEffect: string | null;
}

export interface CharacterQuest {
  characterId: string;
  questId: string;
  status: QuestStatus;
  /** Hedef id -> ilerleme. */
  progress: Record<string, number>;
}

export function questComplete(cq: CharacterQuest, quest: Quest): boolean {
  return quest.objectives.every((o) => (cq.progress[o.id] ?? 0) >= o.required);
}

export function advanceObjective(cq: CharacterQuest, objectiveId: string, amount: number): CharacterQuest {
  const progress = { ...cq.progress, [objectiveId]: (cq.progress[objectiveId] ?? 0) + amount };
  return { ...cq, progress };
}

/**
 * Gorev odulu: tamamlaninca altin verilir. Gorev cozumleri uzun vadeli
 * sonuclar dogurur (orn. bir hanedanla ittifak veya dusmanlik).
 */
export function completeQuest(cq: CharacterQuest, quest: Quest): { characterQuest: CharacterQuest; gold: number; effect: string | null } {
  if (!questComplete(cq, quest)) {
    return { characterQuest: cq, gold: 0, effect: null };
  }
  return { characterQuest: { ...cq, status: "completed" }, gold: quest.rewardGold, effect: quest.longTermEffect };
}

export type WorldEventType =
  | "war"
  | "peace"
  | "epidemic"
  | "famine"
  | "trade_crisis"
  | "bandit_raid"
  | "rebellion"
  | "assassination"
  | "dynasty_crisis"
  | "tournament"
  | "natural_disaster";

export interface WorldEvent {
  id: string;
  type: WorldEventType;
  settlementId: string | null;
  occurredGameDay: number;
  /** Olayin agirligi 1-100. */
  severity: number;
  payload: Record<string, unknown>;
}

/** Olayin yerel ekonomi/guvenlik uzerindeki etkisi (belge 12.5). */
export function eventImpact(event: WorldEvent): { priceMultiplier: number; securityDelta: number; healthRisk: number } {
  const s = event.severity / 100;
  switch (event.type) {
    case "famine":
    case "trade_crisis":
      return { priceMultiplier: 1 + s, securityDelta: -5, healthRisk: 0.2 * s };
    case "epidemic":
      return { priceMultiplier: 1 + s * 0.5, securityDelta: -5, healthRisk: 0.6 * s };
    case "war":
    case "bandit_raid":
    case "rebellion":
      return { priceMultiplier: 1 + s * 0.7, securityDelta: -20 * s, healthRisk: 0.3 * s };
    case "peace":
    case "tournament":
      return { priceMultiplier: 1 - s * 0.15, securityDelta: 10 * s, healthRisk: 0 };
    case "natural_disaster":
      return { priceMultiplier: 1 + s * 0.8, securityDelta: -10 * s, healthRisk: 0.4 * s };
    default:
      return { priceMultiplier: 1, securityDelta: 0, healthRisk: 0 };
  }
}

/** Kesif alanlari (belge 12.1). */
export const EXPLORATION_SITES = [
  "forest", "mountain", "plain", "river", "coast", "cave",
  "ruin", "abandoned_castle", "hidden_region", "rare_resource",
] as const;

export type ExplorationSite = (typeof EXPLORATION_SITES)[number];

export interface ExplorationResult {
  site: ExplorationSite;
  /** Bulunan esya id'leri (bossa hicbir sey). */
  items: { itemId: string; quantity: number }[];
  gold: number;
  /** Tehlike sonucu yaralanma olustu mu. */
  injury: { kind: "cut" | "blunt" | "pierce" | "burn" | "fracture"; severity: number; bleeding: number } | null;
  discovered: boolean;
}

/**
 * Kesif sonucu: hazirlik ve sans belirler. Tehlikeli alanlar yaralanmaya yol
 * acabilir; hazirlik riski azaltir (belge 12.1).
 */
export function explore(site: ExplorationSite, preparedness: number, roll: () => number): ExplorationResult {
  const dangerBySite: Partial<Record<ExplorationSite, number>> = {
    cave: 60, ruin: 50, abandoned_castle: 55, hidden_region: 70, rare_resource: 65,
  };
  const danger = Math.max(0, (dangerBySite[site] ?? 20) - preparedness * 0.4);
  const injured = roll() * 100 < danger;

  const lootBySite: Partial<Record<ExplorationSite, { itemId: string; quantity: number }[]>> = {
    forest: [{ itemId: "oak-wood", quantity: 3 }],
    mountain: [{ itemId: "iron-ore", quantity: 2 }],
    plain: [{ itemId: "cloth", quantity: 1 }],
    river: [{ itemId: "healing-herb", quantity: 1 }],
    coast: [{ itemId: "dried-meat", quantity: 2 }],
    cave: [{ itemId: "iron-ore", quantity: 4 }],
    ruin: [{ itemId: "tome-of-medicine", quantity: 1 }],
    abandoned_castle: [{ itemId: "chainmail", quantity: 1 }],
    hidden_region: [{ itemId: "healing-herb", quantity: 3 }],
    rare_resource: [{ itemId: "iron-ore", quantity: 6 }],
  };

  return {
    site,
    items: lootBySite[site] ?? [],
    gold: Math.round(roll() * 20),
    injury: injured ? { kind: "pierce", severity: 10 + Math.round(roll() * 30), bleeding: 5 + Math.round(roll() * 20) } : null,
    discovered: true,
  };
}

/**
 * Yerlesim profili (tasarim belgesi 4 ve 20).
 *
 * Belge 20: "Her yerlesimin nufus, ekonomi, uretim/tuketim, yonetim, guvenlik,
 * aileler, NPC'ler, pazar, ulasim, mevsim ve siyasi baglilik verileri
 * bulunacaktir." Bu modul 130 yerlesimin TAMAMI icin bu veriyi yerlesim
 * kimliginden TURETIR (elle yazilmis 130 blok yok; tek kaynak, tutarli).
 *
 * Turetme deterministiktir: ayni yerlesim her zaman ayni profili alir; boylece
 * testler ve kayitlar karsilastirilabilir kalir.
 */

import { SETTLEMENTS } from "./settlements";
import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import type { Settlement, SettlementKind } from "./types";

export type GovernanceType = "royal_governor" | "noble_lord" | "city_council" | "garrison_commander" | "village_elder";

export interface SettlementProfile {
  settlementId: string;
  name: string;
  kind: SettlementKind;
  /** Krallik kimligi; bagimsiz sehir/tarafsiz bolgede null (krallik yok). */
  kingdomId: string | null;
  /** Siyasi baglilik: krallik, bagimsiz sehir veya tarafsiz bolge. */
  politicalAllegiance: "kingdom" | "free_city" | "neutral";
  population: number;
  /** Ekonomi ozeti: ana uretim, tuketim ve pazar buyuklugu. */
  economy: {
    primaryProduction: string;
    primaryConsumption: string[];
    marketSize: number;
    wealthIndex: number;
  };
  governance: GovernanceType;
  /** Guvenlik 0-100. */
  security: number;
  /** Onemli aile sayisi (soylu/ticari). */
  notableFamilies: number;
  /** Yerel NPC sayisi (olceklenebilir nufus sim. icin). */
  npcCount: number;
  /** Ulasim: bagli yol sayisi ve stratejik gecit. */
  transport: { roadLinks: number; hasPort: boolean; isChokepoint: boolean };
  /** Baskin mevsim ve etkisi. */
  dominantSeason: "spring" | "summer" | "autumn" | "winter";
}

const KIND_POPULATION: Record<SettlementKind, number> = {
  capital: 45000,
  city: 18000,
  town: 6000,
  village: 900,
  castle: 2200,
};

const KIND_SECURITY: Record<SettlementKind, number> = {
  capital: 85,
  city: 70,
  town: 60,
  village: 45,
  castle: 90,
};

const KIND_GOVERNANCE: Record<SettlementKind, GovernanceType> = {
  capital: "royal_governor",
  city: "city_council",
  town: "noble_lord",
  village: "village_elder",
  castle: "garrison_commander",
};

const KIND_ROADS: Record<SettlementKind, number> = {
  capital: 6,
  city: 4,
  town: 3,
  village: 1,
  castle: 2,
};

const DIRECTION_SEASON: Record<string, SettlementProfile["dominantSeason"]> = {
  north: "winter",
  west: "autumn",
  south: "summer",
  east: "spring",
  central: "summer",
};

const KINGDOM_CONSUMPTION: Record<string, string[]> = {
  varkhenn: ["Tahıl", "Kumaş", "Baharat"],
  aurelith: ["Tahıl", "Kereste", "Metal"],
  solmerya: ["Metal", "Kumaş", "Lüks mallar"],
  eryndor: ["Tahıl", "Metal", "Deniz ürünleri"],
  caelvar: ["Tahıl", "Kereste", "Hayvan"],
};

/** Basit deterministik karisim: string -> 0..1 (tutarli profil icin). */
function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function profileFor(settlement: Settlement): SettlementProfile {
  const kingdom = KINGDOMS.find((k) => k.id === settlement.kingdomId);
  const jitter = hashUnit(settlement.id);
  const population = Math.round(KIND_POPULATION[settlement.kind] * (0.85 + jitter * 0.3));
  const npcCount = Math.max(1, Math.round(population / 25));
  const notableFamilies = settlement.kind === "village" ? 2 : Math.max(3, Math.round(population / 4000));
  const wealthIndex = Math.round((0.5 + jitter * 0.5) * 100) / 100;
  const marketSize = Math.round(population * (0.4 + jitter * 0.4));
  const hasPort = kingdom?.resources.some((r) => r.includes("Deniz") || r.includes("Balık")) ?? false;

  return {
    settlementId: settlement.id,
    name: settlement.name,
    kind: settlement.kind,
    kingdomId: settlement.kingdomId,
    politicalAllegiance: "kingdom",
    population,
    economy: {
      primaryProduction: settlement.primaryOutput,
      primaryConsumption: KINGDOM_CONSUMPTION[settlement.kingdomId] ?? ["Tahıl", "Kumaş"],
      marketSize,
      wealthIndex,
    },
    governance: KIND_GOVERNANCE[settlement.kind],
    security: KIND_SECURITY[settlement.kind],
    notableFamilies,
    npcCount,
    transport: {
      roadLinks: KIND_ROADS[settlement.kind],
      hasPort: hasPort && (settlement.kind === "capital" || settlement.kind === "city" || settlement.kind === "town"),
      isChokepoint: settlement.kind === "castle",
    },
    dominantSeason: DIRECTION_SEASON[kingdom?.direction ?? "central"] ?? "summer",
  };
}

function profileForPlace(
  place: { id: string; name: string; x: number; y: number },
  allegiance: "free_city" | "neutral",
): SettlementProfile {
  const jitter = hashUnit(place.id);
  const population = allegiance === "free_city" ? Math.round(20000 * (0.9 + jitter * 0.3)) : Math.round(400 * (0.8 + jitter * 0.4));
  return {
    settlementId: place.id,
    name: place.name,
    kind: "city",
    kingdomId: null,
    politicalAllegiance: allegiance,
    population,
    economy: {
      primaryProduction: allegiance === "free_city" ? "Ticaret ve zanaat" : "Geçiş ticareti ve avcılık",
      primaryConsumption: ["Tahıl", "Kumaş", "Metal"],
      marketSize: Math.round(population * (allegiance === "free_city" ? 0.8 : 0.2)),
      wealthIndex: Math.round((0.5 + jitter * 0.5) * 100) / 100,
    },
    governance: allegiance === "free_city" ? "city_council" : "village_elder",
    security: allegiance === "free_city" ? 65 : 40,
    notableFamilies: allegiance === "free_city" ? 6 : 1,
    npcCount: Math.max(1, Math.round(population / 25)),
    transport: { roadLinks: allegiance === "free_city" ? 5 : 2, hasPort: true, isChokepoint: true },
    dominantSeason: "summer",
  };
}

/** 130 yerlesim + bagimsiz sehir + tarafsiz bolge icin tam profil listesi. */
export function allSettlementProfiles(): SettlementProfile[] {
  const kingdoms = SETTLEMENTS.map(profileFor);
  const freeCities = FREE_CITIES.map((c) => profileForPlace(c, "free_city"));
  const neutral = NEUTRAL_ZONES.map((z) => profileForPlace(z, "neutral"));
  return [...kingdoms, ...freeCities, ...neutral];
}

export function settlementProfile(settlementId: string): SettlementProfile | null {
  return allSettlementProfiles().find((p) => p.settlementId === settlementId) ?? null;
}

/** Toplam dunya nufusu: krallik + bagimsiz sehir + tarafsiz bolge. */
export function totalWorldPopulation(): number {
  return allSettlementProfiles().reduce((sum, p) => sum + p.population, 0);
}

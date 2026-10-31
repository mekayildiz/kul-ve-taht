/** Valedorn dunyasi varlik tipleri (tasarim belgesi bolum 3 ve 4). */

export type SettlementKind = "capital" | "city" | "town" | "village" | "castle";

export interface Settlement {
  id: string;
  name: string;
  kind: SettlementKind;
  kingdomId: string;
  /** Harita konumu (0-100 normalize koordinat). */
  x: number;
  y: number;
  /** Temel uretim etiketi (ekonomi sistemi icin). */
  primaryOutput: string;
}

export type Government =
  | "feudal_monarchy"
  | "council_monarchy"
  | "absolute_monarchy"
  | "elective_monarchy"
  | "noble_council_monarchy";

export interface Ruler {
  name: string;
  age: number;
  dynasty: string;
}

export interface Kingdom {
  id: string;
  name: string;
  direction: "north" | "west" | "south" | "east" | "central";
  capital: string;
  ruler: Ruler;
  government: Government;
  crest: string;
  /** Yetistirilen onemli soylu/ticari aileler. */
  houses: string[];
  /** Krallik kimligine gore oncelikli kaynaklar. */
  resources: string[];
}

export interface FreeCity {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
}

export interface NeutralZone {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
}

/** Yerlesim hiyerarsi hedefi: krallik basina 26, toplam 130. */
export const HIERARCHY: Record<SettlementKind, number> = {
  capital: 1,
  city: 3,
  town: 5,
  village: 12,
  castle: 5,
};

export const SETTLEMENTS_PER_KINGDOM = 26;
export const TOTAL_SETTLEMENTS_TARGET = 130;

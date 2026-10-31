export * from "./types";
export * from "./kingdoms";
export * from "./settlements";
export * from "./settlement-profile";

import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";
import { TOTAL_SETTLEMENTS_TARGET } from "./types";
import { totalWorldPopulation } from "./settlement-profile";

export interface WorldSummary {
  kingdoms: number;
  freeCities: number;
  neutralZones: number;
  settlements: number;
  settlementsTarget: number;
  /** Tum yerlesimlerin toplam nufusu (belge 20). */
  totalPopulation: number;
}

export function worldSummary(): WorldSummary {
  return {
    kingdoms: KINGDOMS.length,
    freeCities: FREE_CITIES.length,
    neutralZones: NEUTRAL_ZONES.length,
    settlements: SETTLEMENTS.length,
    settlementsTarget: TOTAL_SETTLEMENTS_TARGET,
    totalPopulation: totalWorldPopulation(),
  };
}

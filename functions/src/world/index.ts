export * from "./types";
export * from "./kingdoms";
export * from "./settlements";

import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";
import { TOTAL_SETTLEMENTS_TARGET } from "./types";

export interface WorldSummary {
  kingdoms: number;
  freeCities: number;
  neutralZones: number;
  settlements: number;
  settlementsTarget: number;
}

export function worldSummary(): WorldSummary {
  return {
    kingdoms: KINGDOMS.length,
    freeCities: FREE_CITIES.length,
    neutralZones: NEUTRAL_ZONES.length,
    settlements: SETTLEMENTS.length,
    settlementsTarget: TOTAL_SETTLEMENTS_TARGET,
  };
}

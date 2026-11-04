/**
 * Seyahat, konaklama ve mevsim etkisi (tasarim belgesi 12.6, 15).
 *
 * Mesafe, yol durumu, mevsim/hava ve binek seyahat suresini belirler. Kis
 * bazı yollari kapatabilir. Ayri bir meteoroloji simulasyonu YOKTUR; basit
 * ve anlasilir bir model kullanilir.
 */

import type { Settlement } from "../world/types";

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface TravelConditions {
  season: Season;
  /** Yol kalitesi 0-100. */
  roadQuality: number;
  /** Hava: clear | rain | storm | snow | fog. */
  weather: "clear" | "rain" | "storm" | "snow" | "fog";
  hasMount: boolean;
  /** Grup/kervan mi (yavaslar ama guvenli). */
  isCaravan: boolean;
}

export interface TravelResult {
  distance: number;
  hours: number;
  /** Oyun gunu cinsinden sure. */
  gameDays: number;
  /** Yol kapali mi (kis/kar). */
  blocked: boolean;
  /** Yolda rastlanti riski 0-100 (haydut/yaratik). */
  dangerLevel: number;
}

export const BASE_TRAVEL_SPEED_KM_PER_DAY = 30;

/** Iki yerlesim arasi mesafe (harita koordinatlarindan). */
export function distanceBetween(a: Settlement, b: Settlement): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  // Normalize koordinat (0-100) -> km; dunya olcegi ~10 km/birim.
  return Math.round(Math.sqrt(dx * dx + dy * dy) * 10 * 10) / 10;
}

const SEASON_FACTOR: Record<Season, number> = { spring: 1, summer: 1.1, autumn: 0.9, winter: 0.6 };
const WEATHER_FACTOR: Record<TravelConditions["weather"], number> = {
  clear: 1,
  rain: 0.85,
  storm: 0.6,
  snow: 0.5,
  fog: 0.75,
};

/**
 * Seyahat suresini hesaplar. Kis + kar bazi yollari KAPATIR (belge 12.6).
 */
export function planTravel(from: Settlement, to: Settlement, conditions: TravelConditions): TravelResult {
  const distance = distanceBetween(from, to);
  const blocked = conditions.season === "winter" && conditions.weather === "snow" && conditions.roadQuality < 40;

  let speed = BASE_TRAVEL_SPEED_KM_PER_DAY;
  speed *= SEASON_FACTOR[conditions.season];
  speed *= WEATHER_FACTOR[conditions.weather];
  speed *= 0.6 + (conditions.roadQuality / 100) * 0.6;
  if (conditions.hasMount) speed *= 1.5;
  if (conditions.isCaravan) speed *= 0.7;

  // Alt sinir 0.1 gun: yakin mesafelerde de binek/kervan farki gorunur.
  const gameDays = blocked ? 0 : Math.max(0.1, Math.round((distance / speed) * 10) / 10);
  const hours = Math.round(gameDays * 6 * 10) / 10;

  // Tehlike: kis ve kotu hava riski artirir; kervan guvenli.
  let dangerLevel = 20;
  if (conditions.season === "winter") dangerLevel += 15;
  if (conditions.weather === "storm" || conditions.weather === "snow") dangerLevel += 10;
  if (conditions.roadQuality < 40) dangerLevel += 15;
  if (conditions.isCaravan) dangerLevel -= 10;
  dangerLevel = Math.max(0, Math.min(100, dangerLevel));

  return { distance, hours, gameDays, blocked, dangerLevel };
}

/** Konaklama maliyeti (han/taverna) - belge 15. */
export function lodgingCost(settlementKind: string, nights: number): number {
  const rates: Record<string, number> = { capital: 8, city: 6, town: 4, village: 2, castle: 3 };
  return (rates[settlementKind] ?? 3) * nights;
}

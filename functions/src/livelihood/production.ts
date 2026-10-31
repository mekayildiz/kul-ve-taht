/**
 * Tarim, hayvancilik, avcilik ve evcillestirme (tasarim belgesi 12.3, 12.7).
 *
 * Kural: Uretim dongusu mevsim ve havaya baglidir. Ayrintili mikro yonetim
 * yerine anlasilir uretim dongusu kullanilir; sonuclar SUNUCUDA hesaplanir.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather = "clear" | "rain" | "storm" | "fog" | "snow" | "heat";

export type CropId = "wheat" | "barley" | "vegetable" | "fruit";
export type LivestockId = "cattle" | "sheep" | "chicken" | "horse";

export interface CropDef {
  id: CropId;
  name: string;
  /** Uygun ekim mevsimi. */
  season: Season;
  /** Bir tarladan beklenen temel verim. */
  baseYield: number;
  /** Buyume icin gereken oyun gunu. */
  growDays: number;
}

export const CROPS: readonly CropDef[] = [
  { id: "wheat", name: "Buğday", season: "spring", baseYield: 60, growDays: 90 },
  { id: "barley", name: "Arpa", season: "spring", baseYield: 45, growDays: 75 },
  { id: "vegetable", name: "Sebze", season: "summer", baseYield: 35, growDays: 50 },
  { id: "fruit", name: "Meyve", season: "summer", baseYield: 30, growDays: 60 },
];

export interface LivestockDef {
  id: LivestockId;
  name: string;
  /** Gunluk bakim maliyeti (altin). */
  upkeep: number;
  /** Gunluk cikti (urun, miktar). */
  dailyOutput: { itemId: string; quantity: number };
}

export const LIVESTOCK: readonly LivestockDef[] = [
  { id: "cattle", name: "Sığır", upkeep: 1, dailyOutput: { itemId: "dried-meat", quantity: 1 } },
  { id: "sheep", name: "Koyun", upkeep: 1, dailyOutput: { itemId: "cloth", quantity: 1 } },
  { id: "chicken", name: "Tavuk", upkeep: 1, dailyOutput: { itemId: "bread", quantity: 1 } },
  { id: "horse", name: "At", upkeep: 2, dailyOutput: { itemId: "pack-horse", quantity: 0 } },
];

/** Hava carpani: uretim uzerindeki etki (belge 12.6). */
const WEATHER_YIELD: Record<Weather, number> = {
  clear: 1,
  rain: 1.1,
  storm: 0.7,
  fog: 0.9,
  snow: 0.5,
  heat: 0.8,
};

export interface FarmInput {
  crop: CropId;
  season: Season;
  weather: Weather;
  /** Toprak kalitesi 0.5-1.5. */
  soilQuality: number;
  /** Ciftcinin uzmanlik seviyesi 0-100. */
  expertise: number;
}

export interface FarmResult {
  ok: boolean;
  reason?: "wrong_season" | "unknown_crop";
  yieldAmount: number;
  growDays: number;
}

/**
 * Ekim: yalnizca uygun mevsimde. Verim toprak, uzmanlik ve havaya baglidir.
 * Kisin acik tarla verimi coker; bu, kitlik riskini dogurur (belge 9.4).
 */
export function plantCrop(input: FarmInput): FarmResult {
  const crop = CROPS.find((c) => c.id === input.crop);
  if (!crop) return { ok: false, reason: "unknown_crop", yieldAmount: 0, growDays: 0 };
  if (crop.season !== input.season) return { ok: false, reason: "wrong_season", yieldAmount: 0, growDays: 0 };
  const expertiseFactor = 0.6 + (Math.min(100, Math.max(0, input.expertise)) / 100) * 0.6;
  const weatherFactor = WEATHER_YIELD[input.weather];
  const yieldAmount = Math.max(0, Math.round(crop.baseYield * input.soilQuality * expertiseFactor * weatherFactor));
  return { ok: true, yieldAmount, growDays: crop.growDays };
}

/** Hayvancilik gunluk geliri: cikti degeri - bakim maliyeti. */
export function livestockDailyIncome(kind: LivestockId, headCount: number, itemValue: number): number {
  const def = LIVESTOCK.find((l) => l.id === kind);
  if (!def || headCount <= 0) return 0;
  const gross = def.dailyOutput.quantity * itemValue * headCount;
  return Math.round(gross - def.upkeep * headCount);
}

/** Mevsimsel kitlik riski: kisin ve hasat sonrasi dusuk stokta artar (belge 9.4). */
export function famineRisk(season: Season, grainStock: number, population: number): number {
  const need = population * 0.5;
  const base = season === "winter" ? 0.5 : season === "spring" ? 0.35 : 0.1;
  if (need <= 0) return 0;
  const scarcity = Math.max(0, 1 - grainStock / need);
  return Math.round(Math.min(1, base + scarcity * 0.5) * 100) / 100;
}

export type AnimalId = "wolf" | "bear" | "deer" | "boar" | "fox";

export interface AnimalDef {
  id: AnimalId;
  name: string;
  /** Avlanma zorlugu (0-100). */
  difficulty: number;
  /** Tehdit: yaralanma riski carpani. */
  danger: number;
  /** Evcillestirilebilir mi. */
  tameable: boolean;
  loot: { itemId: string; quantity: number }[];
}

export const ANIMALS: readonly AnimalDef[] = [
  { id: "wolf", name: "Kurt", difficulty: 55, danger: 1.6, tameable: false, loot: [{ itemId: "dried-meat", quantity: 1 }, { itemId: "cloth", quantity: 1 }] },
  { id: "bear", name: "Ayı", difficulty: 80, danger: 2.4, tameable: false, loot: [{ itemId: "dried-meat", quantity: 3 }] },
  { id: "deer", name: "Geyik", difficulty: 35, danger: 0.3, tameable: false, loot: [{ itemId: "dried-meat", quantity: 2 }] },
  { id: "boar", name: "Yaban Domuzu", difficulty: 45, danger: 1.2, tameable: false, loot: [{ itemId: "dried-meat", quantity: 2 }] },
  { id: "fox", name: "Tilki", difficulty: 40, danger: 0.4, tameable: true, loot: [{ itemId: "cloth", quantity: 1 }] },
];

export type InjuryKind = "cut" | "blunt" | "pierce" | "burn" | "fracture";

export interface HuntResult {
  success: boolean;
  loot: { itemId: string; quantity: number }[];
  injury: { kind: InjuryKind; severity: number } | null;
}

/**
 * Av: basari olasiligi hazirlik ve av becerisi ile artar; tehlikeli hayvan
 * yaralanma riski tasir. `roll` 0-1 arasi deger uretir (deterministik test).
 */
export function hunt(animal: AnimalId, preparedness: number, expertise: number, roll: () => number): HuntResult {
  const def = ANIMALS.find((a) => a.id === animal);
  if (!def) return { success: false, loot: [], injury: null };
  const skill = preparedness * 0.5 + expertise * 0.5;
  const chance = Math.max(0.05, Math.min(0.95, 1 - def.difficulty / 100 + skill / 200));
  if (roll() > chance) return { success: false, loot: [], injury: null };
  const injuryRoll = roll();
  const injuryChance = (def.danger * (100 - skill)) / 500;
  const injury = injuryRoll < injuryChance ? { kind: "cut" as const, severity: Math.round(def.danger * 10) } : null;
  return { success: true, loot: def.loot.map((l) => ({ ...l })), injury };
}

/** Evcillestirme: yalnizca uygun hayvan, yeterli beceri ve yem ile. */
export function tameAnimal(animal: AnimalId, expertise: number, hasFeed: boolean): { ok: boolean; reason?: string } {
  const def = ANIMALS.find((a) => a.id === animal);
  if (!def) return { ok: false, reason: "unknown_animal" };
  if (!def.tameable) return { ok: false, reason: "not_tameable" };
  if (!hasFeed) return { ok: false, reason: "no_feed" };
  if (expertise < 20) return { ok: false, reason: "not_skilled" };
  return { ok: true };
}

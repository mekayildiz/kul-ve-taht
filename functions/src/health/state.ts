/**
 * Karakter saglik durumu (tasarim belgesi 6, 7, 12.8).
 *
 * Ilkeler:
 * - Olum kalicidir; diriltme yoktur.
 * - Olum SEBEPSIZ ve RASTGELE olmamalidir: tehlike, hastalik ve savas
 *   sonuclari oyuncuya anlasilir bicimde sunulur; hazirlik, tedavi ve
 *   guvenlik riskleri AZALTIR.
 * - Kalori/mikro besin takibi YAPILMAZ (belge 12.8). Beslenme ve aclik
 *   basit ama anlamli bir dongu ile temsil edilir.
 */

export interface Injury {
  id: string;
  kind: "cut" | "blunt" | "pierce" | "burn" | "fracture";
  /** 1-100: yaralarin agirligi. */
  severity: number;
  /** Kanama 0-100; yuksek deger sagligi surekli dusurur. */
  bleeding: number;
  /** Enfeksiyon riski 0-100; tedavi edilmezse artar. */
  infection: number;
  treated: boolean;
  /** Yaralanmanin gerceklestigi oyun gunu. */
  occurredGameDay: number;
}

export interface Disease {
  id: string;
  name: string;
  severity: number;
  /** Bulasici mi (salgın icin). */
  contagious: boolean;
  treated: boolean;
  occurredGameDay: number;
}

export interface HealthState {
  /** 0 = olum, 100 = tam saglik. */
  health: number;
  /** 0 = tok, 100 = acil. */
  hunger: number;
  /** 0 = dinlenmis, 100 = bitkin. */
  fatigue: number;
  injuries: Injury[];
  diseases: Disease[];
  alive: boolean;
  /** Kalici sakatliklar (olumcul olmayan ama kalici). */
  permanentConditions: string[];
}

export const MAX_HEALTH = 100;
export const STARVATION_THRESHOLD = 80;
export const EXHAUSTION_THRESHOLD = 80;

export function healthyState(): HealthState {
  return {
    health: MAX_HEALTH,
    hunger: 0,
    fatigue: 0,
    injuries: [],
    diseases: [],
    alive: true,
    permanentConditions: [],
  };
}

/**
 * Agirlikli saglik hesabi: saglik, aclik, bitkinlik, kanama ve enfeksiyon
 * birlesir. Bu, oyuncunun durumunu anlasilir bicimde yansitir.
 */
export function effectiveHealth(state: HealthState): number {
  const bleeding = state.injuries.reduce((sum, i) => sum + (i.treated ? i.bleeding * 0.25 : i.bleeding), 0);
  const infection = state.diseases.reduce((sum, d) => sum + (d.treated ? d.severity * 0.2 : d.severity), 0);
  const untreated = state.injuries.filter((i) => !i.treated).reduce((sum, i) => sum + i.severity * 0.15, 0);
  const hungerPenalty = state.hunger > STARVATION_THRESHOLD ? (state.hunger - STARVATION_THRESHOLD) * 0.5 : 0;
  const fatiguePenalty = state.fatigue > EXHAUSTION_THRESHOLD ? (state.fatigue - EXHAUSTION_THRESHOLD) * 0.3 : 0;
  const raw = state.health - bleeding * 0.3 - infection * 0.2 - untreated - hungerPenalty - fatiguePenalty;
  return Math.max(0, Math.min(MAX_HEALTH, Math.round(raw * 10) / 10));
}

/**
 * Performans carpani 0.3-1.0. Nitelik/aksiyon testleri bununla olceklendirilir.
 * Aclik ve bitkinlik performansi dusurur (belge 12.8).
 */
export function performanceMultiplier(state: HealthState): number {
  const eff = effectiveHealth(state);
  const healthFactor = eff / MAX_HEALTH;
  const hungerFactor = state.hunger > STARVATION_THRESHOLD ? 0.7 : 1;
  const fatigueFactor = state.fatigue > EXHAUSTION_THRESHOLD ? 0.8 : 1;
  return Math.max(0.3, Math.round(healthFactor * hungerFactor * fatigueFactor * 100) / 100);
}

export function addInjury(state: HealthState, injury: Injury): HealthState {
  return { ...state, injuries: [...state.injuries, injury] };
}

export function addDisease(state: HealthState, disease: Disease): HealthState {
  return { ...state, diseases: [...state.diseases, disease] };
}

/** Bir oyun gunu gecince saglik durumunu ilerletir (belge 6). */
export function advanceDay(state: HealthState, gameDay: number): HealthState {
  if (!state.alive) return state;

  const injuries = state.injuries.map((injury) => {
    let bleeding = injury.bleeding;
    let infection = injury.infection;
    if (injury.treated) {
      bleeding = Math.max(0, bleeding - 4);
      infection = Math.max(0, infection - 3);
    } else {
      // Tedavi edilmeyen yara: kanama azalsa da enfeksiyon ARTAR (belge: risk).
      bleeding = Math.max(0, bleeding - 1);
      infection = Math.min(100, infection + 3);
    }
    return { ...injury, bleeding, infection, occurredGameDay: injury.occurredGameDay || gameDay };
  });

  const diseases = state.diseases.map((disease) => {
    const severity = disease.treated ? Math.max(0, disease.severity - 5) : Math.min(100, disease.severity + 1);
    return { ...disease, severity };
  });

  // Dogal iyilesme: dinlenmis ve tokken saglik toparlanir.
  let health = state.health;
  const bleedingTotal = injuries.reduce((s, i) => s + i.bleeding, 0);
  const infectionTotal = diseases.reduce((s, d) => s + d.severity, 0);
  const damage = Math.round(bleedingTotal * 0.05 + infectionTotal * 0.03);
  const recovery = state.hunger < 50 && state.fatigue < 50 ? 3 : 1;
  health = Math.max(0, Math.min(MAX_HEALTH, health - damage + recovery));

  const alive = health > 0;
  return {
    ...state,
    health,
    injuries: injuries.filter((i) => i.bleeding > 0 || i.severity > 0 || i.infection > 0),
    diseases: diseases.filter((d) => d.severity > 0),
    alive,
  };
}

/** Yemek: acligi dusurur, hafif saglik toparlar (belge 12.8). */
export function eat(state: HealthState, nutrition: number): HealthState {
  const hunger = Math.max(0, state.hunger - nutrition);
  const health = Math.min(MAX_HEALTH, state.health + Math.min(2, Math.floor(nutrition / 20)));
  return { ...state, hunger, health };
}

/** Uyku/dinlenme: bitkinligi dusurur. */
export function rest(state: HealthState, hours: number): HealthState {
  const fatigue = Math.max(0, state.fatigue - hours * 5);
  return { ...state, fatigue };
}

/** Gunluk aclik artisi (yemek yenmezse). */
export function advanceHunger(state: HealthState, gameDays: number): HealthState {
  const hunger = Math.min(100, state.hunger + gameDays * 8);
  return { ...state, hunger };
}

/** Uzun sureli aclik sagligi tehdit eder (belge 12.8). */
export function starvationDamage(state: HealthState): number {
  if (state.hunger <= STARVATION_THRESHOLD) return 0;
  return Math.round((state.hunger - STARVATION_THRESHOLD) * 0.15);
}

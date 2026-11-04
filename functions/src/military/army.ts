/**
 * Askeri sistemler: birlikler, kusatma, deniz savasi, diplomasi
 * (tasarim belgesi 10, 11, 14.5).
 *
 * Komutanlik, ikmal, moral ve arazi onemlidir. Kusatma ve genis olcekli
 * savas, buyuk kaynak tuketir; hesaplamalar SUNUCUDA yapilir.
 */

export type UnitType = "infantry" | "cavalry" | "archer" | "siege" | "naval";
export type ShipClass = "galley" | "longship" | "caravel" | "flagship";

export interface Unit {
  id: string;
  type: UnitType;
  /** Asker sayisi. */
  strength: number;
  /** Moral 0-100. */
  morale: number;
  /** Ikmal 0-100. */
  supply: number;
  /** Birlik deneyimi 0-100. */
  experience: number;
}

export interface Army {
  id: string;
  kingdomId: string;
  commanderSkill: number;
  units: Unit[];
  /** Konum (yerlesim id). */
  location: string;
}

export interface BattleOutcome {
  winner: "attacker" | "defender" | "draw";
  attackerLosses: number;
  defenderLosses: number;
  attackerPower: number;
  defenderPower: number;
  /** Ikmal yetersizse moral dususu. */
  supplyBroken: boolean;
}

/** Ordu gucu: birlik turu + moral + ikmal + deneyim + komutanlik. */
export function armyPower(army: Army): number {
  const unitPower = army.units.reduce((sum, u) => {
    const typeFactor: Record<UnitType, number> = { infantry: 1, cavalry: 1.4, archer: 1.1, siege: 1.6, naval: 1.2 };
    const morale = 0.5 + u.morale / 200;
    const supply = 0.5 + u.supply / 200;
    const exp = 0.8 + u.experience / 250;
    return sum + u.strength * typeFactor[u.type] * morale * supply * exp;
  }, 0);
  const command = 1 + army.commanderSkill / 100;
  return Math.round(unitPower * command);
}

/** Buyuk kara savasi (belge 14.5). Arazi ve ikmal sonucu belirler. */
export function resolveBattle(attacker: Army, defender: Army, terrainBonus: number, roll: () => number): BattleOutcome {
  const aPower = Math.round(armyPower(attacker) * (0.85 + roll() * 0.3));
  const dPower = Math.round(armyPower(defender) * (1 + terrainBonus / 100) * (0.85 + roll() * 0.3));
  const attackerSupplyOk = attacker.units.every((u) => u.supply >= 20);
  const defenderSupplyOk = defender.units.every((u) => u.supply >= 20);

  const aTotal = attacker.units.reduce((s, u) => s + u.strength, 0);
  const dTotal = defender.units.reduce((s, u) => s + u.strength, 0);
  const ratio = aPower / Math.max(1, dPower);
  const attackerLosses = Math.round(aTotal * Math.min(0.9, Math.max(0.05, 0.5 / ratio)));
  const defenderLosses = Math.round(dTotal * Math.min(0.9, Math.max(0.05, 0.5 * ratio)));

  const winner: BattleOutcome["winner"] = ratio > 1.1 ? "attacker" : ratio < 0.9 ? "defender" : "draw";
  return {
    winner,
    attackerLosses,
    defenderLosses,
    attackerPower: aPower,
    defenderPower: dPower,
    supplyBroken: !attackerSupplyOk || !defenderSupplyOk,
  };
}

/** Kusatma (belge 11): surlar, erzak, kusatma araclari. */
export interface SiegeState {
  fortressDefense: number;
  wallIntegrity: number;
  garrisonFood: number;
  siegeEngines: number;
  besiegerSupply: number;
}

export interface SiegeResult {
  /** Surlar asildi mi. */
  breached: boolean;
  daysElapsed: number;
  /** Kusatilanlar teslim mi. */
  surrendered: boolean;
}

/**
 * Kusatmayi gun gun cozumler. Erzak bitince teslim; surlar asilinca saldiri.
 * Kusatma araclari ve ikmal belirleyicidir.
 */
export function resolveSiege(state: SiegeState, maxDays = 90): SiegeResult {
  let wallIntegrity = state.wallIntegrity;
  let garrisonFood = state.garrisonFood;
  let besiegerSupply = state.besiegerSupply;
  let days = 0;

  while (days < maxDays) {
    days += 1;
    wallIntegrity = Math.max(0, wallIntegrity - state.siegeEngines * 1.5);
    garrisonFood = Math.max(0, garrisonFood - 2);
    besiegerSupply = Math.max(0, besiegerSupply - 1);

    if (garrisonFood <= 0) return { breached: false, daysElapsed: days, surrendered: true };
    if (besiegerSupply <= 0) return { breached: false, daysElapsed: days, surrendered: false };
    if (wallIntegrity <= 0) return { breached: true, daysElapsed: days, surrendered: false };
  }
  return { breached: false, daysElapsed: days, surrendered: false };
}

/** Gemi siniflari (belge 11). */
export const SHIP_STATS: Record<ShipClass, { crew: number; firepower: number; speed: number; cargo: number }> = {
  galley: { crew: 120, firepower: 40, speed: 30, cargo: 20 },
  longship: { crew: 60, firepower: 25, speed: 45, cargo: 10 },
  caravel: { crew: 80, firepower: 30, speed: 35, cargo: 40 },
  flagship: { crew: 200, firepower: 70, speed: 25, cargo: 30 },
};

export interface Fleet {
  id: string;
  kingdomId: string;
  ships: { class: ShipClass; condition: number }[];
}

export function fleetPower(fleet: Fleet): number {
  return fleet.ships.reduce((sum, s) => sum + SHIP_STATS[s.class].firepower * (s.condition / 100), 0);
}

/** Deniz savasi (belge 11): filo gucu + rastlanti. */
export function resolveNavalBattle(attacker: Fleet, defender: Fleet, roll: () => number): BattleOutcome {
  const aPower = Math.round(fleetPower(attacker) * (0.85 + roll() * 0.3));
  const dPower = Math.round(fleetPower(defender) * (0.85 + roll() * 0.3));
  const aShips = attacker.ships.length;
  const dShips = defender.ships.length;
  const ratio = aPower / Math.max(1, dPower);
  return {
    winner: ratio > 1.1 ? "attacker" : ratio < 0.9 ? "defender" : "draw",
    attackerLosses: Math.round(aShips * Math.min(0.9, Math.max(0, 0.5 / ratio))),
    defenderLosses: Math.round(dShips * Math.min(0.9, Math.max(0, 0.5 * ratio))),
    attackerPower: aPower,
    defenderPower: dPower,
    supplyBroken: false,
  };
}

/** Diplomasi iliskileri (belge 10). */
export type DiplomaticStance = "ally" | "friendly" | "neutral" | "tense" | "war";

export interface Relation {
  fromKingdomId: string;
  toKingdomId: string;
  stance: DiplomaticStance;
  /** -100 (dusman) .. +100 (müttefik). */
  affinity: number;
  /** Aktif ittifak. */
  allianceUntilGameDay: number | null;
}

/** Iliski degerine gore durus belirleme. */
export function stanceFor(affinity: number): DiplomaticStance {
  if (affinity >= 60) return "ally";
  if (affinity >= 20) return "friendly";
  if (affinity > -20) return "neutral";
  if (affinity > -60) return "tense";
  return "war";
}

/** Diplomatik eylem iliskiyi degistirir. */
export function applyDiplomacy(relation: Relation, action: "gift" | "marriage" | "insult" | "threat" | "treaty", amount: number): Relation {
  const deltas: Record<string, number> = { gift: amount, marriage: amount * 1.5, insult: -amount, threat: -amount * 0.8, treaty: amount * 1.2 };
  const affinity = Math.max(-100, Math.min(100, relation.affinity + (deltas[action] ?? 0)));
  return { ...relation, affinity, stance: stanceFor(affinity) };
}

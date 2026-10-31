/**
 * Dovus cozumleme (tasarim belgesi 14.1, 14.3, 16.5).
 *
 * Gercek zamanli aksiyon DEGILDIR. Sonuc; nitelikler, ekipman, hazirlik,
 * rakip, arazi ve kontrollu rastlantiya gore hesaplanir. Tum hesap
 * SUNUCUDA yapilir; istemci sonucu belirleyemez (belge 21.1).
 */

import type { Attributes } from "../character/attributes";

export type WeaponType = "sword" | "spear" | "axe" | "bow" | "crossbow" | "dagger" | "unarmed";

export interface CombatantStats {
  attributes: Attributes;
  /** Silah turu (belge 14.3). */
  weapon: WeaponType;
  /** O silahtaki ustalik seviyesi 0-10. */
  weaponMastery: number;
  /** Zirh degeri 0-100. */
  armor: number;
  /** Saglik carpani (health/100). */
  healthFactor: number;
  /** Arazi bonusu (-20..+20). */
  terrainBonus: number;
  /** Hazirlikli mi (pusu, plan). */
  prepared: boolean;
}

export type Terrain = "open" | "forest" | "mountain" | "fortified" | "naval";

export const TERRAIN_BONUS: Record<Terrain, number> = {
  open: 0,
  forest: 5,
  mountain: 8,
  fortified: 20,
  naval: 3,
};

/** Silah turune gore temel saldiri gucu. */
const WEAPON_POWER: Record<WeaponType, number> = {
  sword: 12,
  spear: 11,
  axe: 13,
  bow: 10,
  crossbow: 12,
  dagger: 7,
  unarmed: 5,
};

/** Silah-nitelik eslesmesi: hangi nitelik saldiriyi besler. */
const WEAPON_ATTRIBUTE: Record<WeaponType, keyof Attributes> = {
  sword: "strength",
  spear: "strength",
  axe: "strength",
  bow: "perception",
  crossbow: "perception",
  dagger: "agility",
  unarmed: "strength",
};

export function attackPower(c: CombatantStats): number {
  const attr = c.attributes[WEAPON_ATTRIBUTE[c.weapon]];
  const base = WEAPON_POWER[c.weapon] + attr * 1.2 + c.weaponMastery * 2;
  const prepared = c.prepared ? 1.15 : 1;
  const terrain = 1 + c.terrainBonus / 100;
  return Math.round(base * prepared * terrain * c.healthFactor * 10) / 10;
}

export function defensePower(c: CombatantStats): number {
  const base = c.attributes.endurance * 1.1 + c.attributes.agility * 0.8 + c.armor * 0.35;
  const terrain = 1 + c.terrainBonus / 100;
  return Math.round(base * terrain * c.healthFactor * 10) / 10;
}

export interface CombatRound {
  round: number;
  attackerDamage: number;
  defenderDamage: number;
  attackerPower: number;
  defenderPower: number;
}

export interface CombatResult {
  winner: "attacker" | "defender" | "draw";
  rounds: CombatRound[];
  attackerHpRemaining: number;
  defenderHpRemaining: number;
  /** Yaralanma olustu mu (belge 16.5: yaralanma riski). */
  attackerInjured: boolean;
  defenderInjured: boolean;
}

export const MAX_COMBAT_ROUNDS = 12;

/**
 * Dovusu cozumler. `roll` fonksiyonu enjekte edilebilir (deterministik test).
 * Hasar = max(1, saldiri - savunma/2) * rastlanti(0.8-1.2).
 */
export function resolveCombat(
  attacker: CombatantStats,
  defender: CombatantStats,
  roll: () => number,
): CombatResult {
  let attackerHp = 100 * attacker.healthFactor;
  let defenderHp = 100 * defender.healthFactor;
  const rounds: CombatRound[] = [];

  const aPower = attackPower(attacker);
  const dPower = attackPower(defender);
  const aDef = defensePower(attacker);
  const dDef = defensePower(defender);

  for (let round = 1; round <= MAX_COMBAT_ROUNDS; round++) {
    if (attackerHp <= 0 || defenderHp <= 0) break;
    const aDamage = Math.max(1, Math.round((aPower - dDef / 2) * (0.8 + roll() * 0.4)));
    const dDamage = Math.max(1, Math.round((dPower - aDef / 2) * (0.8 + roll() * 0.4)));
    defenderHp = Math.max(0, defenderHp - aDamage);
    attackerHp = Math.max(0, attackerHp - dDamage);
    rounds.push({ round, attackerDamage: aDamage, defenderDamage: dDamage, attackerPower: aPower, defenderPower: dPower });
  }

  let winner: CombatResult["winner"];
  if (attackerHp <= 0 && defenderHp <= 0) winner = "draw";
  else if (defenderHp <= 0) winner = "attacker";
  else if (attackerHp <= 0) winner = "defender";
  else winner = attackerHp > defenderHp ? "attacker" : defenderHp > attackerHp ? "defender" : "draw";

  return {
    winner,
    rounds,
    attackerHpRemaining: Math.round(attackerHp * 10) / 10,
    defenderHpRemaining: Math.round(defenderHp * 10) / 10,
    attackerInjured: attackerHp < 100 * attacker.healthFactor * 0.6,
    defenderInjured: defenderHp < 100 * defender.healthFactor * 0.6,
  };
}

/** Duelo daveti kabul edilebilir mi (belge 16.5). */
export function canDuel(isSafeCity: boolean, bothConsented: boolean): boolean {
  // Guvenli sehirlerde saldiri yok; duello icin karsilikli riza gerekir.
  if (isSafeCity) return bothConsented;
  return bothConsented;
}

/** PvP bolgesi mi: guvenli sehir disinda ve savas alani. */
export function isPvpAllowed(settlementKind: string, inPvpZone: boolean, atWar: boolean): boolean {
  if (settlementKind === "capital" || settlementKind === "city") return atWar;
  return inPvpZone || atWar;
}

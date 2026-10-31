/**
 * Buyu, din/tapinaklar, loncalar ve sehir yasami (tasarim belgesi 13, 15).
 *
 * Kural: Buyu ogrenme egitim, usta veya nadir kitap ile olur. Bazi yollar
 * (ruh cagirma) kralliklarda SUCTUR. Tapinaklar ayri bir inanc sistemi
 * degildir; sifa, bilgi, barinma ve koruma islevi gorur. Sonuclar sunucuda.
 */

export type MagicPath = "elemental" | "spirit_caller" | "shamanism";

export interface MagicPathDef {
  id: MagicPath;
  name: string;
  /** Ustalik icin gereken en az seviye. */
  minLevel: number;
  /** Ogrenme yolu: egitim mi, nadir kitap mi. */
  source: "training" | "rare_book" | "both";
  /** Bu yolu yasaklayan kralliklar (karanlik sanatlar suctur). */
  outlawedIn: string[];
}

export const MAGIC_PATHS: readonly MagicPathDef[] = [
  { id: "elemental", name: "Element Büyücülüğü", minLevel: 0, source: "both", outlawedIn: [] },
  { id: "shamanism", name: "Şamanlık", minLevel: 0, source: "training", outlawedIn: [] },
  { id: "spirit_caller", name: "Ruh Çağırma", minLevel: 20, source: "rare_book", outlawedIn: ["varkhenn", "caelvar"] },
];

export interface SpellDef {
  id: string;
  name: string;
  path: MagicPath;
  /** Ustalik gereksinimi. */
  level: number;
  /** Cagri maliyeti (mana/enerji). */
  cost: number;
  /** Combat gucu veya sifa etkisi. */
  power: number;
  /** Hastalik/yara iyilestirme. */
  heals: boolean;
}

export const SPELLS: readonly SpellDef[] = [
  { id: "flame-bolt", name: "Alev Oku", path: "elemental", level: 1, cost: 8, power: 22, heals: false },
  { id: "stone-skin", name: "Taş Deri", path: "elemental", level: 5, cost: 12, power: 15, heals: false },
  { id: "healing-spring", name: "Şifa Pınarı", path: "shamanism", level: 3, cost: 10, power: 25, heals: true },
  { id: "beast-speech", name: "Hayvan Dili", path: "shamanism", level: 8, cost: 6, power: 0, heals: false },
  { id: "raise-spirit", name: "Ruh Çağırma", path: "spirit_caller", level: 25, cost: 20, power: 35, heals: false },
];

/** Buyu ogrenme: kaynak, seviye ve krallik yasagi kontrol edilir. */
export function canLearnSpell(
  path: MagicPath,
  magicLevel: number,
  kingdomId: string,
  hasBook: boolean,
  hasMaster: boolean,
): { ok: boolean; reason?: string } {
  const def = MAGIC_PATHS.find((p) => p.id === path);
  if (!def) return { ok: false, reason: "unknown_path" };
  if (def.outlawedIn.includes(kingdomId)) return { ok: false, reason: "outlawed_here" };
  if (magicLevel < def.minLevel) return { ok: false, reason: "level_too_low" };
  if (def.source === "training" && !hasMaster) return { ok: false, reason: "no_master" };
  if (def.source === "rare_book" && !hasBook) return { ok: false, reason: "no_book" };
  if (def.source === "both" && !hasBook && !hasMaster) return { ok: false, reason: "no_source" };
  return { ok: true };
}

/** Buyu kullanma: seviye ve maliyet yeterliyse etki uygulanir. */
export function castSpell(spellId: string, magicLevel: number, energy: number): { ok: boolean; power: number; cost: number; heals: boolean; reason?: string } {
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell) return { ok: false, power: 0, cost: 0, heals: false, reason: "unknown_spell" };
  if (magicLevel < spell.level) return { ok: false, power: 0, cost: 0, heals: false, reason: "level_too_low" };
  if (energy < spell.cost) return { ok: false, power: 0, cost: 0, heals: false, reason: "not_enough_energy" };
  return { ok: true, power: spell.power, cost: spell.cost, heals: spell.heals };
}

/** Karanlik sanat kullanimi suc sayilir (belge 13.1, 13.4). */
export function isDarkMagicCrime(path: MagicPath, kingdomId: string): boolean {
  const def = MAGIC_PATHS.find((p) => p.id === path);
  return Boolean(def && def.outlawedIn.includes(kingdomId));
}

export type TempleService = "healing" | "knowledge" | "shelter" | "protection";

export interface TempleDef {
  service: TempleService;
  /** Hizmet maliyeti (altin); 0 ise bagis ile. */
  cost: number;
  /** Etki buyuklugu. */
  effect: number;
}

/**
 * Tapinak hizmetleri (belge 13.2): ayri inanc sistemi YOK; islevsel hizmet.
 */
export const TEMPLE_SERVICES: readonly TempleDef[] = [
  { service: "healing", cost: 10, effect: 30 },
  { service: "knowledge", cost: 8, effect: 1 },
  { service: "shelter", cost: 2, effect: 1 },
  { service: "protection", cost: 5, effect: 10 },
];

export function templeService(service: TempleService, gold: number): { ok: boolean; cost: number; effect: number; reason?: string } {
  const def = TEMPLE_SERVICES.find((s) => s.service === service);
  if (!def) return { ok: false, cost: 0, effect: 0, reason: "unknown_service" };
  if (gold < def.cost) return { ok: false, cost: def.cost, effect: 0, reason: "not_enough_gold" };
  return { ok: true, cost: def.cost, effect: def.effect };
}

// --- Loncalar (belge 13.3) ---

export interface GuildDef {
  id: string;
  name: string;
  profession: string;
  /** Uyelik aidati (altin). */
  dues: number;
  /** Uyelik icin gereken en az uzmanlik. */
  minExpertise: number;
}

export const GUILDS: readonly GuildDef[] = [
  { id: "smiths", name: "Demirciler Loncası", profession: "blacksmith", dues: 15, minExpertise: 10 },
  { id: "carpenters", name: "Marangozlar Loncası", profession: "carpenter", dues: 12, minExpertise: 10 },
  { id: "merchants", name: "Tüccarlar Loncası", profession: "merchant", dues: 25, minExpertise: 15 },
  { id: "healers", name: "Şifacılar Loncası", profession: "herbalist", dues: 18, minExpertise: 12 },
];

export function canJoinGuild(guildId: string, expertise: number, gold: number, reputation: number): { ok: boolean; reason?: string } {
  const guild = GUILDS.find((g) => g.id === guildId);
  if (!guild) return { ok: false, reason: "unknown_guild" };
  if (expertise < guild.minExpertise) return { ok: false, reason: "expertise_too_low" };
  if (gold < guild.dues) return { ok: false, reason: "cannot_afford_dues" };
  if (reputation < -20) return { ok: false, reason: "bad_reputation" };
  return { ok: true };
}

/** Lonca uyeligi: egitim, is ve itibar saglar (belge 13.3). */
export function guildBenefits(guildId: string, memberDays: number): { trainingBonus: number; workBonus: number; reputationPerMonth: number } {
  const guild = GUILDS.find((g) => g.id === guildId);
  if (!guild) return { trainingBonus: 0, workBonus: 0, reputationPerMonth: 0 };
  const tenure = Math.min(1, memberDays / 180);
  return {
    trainingBonus: Math.round(10 + tenure * 20),
    workBonus: Math.round(0.1 + tenure * 0.15 * 100) / 100,
    reputationPerMonth: Math.round(2 + tenure * 3),
  };
}

// --- Sehir yasami ve donemsel etkinlikler (belge 15) ---

export type ActivityKind = "tavern" | "market" | "tournament" | "festival" | "fair" | "gambling";

export interface ActivityDef {
  kind: ActivityKind;
  name: string;
  cost: number;
  /** Beklenen sonuc: itibar, altin, deneyim. */
  reputation: number;
  gold: number;
  xp: number;
  /** Kazanc/sonuc sans faktorune bagli mi (kumar). */
  chanceBased: boolean;
}

export const ACTIVITIES: readonly ActivityDef[] = [
  { kind: "tavern", name: "Han ve Taverna", cost: 3, reputation: 2, gold: 0, xp: 1, chanceBased: false },
  { kind: "market", name: "Pazar ve Dükkân", cost: 0, reputation: 1, gold: 0, xp: 1, chanceBased: false },
  { kind: "tournament", name: "Turnuva", cost: 10, reputation: 8, gold: 0, xp: 12, chanceBased: true },
  { kind: "festival", name: "Festival", cost: 5, reputation: 5, gold: 0, xp: 3, chanceBased: false },
  { kind: "fair", name: "Panayır", cost: 4, reputation: 3, gold: 0, xp: 2, chanceBased: false },
  { kind: "gambling", name: "Kumar", cost: 5, reputation: -1, gold: 0, xp: 0, chanceBased: true },
];

export interface ActivityOutcome {
  ok: boolean;
  reason?: string;
  goldDelta: number;
  reputationDelta: number;
  xp: number;
}

/**
 * Etkinlige katilma (belge 15). Kumar/turnuva sansa baglidir; `roll` 0-1.
 * Kazanc SUNUCUDA hesaplanir; istemci sonucu belirlemez.
 */
export function joinActivity(kind: ActivityKind, gold: number, roll: () => number = Math.random): ActivityOutcome {
  const def = ACTIVITIES.find((a) => a.kind === kind);
  if (!def) return { ok: false, reason: "unknown_activity", goldDelta: 0, reputationDelta: 0, xp: 0 };
  if (gold < def.cost) return { ok: false, reason: "not_enough_gold", goldDelta: 0, reputationDelta: 0, xp: 0 };
  let goldDelta = -def.cost;
  let reputationDelta = def.reputation;
  let xp = def.xp;
  if (def.chanceBased) {
    const win = roll() < 0.5;
    if (kind === "gambling") {
      goldDelta = win ? def.cost * 2 - def.cost : -def.cost;
      reputationDelta = win ? 1 : -2;
    } else {
      reputationDelta = win ? def.reputation : Math.round(def.reputation / 3);
      xp = win ? def.xp : Math.round(def.xp / 2);
      if (win) goldDelta = def.cost * 3 - def.cost;
    }
  }
  return { ok: true, goldDelta, reputationDelta, xp };
}

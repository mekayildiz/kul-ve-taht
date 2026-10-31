/**
 * Siyasi sistem: rutbe, makam, konsey ve siyasi mucadele (tasarim belgesi 10, 11).
 *
 * Kural: Bir makam ayni anda tek sahipli olur; atama yetkiyi verir, azil
 * geri alir. Siyasi mucadele destek ve itibar ile olculur; sonuc olasiliksal
 * olsa da SUNUCUDA cozulur (belge 21.1).
 */

export type Government =
  | "feudal_monarchy"
  | "council_monarchy"
  | "absolute_monarchy"
  | "elective_monarchy"
  | "noble_council_monarchy";

export type HolderType = "character" | "npc";

/** Rutbe: orduda/burokraside yukselen basamaklar (belge 10). */
export const RANKS = [
  "recruit",
  "soldier",
  "sergeant",
  "captain",
  "knight",
  "marshal",
  "general",
] as const;
export type Rank = (typeof RANKS)[number];

export interface Position {
  id: string;
  kingdomId: string;
  title: string;
  /** Islev alani: ornegin 'tax', 'army', 'justice'. */
  authority: string;
  holderType: HolderType | null;
  holderId: string | null;
  appointedAt: number | null;
}

/** Bir makam bos mu? */
export function isVacant(position: Position): boolean {
  return position.holderId === null;
}

/**
 * Atama: makam bossa veya yeni atanan mevcut sahibi degistiriyorsa uygulanir.
 * Kral/mutlak yonetimde tek bir atayici yeterlidir; konseyde onay gerekir.
 */
export function appoint(
  position: Position,
  holderType: HolderType,
  holderId: string,
  nowMs: number,
  councilApproval: boolean,
  government: Government,
): { ok: boolean; position: Position } {
  const needsCouncil = government === "council_monarchy" || government === "noble_council_monarchy";
  if (needsCouncil && !councilApproval) return { ok: false, position };
  return { ok: true, position: { ...position, holderType, holderId, appointedAt: nowMs } };
}

/** Azil: makam sahibi bosaltilir; yetki geri alinir. */
export function dismiss(position: Position): Position {
  return { ...position, holderType: null, holderId: null, appointedAt: null };
}

/** Rutbe yukseltme: yeterli hizmet ve yetki gerekir. */
export function promote(current: Rank, servicePoints: number, authority: boolean): Rank {
  const index = RANKS.indexOf(current);
  if (!authority) return current;
  if (index < 0 || index === RANKS.length - 1) return current;
  const threshold = (index + 1) * 20;
  return servicePoints >= threshold ? RANKS[index + 1]! : current;
}

/** Rutbe dusurme: ihanet veya agir sucta bir basamak (belge 10, 13). */
export function demote(current: Rank): Rank {
  const index = RANKS.indexOf(current);
  if (index <= 0) return RANKS[0]!;
  return RANKS[index - 1]!;
}

export interface CouncilMember {
  holderId: string;
  authority: string;
  /** Oy agirligi (konsey uyeleri esit veya hiyerarsik olabilir). */
  weight: number;
  support: number;
}

export interface CouncilDecision {
  passed: boolean;
  yes: number;
  no: number;
  quorumMet: boolean;
}

/** Konsey karari: oy agirligi + uye destegi; yetersayim zorunludur (belge 11). */
export function councilVote(
  members: readonly CouncilMember[],
  votes: Record<string, "yes" | "no">,
  quorum: number,
): CouncilDecision {
  let yes = 0;
  let no = 0;
  for (const member of members) {
    const weight = member.weight * (0.5 + member.support / 200);
    if (votes[member.holderId] === "yes") yes += weight;
    else if (votes[member.holderId] === "no") no += weight;
  }
  const quorumMet = yes + no >= quorum;
  return { passed: quorumMet && yes > no, yes: Math.round(yes), no: Math.round(no), quorumMet };
}

export interface PowerStruggle {
  challengerSupport: number;
  incumbentSupport: number;
  challengerReputation: number;
  incumbentReputation: number;
}

/**
 * Siyasi mucadele cozumu (belge 11): destek + itibar toplami yuksek olan
 * kazanir; esitlikte mevcut makam sahibi avantajlidir. Cekilisli (roll)
 * degil, belirlidir; boylece sonuc oyuncuya aciklanabilir.
 */
export function resolvePowerStruggle(struggle: PowerStruggle): "challenger" | "incumbent" {
  const challenger = struggle.challengerSupport + struggle.challengerReputation * 0.5;
  const incumbent = struggle.incumbentSupport + struggle.incumbentReputation * 0.5;
  return challenger > incumbent ? "challenger" : "incumbent";
}

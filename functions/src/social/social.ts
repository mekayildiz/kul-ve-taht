/**
 * Cok oyunculu sosyal sistemler (tasarim belgesi 16).
 *
 * Kalici ortak dunya: karakter, mulk, ekonomi ve iliskiler sunucuda tutulur.
 * Iletisim: genel/yerel sohbet, ozel mesaj, bildirim. Sesli sohbet YOK.
 * PvP: duello, PvP bolgesi, guvenli sehir korumasi (bkz. combat/resolve.ts).
 */

export type ChannelKind = "global" | "local" | "guild" | "group" | "direct";

export interface ChatChannel {
  id: string;
  kind: ChannelKind;
  /** Yerel kanal icin yerlesim; ozel mesaj icin hedef karakter. */
  scopeId: string | null;
  name: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderCharacterId: string;
  body: string;
  sentAtMs: number;
  /** Ozel mesajda hedef. */
  recipientCharacterId: string | null;
}

export const MAX_MESSAGE_LENGTH = 500;

export type SendError = "empty" | "too_long" | "no_access";

/**
 * Mesaj gonderim dogrulamasi SUNUCUDA. Oyuncu yalnizca erisimi olan kanala
 * yazabilir (yerel kanal icin o yerlesimde olmali).
 */
export function canSendToChannel(
  channel: ChatChannel,
  senderSettlementId: string | null,
  isGuildMember: boolean,
  isGroupMember: boolean,
): boolean {
  switch (channel.kind) {
    case "global":
      return true;
    case "local":
      return channel.scopeId !== null && channel.scopeId === senderSettlementId;
    case "guild":
      return isGuildMember;
    case "group":
      return isGroupMember;
    case "direct":
      return true;
  }
}

export function validateMessage(body: string): SendError | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.length > MAX_MESSAGE_LENGTH) return "too_long";
  return null;
}

export interface Guild {
  id: string;
  name: string;
  leaderCharacterId: string;
  members: { characterId: string; rank: string }[];
  treasury: number;
  /** Lonca itibari. */
  reputation: number;
}

export interface Group {
  id: string;
  name: string;
  leaderCharacterId: string;
  members: string[];
  /** Ortak seyahat/gorev/av icin hedef. */
  objective: string | null;
}

export const MAX_GUILD_MEMBERS = 50;
export const MAX_GROUP_MEMBERS = 8;

export function canJoinGuild(guild: Guild): boolean {
  return guild.members.length < MAX_GUILD_MEMBERS;
}

export function canJoinGroup(group: Group): boolean {
  return group.members.length < MAX_GROUP_MEMBERS;
}

export type RelationshipKind = "friend" | "enemy" | "ally" | "trade_partner";

export interface PlayerRelationship {
  fromCharacterId: string;
  toCharacterId: string;
  kind: RelationshipKind;
  /** -100..+100. */
  affinity: number;
}

/**
 * Arkadaslik karsilikli mi (dusmanlik tek tarafli olabilir).
 * a'da (c1 -> c2) varsa, b'de ters yonlu (c2 -> c1) kayit aranir.
 */
export function isMutual(a: PlayerRelationship[], b: PlayerRelationship[]): boolean {
  return a.some(
    (rel) =>
      rel.kind === "friend" &&
      b.some(
        (other) =>
          other.kind === "friend" &&
          other.fromCharacterId === rel.toCharacterId &&
          other.toCharacterId === rel.fromCharacterId,
      ),
  );
}

export interface DuelRequest {
  id: string;
  challengerId: string;
  defenderId: string;
  /** Guvenli sehirde duello icin karsilikli riza gerekir (belge 16.5). */
  accepted: boolean;
  createdAtMs: number;
}

export const DUEL_REQUEST_TTL_MS = 5 * 60 * 1000;

export function isDuelRequestValid(req: DuelRequest, nowMs: number): boolean {
  return !req.accepted && nowMs - req.createdAtMs < DUEL_REQUEST_TTL_MS;
}

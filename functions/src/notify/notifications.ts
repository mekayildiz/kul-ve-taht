/**
 * Oyuncu bildirimleri (tasarim belgesi 19).
 *
 * Kural: Bildirimler oyuncuyu surekli cevrimici kalmaya zorlamaz; onemli
 * olaylar OZETLENIR, onemsiz arka plan olaylari bildirim yagmuruna donusmez.
 * Bu yuzden oncelik esigi ve toplu ozetleme uygulanir.
 */

import type { SqlDatabase } from "../db/client";

export type NotificationKind =
  | "direct_message"
  | "trade_offer"
  | "trade_completed"
  | "family_growth"
  | "marriage"
  | "war_peace"
  | "kingdom_decision"
  | "property_growth"
  | "quest_world_event"
  | "daily_progress"
  | "character_death";

/** Oncelik: 3 = kritik, 2 = onemli, 1 = bilgi, 0 = arka plan (varsayilan gizli). */
export type NotificationPriority = 0 | 1 | 2 | 3;

export interface Notification {
  id: string;
  kind: NotificationKind;
  priority: NotificationPriority;
  /** Oyuncuya gosterilecek ozet metin. */
  summary: string;
  createdAtMs: number;
  read: boolean;
}

export const KIND_PRIORITY: Record<NotificationKind, NotificationPriority> = {
  direct_message: 3,
  trade_offer: 2,
  trade_completed: 2,
  marriage: 3,
  war_peace: 3,
  kingdom_decision: 2,
  family_growth: 1,
  property_growth: 1,
  quest_world_event: 1,
  daily_progress: 1,
  character_death: 3,
};

/** Varsayilan gosterim esigi: 1 ve uzeri gosterilir; arka plan gizlenir. */
export const DEFAULT_VISIBILITY_THRESHOLD: NotificationPriority = 1;

export function createNotification(
  kind: NotificationKind,
  summary: string,
  nowMs: number,
  priorityOverride?: NotificationPriority,
): Notification {
  return {
    id: `${kind}-${nowMs}-${Math.floor(nowMs % 100000)}`,
    kind,
    priority: priorityOverride ?? KIND_PRIORITY[kind],
    summary,
    createdAtMs: nowMs,
    read: false,
  };
}

export interface Digest {
  /** Gosterilecek bildirimler (oncelik esigi uzerinde). */
  visible: Notification[];
  /** Arka plan olaylari tek satirda ozetlendi. */
  backgroundSummary: string | null;
  unreadCount: number;
}

/**
 * Ozet uretimi: esik uzeri bildirimler tek tek, arka plan olaylari TEK satir
 * ozet olarak doner. Boylece bildirim yagmuru onlenir (belge 19).
 */
export function buildDigest(
  notifications: readonly Notification[],
  threshold: NotificationPriority = DEFAULT_VISIBILITY_THRESHOLD,
): Digest {
  const visible = notifications.filter((n) => n.priority >= threshold);
  const background = notifications.filter((n) => n.priority < threshold);
  const unreadCount = notifications.filter((n) => !n.read).length;
  let backgroundSummary: string | null = null;
  if (background.length > 0) {
    const byKind = new Map<NotificationKind, number>();
    for (const n of background) byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1);
    backgroundSummary = [...byKind.entries()].map(([kind, count]) => `${kind}×${count}`).join(", ");
  }
  return { visible, backgroundSummary, unreadCount };
}

/** Okundu isaretleme: yalnizca belirtilen kimlikler. */
export function markRead(notifications: readonly Notification[], ids: readonly string[]): Notification[] {
  const set = new Set(ids);
  return notifications.map((n) => (set.has(n.id) ? { ...n, read: true } : n));
}

/** Bildirim kirpma: en yeni N bildirim tutulur (depolama ve kota dostu). */
export function trimNotifications(notifications: readonly Notification[], max = 100): Notification[] {
  return [...notifications].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, max);
}

/**
 * Karakterin sahibine bildirim yazar (belge 19). Sahip bulunamazsa sessizce
 * doner; gunluk ilerleme gibi arka plan akislari bunu guvenle cagirabilir.
 */
export async function notifyCharacter(
  db: SqlDatabase,
  characterId: string,
  kind: NotificationKind,
  summary: string,
  nowMs = Date.now(),
): Promise<void> {
  const owner = await db
    .prepare("SELECT account_id FROM characters WHERE id = ?")
    .bind(characterId)
    .first<{ account_id: string }>();
  if (!owner) return;
  const notification = createNotification(kind, summary.slice(0, 200), nowMs);
  await db
    .prepare(
      `INSERT INTO player_notifications (id, account_id, kind, priority, summary, read, created_at)
       VALUES (?,?,?,?,?,0,?)`,
    )
    .bind(
      notification.id,
      owner.account_id,
      notification.kind,
      notification.priority,
      notification.summary,
      notification.createdAtMs,
    )
    .run();
}
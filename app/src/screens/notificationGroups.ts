/**
 * Bildirim gruplama (tasarim belgesi 19).
 *
 * Neden: bildirim listesi tek duz liste halinde buyuyordu; oyuncu onemli
 * olani (mesaj, teklif) gurultuden (gunluk ilerleme) ayiramiyordu.
 *
 * Kural saf: girdi bildirim listesi, cikti gruplar. Onem sirasi korunur.
 */

import type { NotificationDto } from "../api/client";

export type NotificationGroupId = "messages" | "trades" | "world" | "family" | "personal" | "other";

/** Arayuzde gosterim sirasi: en onemli en ustte. */
export const GROUP_ORDER: NotificationGroupId[] = [
  "messages",
  "trades",
  "family",
  "world",
  "personal",
  "other",
];

const KIND_GROUP: Record<string, NotificationGroupId> = {
  direct_message: "messages",
  trade_offer: "trades",
  trade_completed: "trades",
  marriage: "family",
  family_growth: "family",
  war_peace: "world",
  kingdom_decision: "world",
  quest_world_event: "world",
  property_growth: "personal",
  daily_progress: "personal",
  character_death: "personal",
};

export function groupOf(kind: string): NotificationGroupId {
  return KIND_GROUP[kind] ?? "other";
}

export interface NotificationGroup {
  id: NotificationGroupId;
  items: NotificationDto[];
  unread: number;
}

/** Bildirimleri gruplara ayirir; bos gruplar cikarilir, sira korunur. */
export function groupNotifications(items: NotificationDto[]): NotificationGroup[] {
  const byGroup = new Map<NotificationGroupId, NotificationDto[]>();
  for (const item of items) {
    const id = groupOf(item.kind);
    const list = byGroup.get(id);
    if (list) list.push(item);
    else byGroup.set(id, [item]);
  }

  return GROUP_ORDER.filter((id) => byGroup.has(id)).map((id) => {
    const list = byGroup.get(id)!;
    return { id, items: list, unread: list.filter((n) => !n.read).length };
  });
}

/** Toplam okunmamis sayisi; rozet icin. */
export function unreadTotal(items: NotificationDto[]): number {
  return items.filter((n) => !n.read).length;
}

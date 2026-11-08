/**
 * Bildirim gruplama testleri (belge 19).
 */

import { describe, expect, it } from "vitest";
import { GROUP_ORDER, groupNotifications, groupOf, unreadTotal } from "./notificationGroups";
import type { NotificationDto } from "../api/client";

const notif = (over: Partial<NotificationDto>): NotificationDto => ({
  id: over.id ?? "n1",
  kind: "daily_progress",
  priority: 1,
  summary: "ozet",
  createdAtMs: 0,
  read: false,
  ...over,
});

describe("groupOf", () => {
  it("bilinen turleri dogru gruba atar", () => {
    expect(groupOf("direct_message")).toBe("messages");
    expect(groupOf("trade_offer")).toBe("trades");
    expect(groupOf("trade_completed")).toBe("trades");
    expect(groupOf("marriage")).toBe("family");
    expect(groupOf("family_growth")).toBe("family");
    expect(groupOf("war_peace")).toBe("world");
    expect(groupOf("kingdom_decision")).toBe("world");
    expect(groupOf("quest_world_event")).toBe("world");
    expect(groupOf("property_growth")).toBe("personal");
    expect(groupOf("daily_progress")).toBe("personal");
    expect(groupOf("character_death")).toBe("personal");
  });

  it("bilinmeyen turu 'diger' grubuna atar", () => {
    expect(groupOf("bilinmeyen_tur")).toBe("other");
  });
});

describe("groupNotifications", () => {
  it("bildirimleri gruplara ayirir", () => {
    const groups = groupNotifications([
      notif({ id: "a", kind: "daily_progress" }),
      notif({ id: "b", kind: "direct_message" }),
      notif({ id: "c", kind: "trade_offer" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["messages", "trades", "personal"]);
  });

  it("gosterim sirasi onem sirasini izler", () => {
    const groups = groupNotifications([
      notif({ id: "a", kind: "daily_progress" }),
      notif({ id: "b", kind: "war_peace" }),
      notif({ id: "c", kind: "direct_message" }),
      notif({ id: "d", kind: "marriage" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["messages", "family", "world", "personal"]);
    expect(GROUP_ORDER.indexOf("messages")).toBeLessThan(GROUP_ORDER.indexOf("personal"));
  });

  it("grup icinde okunmamis sayisini verir", () => {
    const groups = groupNotifications([
      notif({ id: "a", kind: "trade_offer", read: false }),
      notif({ id: "b", kind: "trade_offer", read: true }),
      notif({ id: "c", kind: "trade_offer", read: false }),
    ]);
    expect(groups[0]!.unread).toBe(2);
    expect(groups[0]!.items).toHaveLength(3);
  });

  it("bos gruplari cikarir", () => {
    const groups = groupNotifications([notif({ id: "a", kind: "direct_message" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("messages");
  });

  it("bos listede bos dizi doner", () => {
    expect(groupNotifications([])).toEqual([]);
  });

  it("girdi sirasini grup icinde korur", () => {
    const groups = groupNotifications([
      notif({ id: "a", kind: "trade_offer" }),
      notif({ id: "b", kind: "trade_completed" }),
    ]);
    expect(groups[0]!.items.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("unreadTotal", () => {
  it("okunmamislari sayar", () => {
    expect(unreadTotal([notif({ read: false }), notif({ read: true }), notif({ read: false })])).toBe(2);
  });

  it("bos listede sifir", () => {
    expect(unreadTotal([])).toBe(0);
  });
});

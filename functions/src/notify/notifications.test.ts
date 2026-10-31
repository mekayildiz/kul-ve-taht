import { describe, expect, it } from "vitest";
import {
  buildDigest,
  createNotification,
  markRead,
  trimNotifications,
  type Notification,
} from "./notifications";

describe("Oyuncu bildirimleri (E8, belge 19)", () => {
  it("olay turune gore oncelik atanir", () => {
    const dm = createNotification("direct_message", "Merhaba", 1000);
    const bg = createNotification("family_growth", "Çocuk büyüdü", 1000);
    expect(dm.priority).toBe(3);
    expect(bg.priority).toBe(1);
  });

  it("ozet onemli olaylari gosterir, arka plani tek satirda toplar", () => {
    const list: Notification[] = [
      createNotification("direct_message", "Selam", 1000),
      createNotification("family_growth", "A büyüdü", 1001),
      createNotification("family_growth", "B büyüdü", 1002),
      createNotification("property_growth", "Dükkân kâr etti", 1003),
    ];
    const digest = buildDigest(list, 2);
    expect(digest.visible).toHaveLength(1);
    expect(digest.visible[0]!.kind).toBe("direct_message");
    expect(digest.backgroundSummary).toContain("family_growth×2");
    expect(digest.unreadCount).toBe(4);
  });

  it("arka plan olaylari bildirim yagmuru olusturmaz", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      createNotification("quest_world_event", `olay ${i}`, 1000 + i, 0),
    );
    const digest = buildDigest(many);
    expect(digest.visible).toHaveLength(0);
    expect(digest.backgroundSummary).toBe("quest_world_event×50");
  });

  it("okundu isaretleme yalnizca secilenleri degistirir", () => {
    const a = createNotification("direct_message", "a", 1000);
    const b = createNotification("trade_offer", "b", 1001);
    const marked = markRead([a, b], [a.id]);
    expect(marked.find((n) => n.id === a.id)?.read).toBe(true);
    expect(marked.find((n) => n.id === b.id)?.read).toBe(false);
  });

  it("bildirimler kirpilir (depolama dostu)", () => {
    const many = Array.from({ length: 200 }, (_, i) => createNotification("trade_completed", `t${i}`, 1000 + i));
    const trimmed = trimNotifications(many, 100);
    expect(trimmed).toHaveLength(100);
    expect(trimmed[0]!.createdAtMs).toBe(1199);
  });
});

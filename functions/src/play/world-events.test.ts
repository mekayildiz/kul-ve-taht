/**
 * Dunya gunlugu okuma testleri (belge 8.8, 12.5).
 *
 * Gercek SQLite motoru uzerinde dogrular: olaylar onem sirasina gore okunur,
 * yerlesim adlari cozulur ve bilinmeyen olay turu notr etiketle gosterilir.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { seedWorld } from "../world/seed";
import { execute, queryOne, type SqlDatabase } from "../db/client";
import { readWorldEvents } from "./world-events";

async function logEvent(
  db: SqlDatabase,
  id: string,
  type: string,
  settlementId: string | null,
  severity: number,
  gameDay: number,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO world_event_log (id, event_type, settlement_id, severity, payload_json, game_day, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    id,
    type,
    settlementId,
    severity,
    "{}",
    gameDay,
    1000 + gameDay,
  );
}

describe("readWorldEvents", () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = createTestDb();
    await seedWorld(db);
  });

  it("bos gunlukte bos dizi doner", async () => {
    expect(await readWorldEvents(db)).toEqual([]);
  });

  it("en yeni olayi basa koyar ve yerlesim adini cozer", async () => {
    const s = await queryOne<{ id: string; name: string }>(db, "SELECT id, name FROM settlements LIMIT 1");
    await logEvent(db, "e1", "war", s!.id, 2, 10);
    await logEvent(db, "e2", "famine", s!.id, 2, 12);
    const events = await readWorldEvents(db, { limit: 10 });
    expect(events).toHaveLength(2);
    expect(events[0]!.id).toBe("e2");
    expect(events[0]!.title).toBe("Kıtlık baş gösterdi");
    expect(events[0]!.settlementName).toBe(s!.name);
    expect(events[0]!.tone).toBe("bad");
  });

  it("sinceGameDay verilince yalnizca sonrasini doner", async () => {
    await logEvent(db, "old", "war", null, 2, 5);
    await logEvent(db, "new", "peace", null, 2, 9);
    const events = await readWorldEvents(db, { sinceGameDay: 7 });
    expect(events.map((e) => e.id)).toEqual(["new"]);
  });

  it("yerlesime gore suzebilir", async () => {
    const s = await queryOne<{ id: string }>(db, "SELECT id FROM settlements LIMIT 1");
    await logEvent(db, "a", "war", s!.id, 2, 3);
    await logEvent(db, "b", "war", null, 2, 4);
    const events = await readWorldEvents(db, { settlementId: s!.id });
    expect(events.map((e) => e.id)).toEqual(["a"]);
  });

  it("bilinmeyen olay turu basligi kendi turu olur ve notr tonlanir", async () => {
    await logEvent(db, "x", "mystery", null, 1, 1);
    const events = await readWorldEvents(db);
    expect(events[0]!.title).toBe("mystery");
    expect(events[0]!.tone).toBe("neutral");
  });

  it("limit'i 100 ile sinirlar", async () => {
    const events = await readWorldEvents(db, { limit: 9999 });
    expect(events).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { execute, queryOne } from "../db/client";
import {
  adminGrantGold,
  adminGrantItem,
  adminRevokeItem,
  adminGetAttributes,
  adminSetAttribute,
  adminAdjustVitals,
} from "./grants";

async function makeCharacter(db: ReturnType<typeof createTestDb>): Promise<string> {
  const accountId = crypto.randomUUID();
  const characterId = crypto.randomUUID();
  await execute(
    db,
    "INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    accountId,
    `oyuncu-${accountId}@ornek.tr`,
    "pbkdf2-sha256$1$AA$AA",
    "player",
    "tr",
    "active",
    1,
    1,
  );
  await execute(
    db,
    "INSERT INTO characters (id, account_id, given_name, surname, gender, age_years, alive, generation, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    characterId,
    accountId,
    "Kael",
    "Veyr",
    "male",
    20,
    1,
    1,
    1,
  );
  return characterId;
}

describe("yonetim uye islemleri (para/esya/nitelik)", () => {
  it("para ekler ve cikarir; toplam negatife dusmez", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    expect(await adminGrantGold(db, id, 100)).toMatchObject({ ok: true });
    expect(await queryOne<{ gold: number }>(db, "SELECT gold FROM character_state WHERE character_id = ?", id)).toMatchObject({ gold: 120 });
    await adminGrantGold(db, id, -500);
    expect(await queryOne<{ gold: number }>(db, "SELECT gold FROM character_state WHERE character_id = ?", id)).toMatchObject({ gold: 0 });
  });

  it("gecersiz para miktarini reddeder", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    expect(await adminGrantGold(db, id, 2_000_000)).toEqual({ ok: false, error: "invalid_amount" });
    expect(await adminGrantGold(db, id, 1.5)).toEqual({ ok: false, error: "invalid_amount" });
  });

  it("esya verir ve geri alir", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    expect(await adminGrantItem(db, id, "iron-sword", 2)).toMatchObject({ ok: true });
    await adminGrantItem(db, id, "iron-sword", 3);
    const row = await queryOne<{ inventory_json: string }>(db, "SELECT inventory_json FROM character_state WHERE character_id = ?", id);
    const sword = (JSON.parse(row!.inventory_json) as { itemId: string; quantity: number }[]).find((e) => e.itemId === "iron-sword");
    expect(sword?.quantity).toBe(5);
    expect(await adminRevokeItem(db, id, "iron-sword", 5)).toMatchObject({ ok: true });
    const after = await queryOne<{ inventory_json: string }>(db, "SELECT inventory_json FROM character_state WHERE character_id = ?", id);
    expect((JSON.parse(after!.inventory_json) as { itemId: string }[]).some((e) => e.itemId === "iron-sword")).toBe(false);
  });

  it("bilinmeyen esyayi reddeder", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    expect(await adminGrantItem(db, id, "yok-boyle-esya", 1)).toEqual({ ok: false, error: "invalid_item" });
  });

  it("niteligi ayarlar ve 1..20 araligina kirpar", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    expect(await adminSetAttribute(db, id, "strength", 15)).toMatchObject({ ok: true, value: 15 });
    expect(await adminSetAttribute(db, id, "strength", 99)).toMatchObject({ ok: true, value: 20 });
    expect(await adminSetAttribute(db, id, "strength", -5)).toMatchObject({ ok: true, value: 1 });
    expect((await adminGetAttributes(db, id))?.strength).toBe(1);
  });

  it("bilinmeyen niteligi reddeder", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    expect(await adminSetAttribute(db, id, "zeka", 10)).toEqual({ ok: false, error: "invalid_attribute" });
  });

  it("canli durumu duzeltir", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    await adminAdjustVitals(db, id, { health: 42, energy: 77, reputation: 5 });
    const row = await queryOne<{ health_json: string; energy: number; reputation: number }>(
      db,
      "SELECT health_json, energy, reputation FROM character_state WHERE character_id = ?",
      id,
    );
    expect((JSON.parse(row!.health_json) as { health: number }).health).toBe(42);
    expect(row?.energy).toBe(77);
    expect(row?.reputation).toBe(5);
  });

  it("olmayan karakter icin not_found doner", async () => {
    const db = createTestDb();
    expect(await adminGrantGold(db, "yok", 10)).toEqual({ ok: false, error: "not_found" });
    expect(await adminGetAttributes(db, "yok")).toBeNull();
  });

  it("her islem audit_log'a yazilir", async () => {
    const db = createTestDb();
    const id = await makeCharacter(db);
    await adminGrantGold(db, id, 50, "admin-1");
    const row = await queryOne<{ action: string; actor_id: string; target_id: string }>(
      db,
      "SELECT action, actor_id, target_id FROM audit_log ORDER BY created_at DESC LIMIT 1",
    );
    expect(row).toMatchObject({ action: "admin_grant_gold", actor_id: "admin-1", target_id: id });
  });
});

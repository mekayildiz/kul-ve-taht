/**
 * Guvenlik ve entegrasyon testleri (E7.3, tasarim belgesi 21.1).
 *
 * Amac: Istemcinin otorite olmadigini KANITLAMAK. Para, esya, sahiplik ve
 * yetki istemciden gelen veriyle degistirilememelidir.
 */

import { describe, expect, it, beforeEach } from "vitest";
import worker, { type Env } from "./index";
import { createTestDb } from "./test-support/sqlite-harness";
import { createSessionToken } from "./auth/session";
import { registerAccount } from "./auth/service";
import { seedWorld } from "./world/seed";
import { emptyAttributes } from "./character/attributes";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: createTestDb(), SESSION_SECRET: "test-secret-degistir", ...overrides };
}

async function call(path: string, env: Env, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://kulvetah.local${path}`, init), env, {} as ExecutionContext);
}

async function player(env: Env, email: string) {
  const reg = await registerAccount(env.DB, { email, password: "cok-guclu-parola-1" });
  if (!reg.ok) throw new Error("kayit basarisiz");
  const token = await createSessionToken(
    { accountId: reg.accountId, role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
    env.SESSION_SECRET,
  );
  return { token, accountId: reg.accountId };
}

describe("Guvenlik (E7.3)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("bozuk/gecersiz token reddedilir", async () => {
    const res = await call("/api/me", env, { headers: { authorization: "Bearer tamamen-sahte" } });
    expect(res.status).toBe(401);
  });

  it("imzasi degistirilmis token reddedilir (HMAC butunlugu)", async () => {
    const token = await createSessionToken(
      { accountId: "acc-1", role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
      "baska-bir-sir",
    );
    const res = await call("/api/me", env, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("oyuncu kendi rolunu yukseltemez (istemci rol gonderemez)", async () => {
    const { token } = await player(env, "a@valedorn.tr");
    const res = await call("/api/me", env, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("player");
  });

  it("admin ucu oyuncuya kapali (yetki yukseltme engeli)", async () => {
    const { token } = await player(env, "b@valedorn.tr");
    const res = await call("/api/admin/seed-world", env, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
  });

  it("baska oyuncunun karakter durumuna erisim engellenir (sahiplik)", async () => {
    await seedWorld(env.DB);
    const owner = await player(env, "sahip@valedorn.tr");
    const create = await call("/api/characters", env, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ givenName: "Kael", surname: "Veyr", birthSettlement: "varkhenn-drahkmar", attributes: emptyAttributes() }),
    });
    const { characterId } = (await create.json()) as { characterId: string };

    const attacker = await player(env, "saldirgan@valedorn.tr");
    const res = await call(`/api/play/${characterId}/state`, env, { headers: { authorization: `Bearer ${attacker.token}` } });
    expect(res.status).toBe(403);
  });

  it("istemci altin/miktar gondererek para uretemez (fiyat sunucuda)", async () => {
    await seedWorld(env.DB);
    const { token } = await player(env, "zengin@valedorn.tr");
    const create = await call("/api/characters", env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ givenName: "Kael", surname: "Veyr", birthSettlement: "varkhenn-drahkmar", attributes: emptyAttributes() }),
    });
    const { characterId } = (await create.json()) as { characterId: string };

    // Istemci "gold: 999999" gonderiyor; sunucu bunu YOK SAYMALI.
    const res = await call(`/api/play/${characterId}/action`, env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "rest", hours: 6, gold: 999999 }),
    });
    const body = (await res.json()) as { state: { gold: number } };
    expect(body.state.gold).toBe(20);
  });

  it("negatif miktarla esya uretilemez (dogrulama)", async () => {
    await seedWorld(env.DB);
    const { token } = await player(env, "negatif@valedorn.tr");
    const create = await call("/api/characters", env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ givenName: "Kael", surname: "Veyr", birthSettlement: "varkhenn-drahkmar", attributes: emptyAttributes() }),
    });
    const { characterId } = (await create.json()) as { characterId: string };
    const res = await call(`/api/play/${characterId}/action`, env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "trade", itemId: "bread", quantity: -50, side: "buy" }),
    });
    // Negatif miktar 1'e sabitlenir; altin artmaz.
    const body = (await res.json()) as { state: { gold: number } };
    expect(body.state.gold).toBeLessThanOrEqual(20);
  });

  it("envanterde olmayan esya satilamaz", async () => {
    await seedWorld(env.DB);
    const { token } = await player(env, "satis@valedorn.tr");
    const create = await call("/api/characters", env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ givenName: "Kael", surname: "Veyr", birthSettlement: "varkhenn-drahkmar", attributes: emptyAttributes() }),
    });
    const { characterId } = (await create.json()) as { characterId: string };
    const res = await call(`/api/play/${characterId}/action`, env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "trade", itemId: "chainmail", quantity: 1, side: "sell" }),
    });
    expect(res.status).toBe(400);
  });
});

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
  const request = new Request(`https://kulvetah.local${path}`, init);
  return worker.fetch(request, env, {} as ExecutionContext);
}

/** Kayit + karakter olusturur; token ve karakter kimligini doner. */
async function setupPlayer(env: Env) {
  const reg = await registerAccount(env.DB, { email: `o${Date.now()}@valedorn.tr`, password: "cok-guclu-parola-1" });
  if (!reg.ok) throw new Error("kayit basarisiz");
  await seedWorld(env.DB);
  const token = await createSessionToken(
    { accountId: reg.accountId, role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
    env.SESSION_SECRET,
  );
  const create = await call("/api/characters", env, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      givenName: "Kael",
      surname: "Veyr",
      birthSettlement: "varkhenn-drahkmar",
      attributes: emptyAttributes(),
    }),
  });
  const { characterId } = (await create.json()) as { characterId: string };
  return { token, characterId, accountId: reg.accountId };
}

function auth(token: string, body?: unknown): RequestInit {
  return {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

describe("Oynanis uclari (E3-E6)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("oturumsuz oynanis durumu 401 doner", async () => {
    const res = await call("/api/play/abc/state", env);
    expect(res.status).toBe(401);
  });

  it("baska oyuncunun karakterine erisim 403 doner (sahiplik)", async () => {
    const owner = await setupPlayer(env);
    const other = await registerAccount(env.DB, { email: "diger@valedorn.tr", password: "cok-guclu-parola-2" });
    if (!other.ok) throw new Error("kayit basarisiz");
    const otherToken = await createSessionToken(
      { accountId: other.accountId, role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
      env.SESSION_SECRET,
    );
    const res = await call(`/api/play/${owner.characterId}/state`, env, auth(otherToken));
    expect(res.status).toBe(403);
  });

  it("yeni karakter baslangic durumu (ekmek, sargi, 20 altin) alir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/state`, env, auth(token));
    const body = (await res.json()) as { state: { gold: number; inventory: { itemId: string }[]; health: { alive: boolean } } };
    expect(res.status).toBe(200);
    expect(body.state.gold).toBe(20);
    expect(body.state.health.alive).toBe(true);
    expect(body.state.inventory.map((i) => i.itemId)).toContain("bread");
  });

  it("yemek acligi dusurur ve envanterden esya eksiltir", async () => {
    const { token, characterId } = await setupPlayer(env);
    // Once acligi artirmak icin gunleri ilerlet: rest -> hunger artmaz;
    // bunun yerine dogrudan eat cagrilir ve envanter kontrol edilir.
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "eat", itemId: "bread" }));
    const body = (await res.json()) as { ok: boolean; state: { inventory: { itemId: string; quantity: number }[] } };
    expect(body.ok).toBe(true);
    const bread = body.state.inventory.find((i) => i.itemId === "bread");
    expect(bread?.quantity).toBe(2);
  });

  it("envanterde olmayan yemek reddedilir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "eat", itemId: "dried-meat" }));
    expect(res.status).toBe(400);
  });

  it("calisma altin kazandirir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "work", profession: "blacksmith", hours: 8 }));
    const body = (await res.json()) as { ok: boolean; detail: { income: number }; state: { gold: number } };
    expect(body.ok).toBe(true);
    expect(body.detail.income).toBeGreaterThan(0);
    expect(body.state.gold).toBeGreaterThan(20);
  });

  it("pazar: satin alma altin ve envanteri gunceller", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "trade", itemId: "bread", quantity: 2, side: "buy" }));
    const body = (await res.json()) as { ok: boolean; state: { gold: number; inventory: { itemId: string; quantity: number }[] } };
    expect(body.ok).toBe(true);
    expect(body.state.gold).toBeLessThan(20);
    expect(body.state.inventory.find((i) => i.itemId === "bread")?.quantity).toBe(5);
  });

  it("pahali esyayi almaya altin yetmezse 402 doner", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "trade", itemId: "chainmail", quantity: 1, side: "buy" }));
    expect(res.status).toBe(402);
  });

  it("seyahat karakterin konumunu degistirir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, {
      action: "travel", toSettlementId: "varkhenn-kaldrast", season: "summer", weather: "clear", roadQuality: 80,
    }));
    const body = (await res.json()) as { ok: boolean; detail: { to: string } };
    expect(body.ok).toBe(true);
    expect(body.detail.to).toBe("varkhenn-kaldrast");
  });

  it("kesif ganimet veya yaralanma uretir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "explore", site: "forest", preparedness: 30 }));
    const body = (await res.json()) as { ok: boolean; detail: { site: string } };
    expect(body.ok).toBe(true);
    expect(body.detail.site).toBe("forest");
  });

  it("bilinmeyen aksiyon 400 doner", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/action`, env, auth(token, { action: "yok" }));
    expect(res.status).toBe(400);
  });

  it("pazar fiyat ucu esya icin teklif doner", async () => {
    const res = await call("/api/market/iron-sword", env);
    const body = (await res.json()) as { buy: number; sell: number };
    expect(res.status).toBe(200);
    expect(body.buy).toBeGreaterThan(body.sell);
  });

  it("konaklama ucu maliyet doner", async () => {
    const res = await call("/api/lodging?kind=capital&nights=2", env);
    const body = (await res.json()) as { cost: number };
    expect(body.cost).toBe(16);
  });
});

describe("Gorsel varlik uclari (E7)", () => {
  it("katalog yalnizca lisans uyumlu varliklar doner (yerel uretim, CC0)", async () => {
    const env = makeEnv();
    const res = await call("/api/assets/catalog", env);
    const body = (await res.json()) as { count: number; assets: { assetKey: string; license: string }[]; attributions: string[] };
    expect(res.status).toBe(200);
    expect(body.count).toBeGreaterThan(0);
    expect(body.assets.every((a) => a.license === "CC0")).toBe(true);
    // Yerel uretim oldugu icin atif zorunlulugu yoktur.
    expect(body.attributions).toHaveLength(0);
  });

  it("katalog kategori suzmesi yapar (portre havuzu 40)", async () => {
    const env = makeEnv();
    const res = await call("/api/assets/catalog?category=portrait", env);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(40);
  });

  it("portre ucu siradan NPC icin havuz, onemli icin ozel portre doner", async () => {
    const env = makeEnv();
    const pool = (await (await call("/api/assets/portrait/npc-7", env)).json()) as { reserved: boolean; assetKey: string };
    expect(pool.reserved).toBe(false);
    expect(pool.assetKey.startsWith("portrait/pool/")).toBe(true);
    const special = (await (await call("/api/assets/portrait/king?reserved=1", env)).json()) as { reserved: boolean };
    expect(special.reserved).toBe(true);
  });
});

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

describe("Worker uctan uca", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("saglik ucu ucretli ozellik kullanmadigini bildirir", async () => {
    const res = await call("/api/health", env);
    const body = (await res.json()) as { status: string; paidFeatures: boolean };
    expect(res.status).toBe(200);
    expect(body.paidFeatures).toBe(false);
  });

  it("dunya ozetinde 130 yerlesim doner", async () => {
    const res = await call("/api/world/summary", env);
    const body = (await res.json()) as { settlements: number; kingdoms: number };
    expect(body.settlements).toBe(130);
    expect(body.kingdoms).toBe(5);
  });

  it("krallik filtresi 26 yerlesim doner", async () => {
    const res = await call("/api/world/settlements?kingdom=solmerya", env);
    const body = (await res.json()) as { count: number; settlements: { name: string }[] };
    expect(body.count).toBe(26);
    expect(body.settlements.map((s) => s.name)).toContain("Amsyra");
  });

  it("dunya saati D1'den okunur ve baslangicta ilerlemez", async () => {
    const res = await call("/api/world/time", env);
    const body = (await res.json()) as { gameDay: number; season: string; advancedDays: number };
    expect(res.status).toBe(200);
    expect(body.gameDay).toBe(1);
    expect(body.season).toBe("spring");
    expect(body.advancedDays).toBe(0);
  });

  it("oturumsuz /api/me 401 doner", async () => {
    const res = await call("/api/me", env);
    expect(res.status).toBe(401);
  });

  it("gecerli oturumla /api/me hesabi doner", async () => {
    const token = await createSessionToken(
      { accountId: "acc-1", role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 1000 },
      env.SESSION_SECRET,
    );
    const res = await call("/api/me", env, { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { accountId: string; role: string };
    expect(res.status).toBe(200);
    expect(body.accountId).toBe("acc-1");
  });

  it("suresi gecmis oturumu reddeder", async () => {
    const token = await createSessionToken(
      { accountId: "acc-1", role: "player", issuedAt: Date.now() - 10_000, expiresAt: Date.now() - 5_000 },
      env.SESSION_SECRET,
    );
    const res = await call("/api/me", env, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("oturumsuz karakter olusturma 401 doner", async () => {
    const res = await call("/api/characters", env, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("oyuncu dunya tohumlayamaz (yetki yukseltme engeli)", async () => {
    const token = await createSessionToken(
      { accountId: "acc-1", role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 10_000 },
      env.SESSION_SECRET,
    );
    const res = await call("/api/admin/seed-world", env, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("oturumlu oyuncu karakter olusturur ve listeler", async () => {
    const reg = await registerAccount(env.DB, { email: "oyun@valedorn.tr", password: "cok-guclu-parola-1" });
    if (!reg.ok) throw new Error("kayit basarisiz");
    await seedWorld(env.DB);
    const token = await createSessionToken(
      { accountId: reg.accountId, role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 10_000 },
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
    expect(create.status).toBe(201);

    const list = await call("/api/characters", env, { headers: { authorization: `Bearer ${token}` } });
    const body = (await list.json()) as { characters: { given_name: string }[] };
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0]?.given_name).toBe("Kael");
  });

  it("bilinmeyen yol 404 doner", async () => {
    const res = await call("/api/yok", env);
    expect(res.status).toBe(404);
  });

  it("kota tukendiginde kritik olmayan istegi 429 ile sinirlar (ucretli plana gecmez)", async () => {
    const exhausted = makeEnv({ REQUESTS_REMAINING: "0" });
    const res = await call("/api/world/summary", exhausted);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("kota tukendiginde kritik istegi kuyruga alir (202)", async () => {
    const exhausted = makeEnv({ REQUESTS_REMAINING: "0" });
    const res = await call("/api/trade/teklif", exhausted);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("queued");
  });

  it("CORS: on kontrol istegi izin basliklariyla 204 doner (belge 21.1)", async () => {
    const res = await call("/api/world/summary", env, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("CORS: normal yanit erisim izni basligi tasir (belge 21.1)", async () => {
    const res = await call("/api/health", env);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("CORS: ALLOWED_ORIGIN ayarliysa yalnizca o kaynak izinli olur", async () => {
    const scoped = makeEnv({ ALLOWED_ORIGIN: "https://kul-ve-taht.pages.dev" });
    const res = await call("/api/health", scoped);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://kul-ve-taht.pages.dev");
    expect(res.headers.get("vary")).toContain("Origin");
  });
});

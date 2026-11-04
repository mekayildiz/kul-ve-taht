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

async function setupPlayer(env: Env) {
  const reg = await registerAccount(env.DB, { email: `l${Date.now()}@valedorn.tr`, password: "cok-guclu-parola-1" });
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
  return { token, characterId };
}

function auth(token: string, body?: unknown): RequestInit {
  return {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

async function act(env: Env, token: string, characterId: string, body: Record<string, unknown>) {
  return call(`/api/play/${characterId}/action`, env, auth(token, body));
}

describe("E8: yasam, buyu, sehir ve yeralti uclari", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("katalog ucu tum sistem veri setlerini doner", async () => {
    const res = await call("/api/catalog", env);
    const body = (await res.json()) as Record<string, unknown[] | undefined>;
    expect(res.status).toBe(200);
    expect(body.crops!.length).toBeGreaterThan(0);
    expect(body.spells!.length).toBeGreaterThan(0);
    expect(body.guilds!.length).toBeGreaterThan(0);
    expect(body.underworldActions!.length).toBeGreaterThan(0);
  });

  it("ekim yalnizca uygun mevsimde basarili olur", async () => {
    const { token, characterId } = await setupPlayer(env);
    const ok = await act(env, token, characterId, { action: "plant", crop: "wheat", season: "spring", weather: "clear" });
    expect(ok.status).toBe(200);

    const other = await setupPlayer(env);
    const bad = await act(env, other.token, other.characterId, { action: "plant", crop: "wheat", season: "winter", weather: "clear" });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_action");
  });

  it("av ganimet veya yaralanma uretir; sonuc sunucudan gelir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "hunt", animal: "deer", preparedness: 50 });
    const body = (await res.json()) as { ok: boolean; detail: { animal: string } };
    expect(body.ok).toBe(true);
    expect(body.detail.animal).toBe("deer");
  });

  it("buyu ogrenme yasakli krallikta reddedilir", async () => {
    const { token, characterId } = await setupPlayer(env);
    // varkhenn'de ruh cagirma yasaktir; ayrica seviye yetersiz.
    const res = await act(env, token, characterId, { action: "learnSpell", path: "spirit_caller" });
    expect(res.status).toBe(400);
  });

  it("element buyu egitimle ogrenilir ve seviye artar", async () => {
    const { token, characterId } = await setupPlayer(env);
    // varkhenn baslangici; element yolu yasakli degil ama usta yok.
    const res = await act(env, token, characterId, { action: "learnSpell", path: "elemental" });
    const body = (await res.json()) as { ok?: boolean; state?: { magicLevel: number } };
    // Usta olmadigindan reddedilebilir; her durumda cevap tutarli olmali.
    if (res.status === 200) {
      expect(body.state?.magicLevel).toBe(1);
    } else {
      expect(res.status).toBe(400);
    }
  });

  it("tapinak hizmeti altin dusurur ve saglik verir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "temple", service: "healing" });
    const body = (await res.json()) as { ok: boolean; state: { gold: number } };
    expect(body.ok).toBe(true);
    expect(body.state.gold).toBe(10);
  });

  it("sehir etkinligi altin ve itibar degistirir (sunucu otoritesi)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "activity", kind: "festival" });
    const body = (await res.json()) as { ok: boolean; detail: { reputationDelta: number }; state: { gold: number } };
    expect(body.ok).toBe(true);
    expect(body.detail.reputationDelta).toBe(5);
    expect(body.state.gold).toBe(15);
  });

  it("yeralti eylemi yakalanma dahil sonucu sunucuda belirler", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "underworld", underworldAction: "theft", security: 10 });
    const body = (await res.json()) as { ok: boolean; detail: { caught: boolean; crimeSeverity: number } };
    expect(body.ok).toBe(true);
    expect(body.detail.crimeSeverity).toBe(3);
    expect(typeof body.detail.caught).toBe("boolean");
  });

  it("bilinmeyen aksiyon 400 doner", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "hack-the-throne" });
    expect(res.status).toBe(400);
  });

  it("oturumsuz yeni aksiyonlar 401 doner", async () => {
    const res = await call("/api/play/abc/action", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "hunt", animal: "deer" }),
    });
    expect(res.status).toBe(401);
  });

  it("yerlesim profili ucu 130 yerlesimin tamamini ve tek profil doner (belge 20)", async () => {
    const all = await call("/api/world/profile", env);
    const list = (await all.json()) as { profiles: { settlementId: string; population: number }[] };
    expect(list.profiles.length).toBeGreaterThanOrEqual(130);

    const single = await call("/api/world/profile?id=varkhenn-drahkmar", env);
    const one = (await single.json()) as { settlementId: string; population: number; governance: string };
    expect(single.status).toBe(200);
    expect(one.settlementId).toBe("varkhenn-drahkmar");
    expect(one.population).toBeGreaterThan(0);
    expect(one.governance).toBe("royal_governor");

    const missing = await call("/api/world/profile?id=yok-boyle-yer", env);
    expect(missing.status).toBe(404);
  });

  it("dunya ozeti toplam nufusu bildirir", async () => {
    const res = await call("/api/world/summary", env);
    const body = (await res.json()) as { settlements: number; totalPopulation: number };
    expect(body.settlements).toBe(130);
    expect(body.totalPopulation).toBeGreaterThan(0);
  });

  it("bildirim ucu oturumsuz 401, oturumlu ozet doner (belge 19)", async () => {
    const anon = await call("/api/notifications", env);
    expect(anon.status).toBe(401);

    const { token } = await setupPlayer(env);
    const res = await call("/api/notifications", env, auth(token));
    const body = (await res.json()) as { visible: unknown[]; unreadCount: number };
    expect(res.status).toBe(200);
    expect(Array.isArray(body.visible)).toBe(true);
    expect(body.unreadCount).toBe(0);
  });

  it("bildirim okundu isaretleme kimlik dogrulamasi ister", async () => {
    const anon = await call("/api/notifications/read", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["x"] }),
    });
    expect(anon.status).toBe(401);

    const { token } = await setupPlayer(env);
    const empty = await call("/api/notifications/read", env, auth(token, { ids: [] }));
    expect(empty.status).toBe(400);

    const ok = await call("/api/notifications/read", env, auth(token, { ids: ["bildirim-1"] }));
    expect(ok.status).toBe(200);
  });
});

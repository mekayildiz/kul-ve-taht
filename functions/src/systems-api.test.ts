/* eslint-disable @typescript-eslint/no-explicit-any -- test govdesi gevsek tipli JSON okur. */
import { describe, expect, it, beforeEach } from "vitest";
import worker, { type Env } from "./index";
import { createTestDb } from "./test-support/sqlite-harness";
import { createSessionToken } from "./auth/session";
import { registerAccount } from "./auth/service";
import { seedWorld } from "./world/seed";
import { emptyAttributes } from "./character/attributes";

/**
 * Belge 20 kapsam testi: askeri, ekonomi, adalet, dovus, sosyal ve siyasi
 * sistemler arayuz + veritabani + sunucu dogrulamasi ile bagli olmalidir.
 * Bu dosya her sistemin API uzerinden gercekten CALISTIGINI dogrular.
 */

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: createTestDb(), SESSION_SECRET: "test-secret-degistir", ...overrides };
}

async function call(path: string, env: Env, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`https://kulvetah.local${path}`, init);
  return worker.fetch(request, env, {} as ExecutionContext);
}

async function setupPlayer(env: Env) {
  const reg = await registerAccount(env.DB, { email: `s${Date.now()}${Math.random()}@valedorn.tr`, password: "cok-guclu-parola-1" });
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
  const { characterId } = (await readBody(create)) as { characterId: string };
  return { token, characterId, accountId: reg.accountId };
}

/** Yanit govdesini tipli okur (test kolayligi). */
async function readBody(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>;
}

function auth(token: string, body?: unknown): RequestInit {
  return {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

async function act(env: Env, token: string, characterId: string, body: Record<string, unknown>): Promise<Response> {
  return call(`/api/play/${characterId}/action`, env, auth(token, body));
}

/** Karaktere test icin altin verir (aksiyon maliyetlerini karsilamak icin). */
async function grantGold(env: Env, characterId: string, gold: number): Promise<void> {
  // character_state ilk oynanis okumasinda olusur; satirin var oldugundan emin ol.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO character_state (character_id, health_json, inventory_json, gold, updated_at) VALUES (?,?,?,0,?)",
  )
    .bind(characterId, JSON.stringify({ health: 100, hunger: 0, fatigue: 0, injuries: [], diseases: [], alive: true, permanentConditions: [] }), JSON.stringify([]), Date.now())
    .run();
  await env.DB.prepare("UPDATE character_state SET gold = gold + ? WHERE character_id = ?").bind(gold, characterId).run();
}

describe("Belge 20 sistem baglantisi (askeri/ekonomi/adalet/dovus/sosyal/siyaset)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("askeri birlik toplanir, ikmal yapilir ve savas cozulur", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 5000);

    const recruit = await act(env, token, characterId, { action: "recruit", unitType: "infantry", strength: 20 });
    expect(recruit.status).toBe(200);
    expect((await readBody(recruit)).detail).toMatchObject({ unitType: "infantry", troops: 20 });

    const resupply = await act(env, token, characterId, { action: "resupply" });
    expect(resupply.status).toBe(200);
    expect((await readBody(resupply)).detail.resupplied).toBe(1);

    const battle = await act(env, token, characterId, { action: "battle", terrain: "open" });
    expect(battle.status).toBe(200);
    const battleBody = await readBody(battle);
    expect(["attacker", "defender", "draw"]).toContain(battleBody.detail.outcome.winner);
    expect(battleBody.state.gold).toBeGreaterThanOrEqual(0);
  });

  it("birlik olmadan savas reddedilir (sunucu dogrulamasi)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "battle" });
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.code).toBe("invalid_action");
  });

  it("kusatma cozulur ve savas kaydi olusur", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 5000);
    await act(env, token, characterId, { action: "recruit", unitType: "siege", strength: 30 });
    const res = await act(env, token, characterId, { action: "siege", siegeEngines: 20 });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail).toHaveProperty("breached");
    expect(body.detail).toHaveProperty("daysElapsed");
  });

  it("gemi insa edilir ve deniz savasi cozulur", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 5000);
    const build = await act(env, token, characterId, { action: "buildShip", shipClass: "galley" });
    expect(build.status).toBe(200);

    const naval = await act(env, token, characterId, { action: "navalBattle" });
    expect(naval.status).toBe(200);
    const body = await readBody(naval);
    expect(body.detail.outcome).toHaveProperty("winner");
  });

  it("kredi alinir, borc kaydedilir ve geri odenir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const take = await act(env, token, characterId, { action: "takeLoan", amount: 200 });
    expect(take.status).toBe(200);
    const taken = await readBody(take);
    expect(taken.state.debts).toBe(200);

    await grantGold(env, characterId, 1000);
    const repay = await act(env, token, characterId, { action: "repayLoan" });
    expect(repay.status).toBe(200);
    expect((await readBody(repay)).state.debts).toBe(0);

    const again = await act(env, token, characterId, { action: "repayLoan" });
    expect(again.status).toBe(400);
  });

  it("mulkiyet alinir, isletme geliri ve vergi islenir", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 5000);
    const buy = await act(env, token, characterId, { action: "buyProperty", propertyType: "business" });
    expect(buy.status).toBe(200);

    const run = await act(env, token, characterId, { action: "runBusiness" });
    expect(run.status).toBe(200);
    expect((await readBody(run)).detail.businesses).toBe(1);

    const tax = await act(env, token, characterId, { action: "payTaxes" });
    expect(tax.status).toBe(200);
    expect((await readBody(tax)).detail.due).toBeGreaterThan(0);
  });

  it("mulk olmadan vergi reddedilir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "payTaxes" });
    expect(res.status).toBe(400);
  });

  it("suc islenir; yakalanma halinde ceza uygulanir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "crime", crimeType: "assassination", evidence: 95 });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail.crimeType).toBe("assassination");
    expect(body.detail).toHaveProperty("arrested");
    // Yuksek delil + baskin kurban -> yuksek yakalanma olasiligi (istatistiksel).
    expect(body.detail.chance).toBeGreaterThan(0);
  });

  it("hapis durumu state ucunda gorunur ve kacis denenir", async () => {
    const { token, characterId } = await setupPlayer(env);
    // Hapipli senaryo icin dogrudan kayit olustur.
    await env.DB.prepare(
      "INSERT INTO character_prison (character_id, settlement_id, days_remaining, escape_attempts, updated_at) VALUES (?,?,?,0,?)",
    )
      .bind(characterId, "varkhenn-drahkmar", 5, Date.now())
      .run();

    const state = await call(`/api/play/${characterId}/state`, env, auth(token));
    const body = await readBody(state);
    expect(body.prison).toMatchObject({ daysRemaining: 5 });

    const escape = await act(env, token, characterId, { action: "escape", bribe: 0 });
    expect(escape.status).toBe(200);
    expect((await readBody(escape)).detail).toHaveProperty("escaped");
  });

  it("hapis yokken kacis reddedilir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "escape" });
    expect(res.status).toBe(400);
  });

  it("dovus cozulur ve sonuc raporlanir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "fight", opponentStrength: 5 });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(["attacker", "defender", "draw"]).toContain(body.detail.winner);
    expect(body.detail.rounds).toBeGreaterThan(0);
  });

  it("guvenli sehirde duello riza olmadan reddedilir (belge 16.5)", async () => {
    const { token, characterId } = await setupPlayer(env);
    // Baslangic yerlesimi baskin (guvenli sehir).
    const denied = await act(env, token, characterId, { action: "duel", consented: false });
    expect(denied.status).toBe(400);
    expect((await readBody(denied)).error.reason).toBe("consent_required");

    const allowed = await act(env, token, characterId, { action: "duel", consented: true, opponentStrength: 4 });
    expect(allowed.status).toBe(200);
  });

  it("sosyal iliski kurulur ve state ucunda listelenir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "setRelationship", targetId: "npc-1", kind: "friend" });
    expect(res.status).toBe(200);

    const state = await call(`/api/play/${characterId}/state`, env, auth(token));
    const body = await readBody(state);
    expect(body.social).toEqual([{ targetId: "npc-1", kind: "friend" }]);
  });

  it("kendisiyle iliski kurulamaz", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "setRelationship", targetId: characterId, kind: "friend" });
    expect(res.status).toBe(400);
  });

  it("siyasi makam alinir ve rutbe hesaplanir", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "seekOffice", title: "Vergi Memuru" });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail.title).toBe("Vergi Memuru");
    expect(["recruit", "soldier", "sergeant", "captain"]).toContain(body.detail.rank);

    const state = await call(`/api/play/${characterId}/state`, env, auth(token));
    expect((await readBody(state)).office).toMatchObject({ title: "Vergi Memuru" });
  });

  it("diplomasi eylemi durusu degistirir ve altin dogrulanir", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 500);
    const gift = await act(env, token, characterId, { action: "diplomacy", kingdomId: "varkhenn", diplomacyAction: "gift" });
    expect(gift.status).toBe(200);
    expect((await readBody(gift)).detail.stance).toBe("ally");

    const bad = await act(env, token, characterId, { action: "diplomacy", kingdomId: "yok", diplomacyAction: "gift" });
    expect(bad.status).toBe(400);
  });

  it("state ucu tum yeni sistem durumlarini doner", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await call(`/api/play/${characterId}/state`, env, auth(token));
    const body = await readBody(res);
    expect(body).toHaveProperty("units");
    expect(body).toHaveProperty("ships");
    expect(body).toHaveProperty("properties");
    expect(body).toHaveProperty("loan");
    expect(body).toHaveProperty("prison");
    expect(body).toHaveProperty("social");
    expect(body).toHaveProperty("office");
    expect(Array.isArray(body.diplomacy)).toBe(true);
    expect(body.diplomacy.length).toBeGreaterThan(0);
  });

  it("yeni aksiyonlar oturumsuz 401 doner", async () => {
    for (const action of ["recruit", "battle", "takeLoan", "crime", "fight", "seekOffice"]) {
      const res = await call("/api/play/abc/action", env, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      expect(res.status).toBe(401);
    }
  });

  it("baska oyuncunun karakterinde yeni aksiyonlar 403 doner", async () => {
    const owner = await setupPlayer(env);
    const other = await registerAccount(env.DB, { email: "baska@valedorn.tr", password: "cok-guclu-parola-3" });
    if (!other.ok) throw new Error("kayit basarisiz");
    const otherToken = await createSessionToken(
      { accountId: other.accountId, role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
      env.SESSION_SECRET,
    );
    const res = await act(env, otherToken, owner.characterId, { action: "recruit", unitType: "infantry", strength: 5 });
    expect(res.status).toBe(403);
  });
});

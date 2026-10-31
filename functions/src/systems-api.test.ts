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

  it("sohbet mesaji gonderir ve gecmiste gorunur (belge 16.2)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const send = await act(env, token, characterId, { action: "sendMessage", channel: "global", body: "Valedorn'a selam" });
    expect(send.status).toBe(200);

    const history = await call("/api/chat?channel=global", env, auth(token));
    expect(history.status).toBe(200);
    const body = await readBody(history);
    expect(body.channel).toBe("global");
    expect(body.messages.some((m: any) => m.body === "Valedorn'a selam")).toBe(true);
  });

  it("bos veya cok uzun sohbet mesajini reddeder (belge 16.2)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const empty = await act(env, token, characterId, { action: "sendMessage", channel: "global", body: "   " });
    expect(empty.status).toBe(400);
    expect((await readBody(empty)).error.reason).toBe("empty");

    const long = await act(env, token, characterId, { action: "sendMessage", channel: "global", body: "a".repeat(501) });
    expect(long.status).toBe(400);
    expect((await readBody(long)).error.reason).toBe("too_long");
  });

  it("yerel kanala o yerlesimde olmayan karakter yazamaz (belge 16.2)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "sendMessage", channel: "local", scopeId: "caelvar-theron", body: "izinsiz" });
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.reason).toBe("no_access");
  });

  it("sohbet ucu oturumsuz 401 doner (belge 16.2)", async () => {
    const res = await call("/api/chat?channel=global", env);
    expect(res.status).toBe(401);
  });

  it("evlilik yas ve tek es kuralina uyar, durum ucunda gorunur (belge 7.1)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const marry = await act(env, token, characterId, { action: "marry", spouseName: "Elara Veyr", consented: true });
    expect(marry.status).toBe(200);
    expect((await readBody(marry)).detail.spouseName).toBe("Elara Veyr");

    const again = await act(env, token, characterId, { action: "marry", spouseName: "Baska Kisi", consented: true });
    expect(again.status).toBe(400);
    expect((await readBody(again)).error.reason).toBe("already_married");

    const state = await call(`/api/play/${characterId}/state`, env, auth(token));
    const body = await readBody(state);
    expect(body.family?.spouseName).toBe("Elara Veyr");
  });

  it("es olmadan cocuk sahibi olunamaz (belge 7.2)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "haveChild" });
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.reason).toBe("no_spouse");
  });

  it("evlilik sonrasi cocuk sayisi artar (belge 7.2)", async () => {
    const { token, characterId } = await setupPlayer(env);
    await act(env, token, characterId, { action: "marry", spouseName: "Elara Veyr", consented: true });
    const child = await act(env, token, characterId, { action: "haveChild" });
    expect(child.status).toBe(200);
    expect((await readBody(child)).detail.children).toBe(1);
  });

  it("evlilik hesaba bildirim yazar (belge 19)", async () => {
    const { token, characterId } = await setupPlayer(env);
    await act(env, token, characterId, { action: "marry", spouseName: "Elara Veyr", consented: true });
    const digest = await call("/api/notifications", env, auth(token));
    expect(digest.status).toBe(200);
    const body = await readBody(digest);
    const shown = JSON.stringify(body);
    expect(shown).toContain("evlendiniz");
  });

  it("makam atamasi offices tablosuna yazilir ve tek sahipli olur (belge 10.4)", async () => {
    const owner = await setupPlayer(env);
    const first = await act(env, owner.token, owner.characterId, { action: "seekOffice", title: "Vergi Memuru" });
    expect(first.status).toBe(200);
    expect((await readBody(first)).detail.rank).toBe("recruit");

    const stored = await env.DB.prepare("SELECT holder_id FROM offices WHERE title = 'Vergi Memuru'")
      .bind()
      .first<{ holder_id: string }>();
    expect(stored?.holder_id).toBe(owner.characterId);

    // Ikinci oyuncu mevcut sahibi gecmeden ayni makami alamaz (belge 10.4).
    const other = await setupPlayer(env);
    const denied = await act(env, other.token, other.characterId, { action: "seekOffice", title: "Vergi Memuru" });
    expect(denied.status).toBe(400);
    expect((await readBody(denied)).error.reason).toBe("office_held");
  });

  it("hizmet puani arttikca rutbe yukselir (belge 10.3)", async () => {
    const { token, characterId } = await setupPlayer(env);
    // Durum satiri ilk oynanista olusur; once olustur, sonra itibar ver.
    await grantGold(env, characterId, 0);
    await env.DB.prepare("UPDATE character_state SET reputation = 70 WHERE character_id = ?").bind(characterId).run();
    const res = await act(env, token, characterId, { action: "seekOffice", title: "Kaptan" });
    expect(res.status).toBe(200);
    const detail = (await readBody(res)).detail;
    expect(["soldier", "sergeant", "captain"]).toContain(detail.rank);
    expect(detail.servicePoints).toBeGreaterThanOrEqual(70);
  });
});

/**
 * Belge 12.4 / 9.3 kapsami: gorevler ve acik artirma sunucu otoriteli,
 * kalici ve arayuzden erisilebilir olmalidir.
 */
describe("Gorev ve acik artirma sistemleri (belge 12.4, 9.3)", () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it("gorev katalogu doner ve gorev baslatilir (belge 12.4)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const catalog = await call("/api/quests", env, auth(token));
    expect(catalog.status).toBe(200);
    const body = await readBody(catalog);
    expect(body.catalog.length).toBeGreaterThan(0);
    expect(body.catalog[0].id).toBe("main-ashes-1");

    const started = await act(env, token, characterId, { action: "startQuest", questId: "main-ashes-1" });
    expect(started.status).toBe(200);

    const log = await readBody(await call(`/api/quests?characterId=${characterId}`, env, auth(token)));
    expect(log.log).toHaveLength(1);
    expect(log.log[0].status).toBe("active");
  });

  it("gorev ilerlemesi gercek eylemle artar ve odul alinir (belge 12.4)", async () => {
    const { token, characterId } = await setupPlayer(env);
    await act(env, token, characterId, { action: "startQuest", questId: "side-explore-1" });
    // side-explore-1: harabe kesfi gerekir.
    await act(env, token, characterId, { action: "explore", site: "ruin", preparedness: 50 });

    const log = await readBody(await call(`/api/quests?characterId=${characterId}`, env, auth(token)));
    const quest = log.log.find((q: any) => q.questId === "side-explore-1");
    expect(quest.objectives[0].progress).toBeGreaterThanOrEqual(1);

    const before = await env.DB.prepare("SELECT gold FROM character_state WHERE character_id = ?").bind(characterId).first<{ gold: number }>();
    const claim = await act(env, token, characterId, { action: "claimQuest", questId: "side-explore-1" });
    expect(claim.status).toBe(200);
    const after = await env.DB.prepare("SELECT gold FROM character_state WHERE character_id = ?").bind(characterId).first<{ gold: number }>();
    expect(after!.gold).toBeGreaterThan(before!.gold);
  });

  it("tamamlanmamis gorevin odulu verilmez (belge 12.4)", async () => {
    const { token, characterId } = await setupPlayer(env);
    await act(env, token, characterId, { action: "startQuest", questId: "main-ashes-1" });
    const claim = await act(env, token, characterId, { action: "claimQuest", questId: "main-ashes-1" });
    expect(claim.status).toBe(400);
    expect((await readBody(claim)).error.reason).toBe("objectives_incomplete");
  });

  it("acik artirma acilir, teklif alinir ve kapaninca esya el degistirir (belge 9.3)", async () => {
    const seller = await setupPlayer(env);
    await grantGold(env, seller.characterId, 200);
    // Satici bir esya alir ve artirmaya koyar.
    await act(env, seller.token, seller.characterId, { action: "trade", itemId: "bread", quantity: 5, side: "buy" });
    const created = await act(env, seller.token, seller.characterId, {
      action: "createAuction",
      itemId: "bread",
      quantity: 3,
      reservePrice: 5,
    });
    expect(created.status).toBe(200);
    const auctionId = (await readBody(created)).detail.auctionId as string;

    const list = await readBody(await call("/api/auctions", env, auth(seller.token)));
    expect(list.auctions.some((a: any) => a.id === auctionId)).toBe(true);

    const buyer = await setupPlayer(env);
    await grantGold(env, buyer.characterId, 100);
    const bid = await act(env, buyer.token, buyer.characterId, { action: "bidAuction", auctionId, amount: 12 });
    expect(bid.status).toBe(200);

    // Artirma suresini gecir ve coz.
    await env.DB.prepare("UPDATE auctions SET closes_day = 0 WHERE id = ?").bind(auctionId).run();
    const { settleDueAuctions } = await import("./play/auctions");
    const settled = await settleDueAuctions(env.DB);
    expect(settled).toBeGreaterThan(0);

    const winnerInv = await env.DB.prepare("SELECT inventory_json FROM character_state WHERE character_id = ?")
      .bind(buyer.characterId)
      .first<{ inventory_json: string }>();
    expect(winnerInv!.inventory_json).toContain("bread");
  });

  it("rezerv altindaki teklif reddedilir (belge 9.3)", async () => {
    const seller = await setupPlayer(env);
    await grantGold(env, seller.characterId, 200);
    await act(env, seller.token, seller.characterId, { action: "trade", itemId: "bread", quantity: 5, side: "buy" });
    const created = await act(env, seller.token, seller.characterId, {
      action: "createAuction",
      itemId: "bread",
      quantity: 2,
      reservePrice: 50,
    });
    const auctionId = (await readBody(created)).detail.auctionId as string;

    const buyer = await setupPlayer(env);
    await grantGold(env, buyer.characterId, 100);
    const bid = await act(env, buyer.token, buyer.characterId, { action: "bidAuction", auctionId, amount: 10 });
    expect(bid.status).toBe(400);
    expect((await readBody(bid)).error.reason).toBe("below_reserve");
  });

  it("pazar fiyati bozulma carpaniyla yukselir (belge 9.2, 9.4)", async () => {
    await setupPlayer(env);
    const base = await readBody(await call("/api/market/bread", env));
    await env.DB.prepare(
      "INSERT INTO market_state (settlement_id, item_id, supply, demand, updated_day) VALUES ('varkhenn-drahkmar','*',25,100,1)",
    ).run();
    const disrupted = await readBody(await call("/api/market/bread?settlementId=varkhenn-drahkmar", env));
    expect(disrupted.buy).toBeGreaterThan(base.buy);
    expect(disrupted.disruption).toBeGreaterThan(1);
  });

  it("depolama kapasitesi ve bozulma durumu durumda doner (belge 9.3)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const state = await readBody(await call(`/api/play/${characterId}/state`, env, auth(token)));
    expect(state.storage).toMatchObject({ capacity: expect.any(Number), used: expect.any(Number) });
    expect(state.storage.capacity).toBeGreaterThan(0);
  });

  it("depo dolunca alim reddedilir (belge 9.3)", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 100000);
    // Kapasiteyi asiri stokla doldur.
    await env.DB.prepare("UPDATE character_state SET inventory_json = ? WHERE character_id = ?")
      .bind(JSON.stringify([{ itemId: "bread", quantity: 5000, condition: 1 }]), characterId)
      .run();
    const res = await act(env, token, characterId, { action: "trade", itemId: "bread", quantity: 1, side: "buy" });
    expect(res.status).toBe(400);
    expect((await readBody(res)).error.reason).toBe("storage_full");
  });

  it("pazar tekel carpani pay ile artar (belge 9.4)", async () => {
    await setupPlayer(env);
    // Bir yerlesime toplam arzin cogunu yig: pay esigi asilir.
    await env.DB.prepare(
      "INSERT INTO market_state (settlement_id, item_id, supply, demand, updated_day) VALUES ('varkhenn-drahkmar','bread',300,100,1)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO market_state (settlement_id, item_id, supply, demand, updated_day) VALUES ('aurelith-velmora','bread',20,100,1)",
    ).run();
    const quote = await readBody(await call("/api/market/bread?settlementId=varkhenn-drahkmar", env));
    expect(quote.monopoly).toBeGreaterThan(1);
  });

  it("krallik butcesi islenir ve yonetici ucu korumali (belge 9.7-9.9)", async () => {
    const { token } = await setupPlayer(env);
    // Yonetici olmayan oyuncu butce isletemez.
    const denied = await call("/api/admin/budget/run", env, auth(token, { kingdomId: "varkhenn" }));
    expect(denied.status).toBe(403);

    const adminToken = await createSessionToken(
      { accountId: "admin-1", role: "admin", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
      env.SESSION_SECRET,
    );
    const run = await call("/api/admin/budget/run", env, auth(adminToken, { kingdomId: "varkhenn" }));
    expect(run.status).toBe(200);
    expect((await readBody(run)).treasury).toBeGreaterThanOrEqual(0);
  });

  it("olum mirasi varislere aktarir ve mulku devreder (belge 7.6)", async () => {
    const { token, characterId, accountId } = await setupPlayer(env);
    const { settleDeath } = await import("./play/succession");
    // Aile kur: ayni haneye bir yetiskin varis ekle.
    const familyId = "fam-1";
    await env.DB.prepare("INSERT INTO families (id, name, crest, founded_at) VALUES (?,?,?,?)")
      .bind(familyId, "Veyr Hanesi", null, 1)
      .run();
    const heirId = "heir-1";
    await env.DB.prepare(
      `INSERT INTO characters (id, account_id, given_name, surname, gender, birth_settlement, age_years, alive, generation, current_settlement, created_at)
       VALUES (?,?,?,?,?,?,?,1,1,?,?)`,
    )
      .bind(heirId, accountId, "Mira", "Veyr", "female", "varkhenn-drahkmar", 25, "varkhenn-drahkmar", Date.now())
      .run();
    await env.DB.prepare("INSERT INTO family_members (family_id, character_id, relation, since) VALUES (?,?,?,?)")
      .bind(familyId, characterId, "head", 1)
      .run();
    await env.DB.prepare("INSERT INTO family_members (family_id, character_id, relation, since) VALUES (?,?,?,?)")
      .bind(familyId, heirId, "child", 1)
      .run();
    await grantGold(env, heirId, 0);
    await env.DB.prepare(
      "INSERT INTO character_properties (id, character_id, settlement_id, property_type, value, tax_rate, updated_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind("prop-1", characterId, "varkhenn-drahkmar", "house", 500, 0.02, Date.now())
      .run();

    const result = await settleDeath(env.DB, characterId, "test olum", 5);
    expect(result).not.toBeNull();
    expect(result!.heirCharacterId).toBe(heirId);

    const owner = await env.DB.prepare("SELECT character_id FROM character_properties WHERE id = 'prop-1'")
      .first<{ character_id: string }>();
    expect(owner!.character_id).toBe(heirId);
    const dead = await env.DB.prepare("SELECT alive FROM characters WHERE id = ?").bind(characterId).first<{ alive: number }>();
    expect(dead!.alive).toBe(0);
    // Idempotent: ikinci cagri islem yapmaz.
    expect(await settleDeath(env.DB, characterId, "tekrar", 6)).toBeNull();
    expect(token).toBeTruthy();
  });
});

describe("Oyuncu gruplari ve lonca uyeligi (belge 16.2, 16.4)", () => {
  const env = makeEnv();

  it("grup kurma kurucuya grup ve liderlik verir (belge 16.4)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const res = await act(env, token, characterId, { action: "createGroup", name: "Kuzey Birligi" });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.detail.groupId).toBeTruthy();

    const stateRes = await call(`/api/play/${characterId}/state`, env, auth(token));
    const state = await readBody(stateRes);
    expect(state.group.name).toBe("Kuzey Birligi");
    expect(state.group.leaderCharacterId).toBe(characterId);
    expect(state.group.members).toContain(characterId);
  });

  it("ikinci grup kurulamaz; kisa isim reddedilir (belge 16.4)", async () => {
    const { token, characterId } = await setupPlayer(env);
    const short = await act(env, token, characterId, { action: "createGroup", name: "A" });
    expect(short.status).toBe(400);
    await act(env, token, characterId, { action: "createGroup", name: "Gecerli Grup" });
    const again = await act(env, token, characterId, { action: "createGroup", name: "Ikinci Grup" });
    expect(again.status).toBe(400);
  });

  it("gruba katilma uye ekler ve grup sohbetine erisim verir (belge 16.2)", async () => {
    const a = await setupPlayer(env);
    const created = await readBody(await act(env, a.token, a.characterId, { action: "createGroup", name: "Avci Birligi" }));
    const groupId = created.detail.groupId as string;

    const b = await setupPlayer(env);
    // Uye olmadan grup kanalina yazamaz.
    const before = await act(env, b.token, b.characterId, { action: "sendMessage", channel: "group", scopeId: groupId, body: "merhaba" });
    expect(before.status).toBe(400);
    // Katildiktan sonra yazabilir.
    const joined = await act(env, b.token, b.characterId, { action: "joinGroup", groupId });
    expect(joined.status).toBe(200);
    const after = await act(env, b.token, b.characterId, { action: "sendMessage", channel: "group", scopeId: groupId, body: "merhaba" });
    expect(after.status).toBe(200);
  });

  it("loncaya katilma lonca sohbet kanalini acar (belge 16.2)", async () => {
    const { token, characterId } = await setupPlayer(env);
    await grantGold(env, characterId, 500);
    // Lonca uzmanlik esigi ister (belge 13.3); test icin dogrudan verilir.
    await env.DB.prepare(
      "INSERT INTO character_state (character_id, health_json, inventory_json, gold, weapon_mastery, updated_at) VALUES (?,?,?,0,20,?) ON CONFLICT(character_id) DO UPDATE SET weapon_mastery = 20",
    )
      .bind(characterId, JSON.stringify({ health: 100, hunger: 0, fatigue: 0, injuries: [], diseases: [], alive: true, permanentConditions: [] }), JSON.stringify([]), Date.now())
      .run();
    // Lonca sohbeti uyelik oncesi kapali.
    const before = await act(env, token, characterId, { action: "sendMessage", channel: "guild", body: "selam" });
    expect(before.status).toBe(400);
    const join = await act(env, token, characterId, { action: "joinGuild", guildId: "smiths" });
    expect(join.status).toBe(200);
    const membership = await env.DB.prepare("SELECT guild_id FROM character_guilds WHERE character_id = ?")
      .bind(characterId)
      .first<{ guild_id: string }>();
    expect(membership?.guild_id).toBe("smiths");
    const after = await act(env, token, characterId, { action: "sendMessage", channel: "guild", body: "selam" });
    expect(after.status).toBe(200);
  });
});

describe("Karakter gorunumu kisilestirme (belge 20, 17.2)", () => {
  const env = makeEnv();

  it("gorunum degisikligini sunucuda dogrular ve kalici kaydeder", async () => {
    const { token, characterId } = await setupPlayer(env);
    const ok = await act(env, token, characterId, { action: "setAppearance", appearance: { faceShape: "oval", hairStyle: "orgu", outfit: "tacir", heightCm: 175 } });
    expect(ok.status).toBe(200);
    const state = await readBody(await call(`/api/play/${characterId}/state`, env, auth(token)));
    expect(state.appearance.faceShape).toBe("oval");
    expect(state.appearance.hairStyle).toBe("orgu");
    expect(state.appearance.heightCm).toBe(175);

    // Gecersiz secim reddedilir ve kayit degismez.
    const bad = await act(env, token, characterId, { action: "setAppearance", appearance: { faceShape: "ucgen" } });
    expect(bad.status).toBe(400);
    const after = await readBody(await call(`/api/play/${characterId}/state`, env, auth(token)));
    expect(after.appearance.faceShape).toBe("oval");
  });

  it("katalog gorunum seceneklerini doner (belge 20)", async () => {
    const catalog = await readBody(await call("/api/catalog", env));
    expect(catalog.appearance.faceShapes.length).toBeGreaterThan(0);
    expect(catalog.appearance.outfits).toContain("yolcu");
  });
});

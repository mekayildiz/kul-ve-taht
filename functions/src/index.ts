/**
 * Kul ve Taht - Workers giris noktasi.
 *
 * Kimlik dogrulama, yetkilendirme, kota korumasi, dunya verisi ve yedekleme
 * modullerini birbirine baglar. YALNIZCA Workers Free plan ozellikleri.
 * Hicbir ucretli plan ozelligi kullanilmaz (bkz. ADR-010).
 */

import { Router, type RouteContext } from "./http/router";
import { json, error } from "./http/response";
import { allowedOrigin, withCors, preflightResponse } from "./http/cors";
import { decideQuota, quotaResponse, type QuotaState } from "./quota/guard";
import { verifySessionToken } from "./auth/session";
import { authorize } from "./auth/authorize";
import { worldSummary, SETTLEMENTS, KINGDOMS, FREE_CITIES, NEUTRAL_ZONES, allSettlementProfiles, settlementProfile } from "./world";
import { advanceWorldTime, seasonFor } from "./time/world-clock";
import { queryOne, queryAll, execute, type SqlDatabase } from "./db/client";
import { registerAccount, loginAccount } from "./auth/service";
import { createCharacter, type CreateCharacterInput } from "./character/service";
import { seedWorld } from "./world/seed";
import { runWorldSimulation } from "./play/world-sim";
import { recordUsage, quotaReport } from "./quota/usage";
import { birthplacePanel, allBirthplacePanels, mapData } from "./world/birthplace";
import {
  getPlayState,
  advanceAllCharacters,
  performEat,
  performRest,
  performCraft,
  performWork,
  performTravel,
  performExplore,
  performTrade,
  performTreat,
  performTreatDisease,
  performPlant,
  performHarvest,
  performHunt,
  performTame,
  performLearnSpell,
  performCastSpell,
  performTempleService,
  performJoinGuild,
  performActivity,
  performUnderworldAct,
  marketQuote,
  lodgingQuote,
  type PlayResult,
} from "./play/service";
import { quoteMarket } from "./play/market-state";
import { storageSummary, monopolyFactor, runKingdomBudget, interveneMarket, auditKingdomCorruption } from "./play/storage";
import { startQuest, claimQuestReward, questLog, advanceQuestByTag, QUEST_CATALOG } from "./play/quests";
import { createAuction, bidAuction, listAuctions, settleDueAuctions } from "./play/auctions";
import { ITEMS } from "./inventory/items";
import {
  listUnits,
  performRecruit,
  performResupply,
  performBattle,
  performSiege,
  listShips,
  performBuildShip,
  performNavalBattle,
  performTakeLoan,
  performRepayLoan,
  loanSummary,
  listProperties,
  performBuyProperty,
  performRunBusiness,
  performPayTaxes,
  prisonStatus,
  performCrime,
  performEscape,
  performFight,
  duelAllowed,
  listSocial,
  performSetRelationship,
  officeStatus,
  performSeekOffice,
  diplomacyStances,
  performDiplomacy,
  appearanceStatus,
  performSetAppearance,
} from "./play/systems";
import {
  listMessages,
  performSendMessage,
  performCreateGroup,
  performJoinGroup,
  groupStatus,
  familyStatus,
  performMarry,
  performHaveChild,
} from "./play/multiplayer";
import {
  bankSummary,
  performDeposit,
  performWithdraw,
  performOpenEscrow,
  performReleaseEscrow,
  performRefundEscrow,
  escrowList,
  performPeerLoan,
  bankLoanList,
  performRepayPeerLoan,
  performCollectDefault,
  settleBankruptcies,
} from "./play/bank";
import {
  companyList,
  performFoundCompany,
  performAddPartner,
  performDistributeProfit,
  performAcquireCompany,
  performHireEmployee,
  performOpenBranch,
} from "./play/company";
import {
  rentalList,
  performListForRent,
  performCollectRent,
  performForeclose,
  autoForecloseForTaxes,
  titleDisputeList,
  performOpenTitleDispute,
  performResolveTitleDispute,
} from "./play/property-extras";
import {
  tradeOffers,
  performOfferTrade,
  performAcceptTrade,
  performRejectTrade,
  kingdomRelations,
  performFormAlliance,
  performDeclareWar,
  performMakePeace,
  performCreateAlliance,
  performJoinAlliance,
  allianceStatus,
} from "./play/multiplayer-extras";
import { adminOverview, adminCharacters, adminSetCharacterStatus, adminEconomy } from "./admin/console";
import { playerDirectory } from "./play/directory";
import { loadPersonality } from "./play/personality";
import { heirOf } from "./play/succession";
import {
  childList,
  performRecordChild,
  motionList,
  performCouncilMotion,
  performResignOffice,
  performRecordDeath,
  playerMarketShare,
} from "./play/family-politics";
import { RECIPES } from "./inventory/crafting";
import { EXPLORATION_SITES } from "./quests/system";
import { CROPS, LIVESTOCK, ANIMALS } from "./livelihood/production";
import { MAGIC_PATHS, SPELLS, GUILDS, ACTIVITIES, TEMPLE_SERVICES } from "./magic/lore";
import { UNDERWORLD_ACTIONS } from "./underworld/gangs";
import { appearanceOptions } from "./character/appearance";
import { buildDigest, type Notification } from "./notify/notifications";
import {
  ASSET_CATALOG,
  portraitPoolCatalog,
  selectAssets,
  attributionList,
  portraitForKey,
  type AssetCategory,
} from "./assets/library";

export { PasswordHashGate } from "./durable/password-hash-gate";

export interface Env {
  DB: SqlDatabase;
  SESSION_SECRET: string;
  OVERLOADED?: string;
  REQUESTS_REMAINING?: string;
  /** CORS icin izinli kaynak; bos ise tum kaynaklar (bkz. http/cors.ts). */
  ALLOWED_ORIGIN?: string;
}

type Ctx = RouteContext<Env>;

const router = new Router<Env>();

router.get("/api/health", () =>
  json({ status: "ok", service: "kul-ve-taht-functions", paidFeatures: false }),
);

router.get("/api/world/summary", () => json(worldSummary()));

router.get("/api/world/kingdoms", () => json({ kingdoms: KINGDOMS }));

router.get("/api/world/settlements", ({ url }: Ctx) => {
  const kingdomId = url.searchParams.get("kingdom");
  const kind = url.searchParams.get("kind");
  let list = SETTLEMENTS;
  if (kingdomId) list = list.filter((s) => s.kingdomId === kingdomId);
  if (kind) list = list.filter((s) => s.kind === kind);
  return json({ count: list.length, settlements: list });
});

router.get("/api/world/places", () =>
  json({ freeCities: FREE_CITIES, neutralZones: NEUTRAL_ZONES }),
);

// --- Oyuncu bildirimleri (belge 19) ---

/** Bildirim ozeti: esik uzeri olaylar tek tek, arka plan TEK satir. */
router.get("/api/notifications", async ({ request, env }: Ctx) => {
  const session = await readSession(request, env);
  if (!session) return error("unauthorized", "Gecerli oturum yok.", 401);
  const rows = await queryAll<{ id: string; kind: string; priority: number; summary: string; read: number; created_at: number }>(
    env.DB,
    "SELECT id, kind, priority, summary, read, created_at FROM player_notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT 100",
    session.accountId,
  );
  const list: Notification[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as Notification["kind"],
    priority: r.priority as Notification["priority"],
    summary: r.summary,
    read: r.read === 1,
    createdAtMs: r.created_at,
  }));
  return json(buildDigest(list));
});

/** Bildirimleri okundu isaretle (yalnizca sahibi). */
router.post("/api/notifications/read", async ({ request, env }: Ctx) => {
  const session = await readSession(request, env);
  if (!session) return error("unauthorized", "Gecerli oturum yok.", 401);
  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((i) => typeof i === "string") : [];
  if (ids.length === 0) return error("invalid_body", "ids alani zorunludur.", 400);
  for (const id of ids) {
    await execute(env.DB, "UPDATE player_notifications SET read = 1 WHERE id = ? AND account_id = ?", id, session.accountId);
  }
  return json({ ok: true, marked: ids.length });
});

/** Yerlesim profili (belge 20): nufus, ekonomi, yonetim, guvenlik, ulasim... */
router.get("/api/world/profile", ({ url }: Ctx) => {
  const id = url.searchParams.get("id");
  if (!id) return json({ profiles: allSettlementProfiles() });
  const profile = settlementProfile(id);
  if (!profile) return error("not_found", "Yerlesim bulunamadi.", 404);
  return json(profile);
});

/** Dunya haritasi: tum yerlesim profilleri dahil (harita katmani). */
router.get("/api/world/map", () => json(mapData()));

/** Sohbet gecmisi (belge 16.2): kanal + kapsam ile son mesajlar. */
router.get("/api/chat", async ({ request, env, url }: Ctx) => {
  const session = await readSession(request, env);
  if (!session) return error("unauthorized", "Gecerli oturum yok.", 401);
  const kind = url.searchParams.get("channel") ?? "global";
  const scopeId = url.searchParams.get("scopeId");
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const messages = await listMessages(env.DB, kind, scopeId, Number.isFinite(limit) ? limit : 50);
  return json({ channel: kind, scopeId, count: messages.length, messages });
});

router.get("/api/world/birthplaces", ({ url }: Ctx) => {
  const id = url.searchParams.get("id");
  if (id) {
    const panel = birthplacePanel(id);
    return panel ? json(panel) : error("not_found", "Dogum yeri bulunamadi.", 404);
  }
  return json({ count: allBirthplacePanels().length, panels: allBirthplacePanels() });
});

router.get("/api/world/time", async ({ env }: Ctx) => {
  if (!env?.DB) {
    return json({ realHoursPerGameDay: 6, gameDaysPerGameYear: 360, source: "static" });
  }
  const row = await queryOne<{ game_day: number; game_year: number; last_tick_real_ms: number }>(
    env.DB,
    "SELECT game_day, game_year, last_tick_real_ms FROM world_clock WHERE id = 1",
  );
  if (!row) return error("clock_missing", "Dunya saati bulunamadi.", 500);

  const advanced = advanceWorldTime(
    { gameDay: row.game_day, gameYear: row.game_year, lastTickRealMs: row.last_tick_real_ms },
    Date.now(),
  );

  if (advanced.advancedDays > 0) {
    await execute(
      env.DB,
      "UPDATE world_clock SET game_day = ?, game_year = ?, last_tick_real_ms = ? WHERE id = 1",
      advanced.gameDay,
      advanced.gameYear,
      advanced.lastTickRealMs,
    );
    // Dunya ilerledikce katmanli simulasyon calisir (belge 8.8, 9.4).
    await runWorldSimulation(env.DB, advanced.gameDay).catch(() => undefined);
    // Karakterlerin gunluk ilerlemesi (belge 6, 12.8): aclik, saglik, yaslanma
    // ve olum/miras dunya saatine baglidir. Partili ve idempotent.
    await advanceAllCharacters(env.DB, advanced.gameDay).catch(() => undefined);
    await settleDueAuctions(env.DB).catch(() => undefined);
    // Temerrut/iflas/tasfiye (belge 20): vadesi gecen krediler her turda
    // denetlenir; iflas eden borclunun varligi alacaklilara dagitilir.
    await settleBankruptcies(env.DB).catch(() => undefined);
  }

  return json({
    gameDay: advanced.gameDay,
    gameYear: advanced.gameYear,
    season: seasonFor(advanced.gameDay),
    advancedDays: advanced.advancedDays,
  });
});

router.post("/api/auth/register", async ({ request, env }: Ctx) => {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string; locale?: "tr" | "en" }
    | null;
  if (!body?.email || !body.password) {
    return error("invalid_body", "E-posta ve parola zorunludur.", 400);
  }
  const result = await registerAccount(env.DB, {
    email: body.email,
    password: body.password,
    ...(body.locale ? { locale: body.locale } : {}),
  });
  if (!result.ok) {
    const status = result.error === "email_taken" ? 409 : 400;
    return error(result.error, "Kayit tamamlanamadi.", status);
  }
  return json({ accountId: result.accountId }, 201);
});

router.post("/api/auth/login", async ({ request, env }: Ctx) => {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  if (!body?.email || !body.password) {
    return error("invalid_body", "E-posta ve parola zorunludur.", 400);
  }
  if (!env.SESSION_SECRET) {
    return error("server_misconfigured", "Oturum sirri yapilandirilmamis.", 500);
  }
  const result = await loginAccount(env.DB, { email: body.email, password: body.password }, env.SESSION_SECRET);
  if (!result.ok) {
    const status = result.error === "suspended" ? 403 : 401;
    return error(result.error, "Giris basarisiz.", status);
  }
  return json({ token: result.token, expiresAt: result.payload.expiresAt });
});

router.get("/api/me", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET
    ? await verifySessionToken(token, env.SESSION_SECRET, Date.now())
    : null;
  const decision = authorize({ session, action: "profile:read" });
  if (!decision.allowed) return error("unauthorized", "Gecerli oturum yok.", 401);
  return json({ accountId: session?.accountId, role: session?.role });
});

/** Krallik butcesini elle isletir (belge 9.7-9.9). Yalnizca yonetici. */
router.post("/api/admin/budget/run", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const body = (await request.json().catch(() => null)) as { kingdomId?: string } | null;
  if (!body?.kingdomId) return error("invalid_body", "kingdomId zorunludur.", 400);
  const result = await runKingdomBudget(env.DB, body.kingdomId);
  return result ? json(result) : error("not_found", "Krallik bulunamadi.", 404);
});

/**
 * Yolsuzluk denetimi (belge 9.8): kayitli gelir ile hazineye ULASAN gercek
 * gelir arasindaki fark, denetim gucuyle ortaya cikarilir; kaybolan kismi
 * hazineye geri doner ve krallik yolsuzluk orani guncellenir. Denetim
 * sonucu audit_log'a yazilir (belge 21.1). Yalnizca yonetici.
 */
router.post("/api/admin/corruption/audit", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const body = (await request.json().catch(() => null)) as { kingdomId?: string; auditStrength?: number; actualRevenue?: number } | null;
  if (!body?.kingdomId) return error("invalid_body", "kingdomId zorunludur.", 400);
  const strength = Math.max(0, Math.min(1, body.auditStrength ?? 0.5));
  // Gercek gelir verilmezse, yolsuzluk oranina gore kaybolan kısım varsayilir.
  const kingdom = await queryOne<{ corruption: number; population: number }>(
    env.DB,
    `SELECT COALESCE(k.corruption,0.1) AS corruption, COALESCE(SUM(s.population),0) AS population
     FROM kingdoms k LEFT JOIN settlements s ON s.kingdom_id = k.id WHERE k.id = ? GROUP BY k.id`,
    body.kingdomId,
  );
  if (!kingdom) return error("not_found", "Krallik bulunamadi.", 404);
  const recorded = Math.round((kingdom.population ?? 0) * 0.02);
  const actualRevenue = body.actualRevenue ?? Math.round(recorded * (1 - (kingdom.corruption ?? 0.1)));
  const result = await auditKingdomCorruption(env.DB, body.kingdomId, actualRevenue, strength);
  if (!result) return error("not_found", "Krallik bulunamadi.", 404);
  await execute(
    env.DB,
    "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    session?.accountId ?? null,
    "corruption_audit",
    "kingdom",
    body.kingdomId,
    JSON.stringify({ recorded, actualRevenue, strength, detected: result.detected, newCorruption: result.newCorruption }),
    Date.now(),
  );
  return json({ ...result, recorded, actualRevenue });
});

/** Devlet piyasa mudahalesi: hazineden tahil surerek fiyati baskir (belge 9.4, 9.9). */
router.post("/api/admin/market/intervene", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const body = (await request.json().catch(() => null)) as { kingdomId?: string; grainAmount?: number; unitCost?: number } | null;
  if (!body?.kingdomId) return error("invalid_body", "kingdomId zorunludur.", 400);
  const result = await interveneMarket(env.DB, body.kingdomId, body.grainAmount ?? 100, body.unitCost ?? 2);
  return result.ok ? json(result) : error("not_enough_gold", "Hazine yetersiz.", 400);
});

/** Yonetim panosu ozeti (belge 20). Yalnizca yonetici. */
router.get("/api/admin/overview", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  return json(await adminOverview(env.DB));
});

/** Kullanici/karakter yonetimi listesi (belge 20). Yalnizca yonetici. */
router.get("/api/admin/characters", async ({ request, url, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  return json({ characters: await adminCharacters(env.DB, Number.isFinite(limit) ? limit : 50) });
});

/** Karakter durumu degistirir (canli/olu) (belge 20). Yalnizca yonetici. */
router.post("/api/admin/characters/:id/status", async ({ params, request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status === "dead" ? "dead" : body?.status === "alive" ? "alive" : null;
  if (!status) return error("invalid_body", "status 'alive' veya 'dead' olmalidir.", 400);
  const result = await adminSetCharacterStatus(env.DB, params.id!, status);
  return result.ok ? json({ ok: true }) : error("not_found", "Karakter bulunamadi.", 404);
});

/** Pazar/ekonomi izleme (belge 20). Yalnizca yonetici. */
router.get("/api/admin/economy", async ({ request, url, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  if (!authorize({ session, action: "admin:any" }).allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  return json({ economy: await adminEconomy(env.DB, Number.isFinite(limit) ? limit : 50) });
});

router.post("/api/admin/seed-world", async ({ request, env }: Ctx) => {
  // Tohumlama idempotenttir; yalnizca yonetici oturumu ile calistirilir.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  const decision = authorize({ session, action: "admin:any" });
  if (!decision.allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  const result = await seedWorld(env.DB);
  return json(result);
});

router.get("/api/characters", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  const decision = authorize({ session, action: "profile:read" });
  if (!decision.allowed || !session) return error("unauthorized", "Gecerli oturum yok.", 401);
  const rows = await env.DB.prepare(
    "SELECT id, given_name, surname, birth_settlement, current_settlement, age_years, generation FROM characters WHERE account_id = ? ORDER BY created_at DESC",
  )
    .bind(session.accountId)
    .all<{ id: string; given_name: string; surname: string }>();
  return json({ characters: rows.results });
});

router.post("/api/characters", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  const decision = authorize({ session, action: "profile:write" });
  if (!decision.allowed || !session) return error("unauthorized", "Gecerli oturum yok.", 401);

  const body = (await request.json().catch(() => null)) as Omit<CreateCharacterInput, "accountId"> | null;
  if (!body) return error("invalid_body", "Gecerli bir govde gerekli.", 400);

  // Hesap kimligi istemciden DEGIL oturumdan alinir (yetki yukseltme engeli).
  const result = await createCharacter(env.DB, { ...body, accountId: session.accountId });
  if (!result.ok) {
    const status = result.error === "invalid_birth_settlement" ? 404 : 400;
    return json({ error: { code: result.error, message: "Karakter olusturulamadi." }, problems: result.problems ?? [] }, status);
  }
  return json({ characterId: result.characterId }, 201);
});

/** Oturumu cozer; gecersizse null. */
async function readSession(request: Request, env: Env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return env?.SESSION_SECRET ? verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
}

/**
 * Karakterin bu oturuma ait oldugunu dogrular. Sahiplik kontrolu olmadan
 * hicbir oynanis aksiyonu calistirilmaz (belge 21.1).
 */
async function ownsCharacter(env: Env, accountId: string, characterId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    env.DB,
    "SELECT id FROM characters WHERE id = ? AND account_id = ?",
    characterId,
    accountId,
  );
  return row !== null;
}

function playError(result: { error?: string; detail?: Record<string, unknown> }): Response {
  const status = result.error === "character_not_found" ? 404 : result.error === "not_enough_gold" ? 402 : 400;
  const code = result.error ?? "invalid_action";
  // "reason" alt kodu istemciye tasinir (ornek: consent_required, not_imprisoned).
  const reason = typeof result.detail?.reason === "string" ? result.detail.reason : undefined;
  return json({ error: { code, message: "Aksiyon tamamlanamadi.", ...(reason ? { reason } : {}) } }, status);
}

/** Karakterin tam oynanis durumu (saglik, envanter, altin). */
router.get("/api/play/:characterId/state", async ({ params, request, env }: Ctx) => {
  const session = await readSession(request, env);
  if (!session) return error("unauthorized", "Gecerli oturum yok.", 401);
  if (!(await ownsCharacter(env, session.accountId, params.characterId!))) {
    return error("forbidden", "Bu karakter size ait degil.", 403);
  }
  const state = await getPlayState(env.DB, params.characterId!);
  if (!state) return error("not_found", "Karakter bulunamadi.", 404);
  const storage = await storageSummary(
    env.DB,
    params.characterId!,
    state.inventory,
    state.strength,
    state.inventory.some((e) => e.itemId === "pack-horse"),
  );
  const group = await groupStatus(env.DB, params.characterId!);
  const appearance = await appearanceStatus(env.DB, params.characterId!);
  const companies = await companyList(env.DB, params.characterId!);
  const [rentals, titleDisputes, personality, heir] = await Promise.all([
    rentalList(env.DB, params.characterId!),
    titleDisputeList(env.DB, params.characterId!),
    loadPersonality(env.DB, params.characterId!),
    heirOf(env.DB, params.characterId!),
  ]);
  const [bank, escrows, peerLoans] = await Promise.all([
    bankSummary(env.DB, params.characterId!),
    escrowList(env.DB, params.characterId!),
    bankLoanList(env.DB, params.characterId!),
  ]);
  const kingdomId = (await queryOne<{ current_settlement: string | null }>(
    env.DB,
    "SELECT current_settlement FROM characters WHERE id = ?",
    params.characterId!,
  ))?.current_settlement?.split("-")[0] ?? "varkhenn";
  const [trades, alliance, children, relations, motions, directory] = await Promise.all([
    tradeOffers(env.DB, params.characterId!),
    allianceStatus(env.DB, params.characterId!),
    childList(env.DB, params.characterId!),
    kingdomRelations(env.DB),
    motionList(env.DB, kingdomId),
    playerDirectory(env.DB, params.characterId!, 50),
  ]);
  const [units, ships, properties, loan, prison, social, office, family] = await Promise.all([
    listUnits(env.DB, params.characterId!),
    listShips(env.DB, params.characterId!),
    listProperties(env.DB, params.characterId!),
    loanSummary(env.DB, params.characterId!),
    prisonStatus(env.DB, params.characterId!),
    listSocial(env.DB, params.characterId!),
    officeStatus(env.DB, params.characterId!),
    familyStatus(env.DB, params.characterId!),
  ]);
  return json({
    state,
    items: ITEMS,
    recipes: RECIPES,
    explorationSites: EXPLORATION_SITES,
    units,
    ships,
    properties,
    loan,
    prison,
    social,
    office,
    family,
    group,
    appearance,
    bank,
    escrows,
    peerLoans,
    companies,
    rentals,
    titleDisputes,
    trades,
    alliance,
    children,
    relations,
    motions,
    directory,
    personality,
    heir,
    storage,
    diplomacy: await diplomacyStances(),
  });
});

/** Pazar fiyati: yerlesim baglami verilirse arz/talep ve bozulma carpani uygulanir (belge 9.2, 9.4). */
router.get("/api/market/:itemId", async ({ params, url, env }: Ctx) => {
  const settlementId = url.searchParams.get("settlementId");
  const quote = settlementId
    ? await quoteMarket(env.DB, settlementId, params.itemId!)
    : marketQuote(params.itemId!);
  if (!quote) return error("not_found", "Esya bulunamadi.", 404);
  // Bolgesel tekel: pazar payi esigi asilirsa fiyat carpani uygulanir (belge 9.4).
  const monopoly = settlementId ? await monopolyFactor(env.DB, settlementId, params.itemId!) : 1;
  // Bolgesel arz payi (belge 9.4): pazar payi saf fonksiyonu ile raporlanir.
  const share = settlementId ? await playerMarketShare(env.DB, settlementId, params.itemId!) : 0;
  return json({ ...quote, monopoly, share, buy: Math.round(quote.buy * monopoly), sell: Math.round(quote.sell * monopoly) });
});

router.get("/api/lodging", ({ url }: Ctx) => {
  const kind = url.searchParams.get("kind") ?? "town";
  const nights = Number.parseInt(url.searchParams.get("nights") ?? "1", 10);
  return json({ cost: lodgingQuote(kind, Number.isFinite(nights) ? nights : 1) });
});

/** Gorsel varlik katalogu (belge 17.4): yalnizca lisans uyumlu varliklar doner. */
router.get("/api/assets/catalog", ({ url }: Ctx) => {
  const category = url.searchParams.get("category") as AssetCategory | null;
  const tag = url.searchParams.get("tag") ?? undefined;
  const catalog = [...ASSET_CATALOG, ...portraitPoolCatalog()];
  const selected = selectAssets(catalog, { ...(category ? { category } : {}), ...(tag ? { tag } : {}) });
  return json({ count: selected.length, assets: selected, attributions: attributionList(selected) });
});

/** Portre atamasi: onemli karakter ozel, siradan NPC havuzdan (belge 17.2). */
router.get("/api/assets/portrait/:key", ({ params, url }: Ctx) => {
  const reserved = url.searchParams.get("reserved") === "1";
  return json(portraitForKey(params.key!, reserved));
});

/** Oynanis aksiyonu: govde { action, ... } seklindedir; SUNUCUDA dogrulanir. */
router.post("/api/play/:characterId/action", async ({ params, request, env }: Ctx) => {
  const session = await readSession(request, env);
  if (!session) return error("unauthorized", "Gecerli oturum yok.", 401);
  const characterId = params.characterId!;
  if (!(await ownsCharacter(env, session.accountId, characterId))) {
    return error("forbidden", "Bu karakter size ait degil.", 403);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : null;
  if (!action) return error("invalid_body", "action alani zorunludur.", 400);

  let result;
  switch (action) {
    case "eat":
      result = await performEat(env.DB, characterId, String(body?.itemId ?? ""));
      break;
    case "rest":
      result = await performRest(env.DB, characterId, Number(body?.hours ?? 6));
      break;
    case "craft":
      result = await performCraft(env.DB, characterId, String(body?.recipeId ?? ""));
      break;
    case "work":
      result = await performWork(env.DB, characterId, String(body?.profession ?? "farmer"), Number(body?.hours ?? 8));
      break;
    case "travel":
      result = await performTravel(env.DB, characterId, String(body?.toSettlementId ?? ""), {
        season: (body?.season as "spring" | "summer" | "autumn" | "winter") ?? "summer",
        weather: (body?.weather as "clear" | "rain" | "storm" | "snow" | "fog") ?? "clear",
        roadQuality: Number(body?.roadQuality ?? 80),
        isCaravan: Boolean(body?.isCaravan),
      });
      break;
    case "explore":
      result = await performExplore(
        env.DB,
        characterId,
        String(body?.site ?? "forest") as (typeof EXPLORATION_SITES)[number],
        Number(body?.preparedness ?? 20),
      );
      break;
    case "trade":
      result = await performTrade(
        env.DB,
        characterId,
        String(body?.itemId ?? ""),
        Number(body?.quantity ?? 1),
        body?.side === "sell" ? "sell" : "buy",
      );
      break;
    case "treat":
      result = await performTreat(
        env.DB,
        characterId,
        String(body?.injuryId ?? ""),
        (body?.method as "bandage" | "herb" | "surgery" | "rest") ?? "bandage",
        Number(body?.quality ?? 50),
      );
      break;
    case "treatDisease":
      result = await performTreatDisease(env.DB, characterId, String(body?.diseaseId ?? ""), Number(body?.quality ?? 50));
      break;
    case "plant":
      result = await performPlant(
        env.DB,
        characterId,
        String(body?.crop ?? "wheat") as "wheat" | "barley" | "vegetable" | "fruit",
        (body?.season as "spring" | "summer" | "autumn" | "winter") ?? "spring",
        (body?.weather as "clear" | "rain" | "storm" | "fog" | "snow" | "heat") ?? "clear",
        Number(body?.soilQuality ?? 1),
      );
      break;
    case "harvest":
      result = await performHarvest(env.DB, characterId);
      break;
    case "hunt":
      result = await performHunt(
        env.DB,
        characterId,
        String(body?.animal ?? "deer") as "wolf" | "bear" | "deer" | "boar" | "fox",
        Number(body?.preparedness ?? 30),
      );
      break;
    case "tame":
      result = await performTame(env.DB, characterId, String(body?.animal ?? "fox") as "wolf" | "bear" | "deer" | "boar" | "fox");
      break;
    case "learnSpell":
      result = await performLearnSpell(env.DB, characterId, String(body?.path ?? "elemental") as "elemental" | "spirit_caller" | "shamanism");
      break;
    case "castSpell":
      result = await performCastSpell(env.DB, characterId, String(body?.spellId ?? ""));
      // Kara buyu yasakli krallikta suc sayilir; tam yargi akisi islenir (belge 13.1).
      if (result.ok && result.detail?.outlawed === true) {
        await performCrime(env.DB, characterId, "dark_magic", 60);
      }
      break;
    case "temple":
      result = await performTempleService(env.DB, characterId, String(body?.service ?? "healing") as "healing" | "knowledge" | "shelter" | "protection");
      break;
    case "joinGuild":
      result = await performJoinGuild(env.DB, characterId, String(body?.guildId ?? ""));
      break;
    case "createGroup":
      result = await performCreateGroup(env.DB, characterId, String(body?.name ?? ""), body?.objective ? String(body.objective) : null);
      break;
    case "joinGroup":
      result = await performJoinGroup(env.DB, characterId, String(body?.groupId ?? ""));
      break;
    case "activity":
      result = await performActivity(env.DB, characterId, String(body?.kind ?? "tavern") as "tavern" | "market" | "tournament" | "festival" | "fair" | "gambling");
      break;
    case "underworld":
      result = await performUnderworldAct(
        env.DB,
        characterId,
        String(body?.underworldAction ?? "theft") as "theft" | "smuggling" | "fraud" | "assassination" | "black_market",
        Number(body?.security ?? 50),
        Boolean(body?.gangAffiliation),
      );
      break;
    case "recruit":
      result = await performRecruit(
        env.DB,
        characterId,
        String(body?.unitType ?? "infantry") as "infantry" | "cavalry" | "archer" | "siege" | "naval",
        Number(body?.strength ?? 10),
      );
      break;
    case "resupply":
      result = await performResupply(env.DB, characterId);
      break;
    case "battle":
      result = await performBattle(env.DB, characterId, (body?.terrain as "open" | "forest" | "mountain" | "fortified" | "naval") ?? "open");
      break;
    case "siege":
      result = await performSiege(env.DB, characterId, Number(body?.siegeEngines ?? 5));
      break;
    case "buildShip":
      result = await performBuildShip(env.DB, characterId, String(body?.shipClass ?? "galley") as "galley" | "longship" | "caravel" | "flagship");
      break;
    case "navalBattle":
      result = await performNavalBattle(env.DB, characterId);
      break;
    case "takeLoan":
      result = await performTakeLoan(env.DB, characterId, Number(body?.amount ?? 100));
      break;
    case "repayLoan":
      result = await performRepayLoan(env.DB, characterId);
      break;
    case "buyProperty":
      result = await performBuyProperty(
        env.DB,
        characterId,
        String(body?.propertyType ?? "house") as "house" | "business" | "farm" | "mine" | "ship" | "warehouse",
      );
      break;
    case "runBusiness":
      result = await performRunBusiness(env.DB, characterId);
      break;
    case "payTaxes":
      result = await performPayTaxes(env.DB, characterId);
      break;
    case "crime":
      result = await performCrime(
        env.DB,
        characterId,
        String(body?.crimeType ?? "theft") as "theft" | "smuggling" | "fraud" | "assassination" | "banditry" | "black_market" | "dark_magic",
        Number(body?.evidence ?? 30),
      );
      break;
    case "escape":
      result = await performEscape(env.DB, characterId, Number(body?.bribe ?? 0));
      break;
    case "fight":
      result = await performFight(env.DB, characterId, Number(body?.opponentStrength ?? 8));
      break;
    case "duel": {
      const consent = Boolean(body?.consented);
      const check = await duelAllowed(env.DB, characterId, consent);
      result = check.allowed
        ? await performFight(env.DB, characterId, Number(body?.opponentStrength ?? 8))
        : ({
            ok: false,
            error: "invalid_action",
            detail: { reason: check.safeCity ? "consent_required" : "pvp_not_allowed" },
          } satisfies PlayResult);
      break;
    }
    case "setRelationship":
      result = await performSetRelationship(
        env.DB,
        characterId,
        String(body?.targetId ?? ""),
        String(body?.kind ?? "friend") as "friend" | "enemy" | "ally" | "trade_partner",
      );
      break;
    case "seekOffice":
      result = await performSeekOffice(env.DB, characterId, String(body?.title ?? "Memur"));
      break;
    case "setAppearance":
      result = await performSetAppearance(env.DB, characterId, (body?.appearance ?? {}) as Record<string, never>);
      break;
    case "deposit":
      result = await performDeposit(env.DB, characterId, Number(body?.amount ?? 0), body?.kind === "vault" ? "vault" : "current");
      break;
    case "withdraw":
      result = await performWithdraw(env.DB, characterId, Number(body?.amount ?? 0), body?.kind === "vault" ? "vault" : "current");
      break;
    case "openEscrow":
      result = await performOpenEscrow(env.DB, characterId, String(body?.toId ?? ""), Number(body?.amount ?? 0), String(body?.condition ?? ""));
      break;
    case "releaseEscrow":
      result = await performReleaseEscrow(env.DB, characterId, String(body?.escrowId ?? ""));
      break;
    case "refundEscrow":
      result = await performRefundEscrow(env.DB, characterId, String(body?.escrowId ?? ""));
      break;
    case "peerLoan":
      result = await performPeerLoan(env.DB, characterId, String(body?.borrowerId ?? ""), Number(body?.principal ?? 0), Number(body?.interestRate ?? 5), Number(body?.days ?? 30));
      break;
    case "repayPeerLoan":
      result = await performRepayPeerLoan(env.DB, characterId, String(body?.loanId ?? ""));
      break;
    case "collectDefault":
      result = await performCollectDefault(env.DB, characterId, String(body?.loanId ?? ""));
      break;
    case "foundCompany":
      result = await performFoundCompany(env.DB, characterId, String(body?.name ?? ""), Number(body?.capital ?? 0));
      break;
    case "addPartner":
      result = await performAddPartner(env.DB, characterId, String(body?.companyId ?? ""), String(body?.partnerId ?? ""), Number(body?.share ?? 0));
      break;
    case "distributeProfit":
      result = await performDistributeProfit(env.DB, characterId, String(body?.companyId ?? ""));
      break;
    case "acquireCompany":
      result = await performAcquireCompany(env.DB, characterId, String(body?.companyId ?? ""), Boolean(body?.allPartnersAgree));
      break;
    case "hireEmployee":
      result = await performHireEmployee(env.DB, characterId, String(body?.companyId ?? ""), String(body?.name ?? ""), Number(body?.wage ?? 5));
      break;
    case "openBranch":
      result = await performOpenBranch(env.DB, characterId, String(body?.companyId ?? ""), String(body?.settlementId ?? ""));
      break;
    case "listForRent":
      result = await performListForRent(env.DB, characterId, String(body?.propertyId ?? ""), Number(body?.monthlyRate ?? 2));
      break;
    case "collectRent":
      result = await performCollectRent(env.DB, characterId);
      break;
    case "foreclose":
      result = await performForeclose(env.DB, characterId, String(body?.propertyId ?? ""), Number(body?.debt ?? 0));
      break;
    case "autoForecloseTaxes":
      result = await autoForecloseForTaxes(env.DB, characterId);
      break;
    case "openTitleDispute":
      result = await performOpenTitleDispute(env.DB, characterId, String(body?.propertyId ?? ""), String(body?.claimantB ?? ""));
      break;
    case "resolveTitleDispute":
      result = await performResolveTitleDispute(env.DB, characterId, String(body?.disputeId ?? ""));
      break;
    case "offerTrade":
      result = await performOfferTrade(
        env.DB,
        characterId,
        String(body?.toId ?? ""),
        Number(body?.offerGold ?? 0),
        Array.isArray(body?.offerItems) ? body.offerItems : [],
        Number(body?.requestGold ?? 0),
        Array.isArray(body?.requestItems) ? body.requestItems : [],
      );
      break;
    case "acceptTrade":
      result = await performAcceptTrade(env.DB, characterId, String(body?.offerId ?? ""));
      break;
    case "rejectTrade":
      result = await performRejectTrade(env.DB, characterId, String(body?.offerId ?? ""));
      break;
    case "formAlliance":
      result = await performFormAlliance(env.DB, characterId, String(body?.fromKingdomId ?? ""), String(body?.toKingdomId ?? ""));
      break;
    case "declareWar":
      result = await performDeclareWar(env.DB, characterId, String(body?.fromKingdomId ?? ""), String(body?.toKingdomId ?? ""));
      break;
    case "makePeace":
      result = await performMakePeace(env.DB, characterId, String(body?.fromKingdomId ?? ""), String(body?.toKingdomId ?? ""));
      break;
    case "createAlliance":
      result = await performCreateAlliance(env.DB, characterId, String(body?.name ?? ""));
      break;
    case "joinAlliance":
      result = await performJoinAlliance(env.DB, characterId, String(body?.allianceId ?? ""));
      break;
    case "recordChild":
      result = await performRecordChild(env.DB, characterId, String(body?.name ?? ""), Number(body?.parentAttention ?? 50), Number(body?.wetNurseQuality ?? 50));
      break;
    case "councilMotion":
      result = await performCouncilMotion(env.DB, characterId, String(body?.title ?? ""), Number(body?.quorum ?? 3));
      break;
    case "resignOffice":
      result = await performResignOffice(env.DB, characterId);
      break;
    case "recordDeath":
      result = await performRecordDeath(env.DB, characterId, String(body?.note ?? ""));
      break;
    case "sendMessage":
      result = await performSendMessage(
        env.DB,
        characterId,
        String(body?.channel ?? "global") as "global" | "local" | "guild" | "group" | "direct",
        body?.scopeId === undefined || body?.scopeId === null ? null : String(body.scopeId),
        String(body?.body ?? ""),
        body?.recipientId === undefined || body?.recipientId === null ? null : String(body.recipientId),
      );
      break;
    case "marry":
      result = await performMarry(
        env.DB,
        characterId,
        String(body?.spouseName ?? ""),
        body?.spouseId === undefined || body?.spouseId === null ? null : String(body.spouseId),
        Boolean(body?.consented),
      );
      break;
    case "haveChild":
      result = await performHaveChild(env.DB, characterId);
      break;
    case "diplomacy":
      result = await performDiplomacy(
        env.DB,
        characterId,
        String(body?.kingdomId ?? ""),
        String(body?.diplomacyAction ?? "gift") as "gift" | "marriage" | "insult" | "threat" | "treaty",
      );
      break;
    case "startQuest":
      result = await startQuest(env.DB, characterId, String(body?.questId ?? ""));
      break;
    case "claimQuest":
      result = await claimQuestReward(env.DB, characterId, String(body?.questId ?? ""));
      break;
    case "createAuction":
      result = await createAuction(
        env.DB,
        characterId,
        String(body?.itemId ?? ""),
        Number(body?.quantity ?? 1),
        Number(body?.reservePrice ?? 10),
      );
      break;
    case "bidAuction":
      result = await bidAuction(env.DB, characterId, String(body?.auctionId ?? ""), Number(body?.amount ?? 0));
      break;
    default:
      return error("invalid_action", "Bilinmeyen aksiyon.", 400);
  }

  if (!result.ok) return playError(result);

  // Aktif gorevlerin hedefleri, gerceklesen eylemle ilerler (belge 12.4).
  // Etiket sunucuda eslesir; istemci ilerleme gonderemez (belge 21.1).
  const questTag = questTagFor(action, body);
  if (questTag) await advanceQuestByTag(env.DB, characterId, questTag).catch(() => undefined);

  return json({ ok: true, state: result.state, detail: result.detail });
});

/** Eylem -> gorev hedef etiketi eslemesi (belge 12.4). */
function questTagFor(action: string, body: Record<string, unknown> | null): string | null {
  switch (action) {
    case "explore":
      return `explore:${String(body?.site ?? "forest")}`;
    case "hunt":
      return `hunt:${String(body?.animal ?? "deer")}`;
    case "craft":
      return "craft:any";
    case "trade":
      return "trade:any";
    case "fight":
    case "duel":
      return "fight:any";
    default:
      return null;
  }
}

/** Gorev katalogu ve karakterin gunlugu (belge 12.4, 18.3). */
router.get("/api/quests", async ({ request, env }: Ctx) => {
  const session = await readSession(request, env);
  if (!session) return error("unauthorized", "Gecerli oturum yok.", 401);
  const characterId = new URL(request.url).searchParams.get("characterId");
  const log = characterId ? await questLog(env.DB, characterId) : [];
  return json({
    catalog: QUEST_CATALOG.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      type: q.type,
      rewardGold: q.rewardGold,
      solutions: q.solutions,
      objectives: q.objectives.map((o) => ({ id: o.id, description: o.description, required: o.required })),
    })),
    log,
  });
});

/** Acik artirmalar: yerlesim verilirse o yerlesimdekiler (belge 9.3). */
router.get("/api/auctions", async ({ url, env }: Ctx) => {
  const settlementId = url.searchParams.get("settlementId") ?? undefined;
  const auctions = await listAuctions(env.DB, settlementId);
  return json({
    auctions: auctions.map((a) => ({
      id: a.id,
      itemId: a.itemId,
      quantity: a.quantity,
      reservePrice: a.reservePrice,
      currentBid: a.currentBid,
      currentBidderId: a.currentBidderId,
      closesDay: a.endsAtMs,
    })),
  });
});

/** Sistem katalogu: oyun icindeki tum veri setleri (istemci kesfi icin). */
router.get("/api/catalog", () =>
  json({
    crops: CROPS,
    livestock: LIVESTOCK,
    animals: ANIMALS,
    magicPaths: MAGIC_PATHS,
    spells: SPELLS,
    guilds: GUILDS,
    activities: ACTIVITIES,
    templeServices: TEMPLE_SERVICES,
    underworldActions: UNDERWORLD_ACTIONS,
    appearance: appearanceOptions(),
  }),
);

router.get("/api/admin/quota", async ({ request, env }: Ctx) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = env?.SESSION_SECRET ? await verifySessionToken(token, env.SESSION_SECRET, Date.now()) : null;
  const decision = authorize({ session, action: "admin:any" });
  if (!decision.allowed) return error("forbidden", "Yonetici yetkisi gerekli.", 403);
  return json(await quotaReport(env.DB));
});

function readQuotaState(env: Env | undefined): QuotaState {
  const remaining = Number.parseInt(env?.REQUESTS_REMAINING ?? "100000", 10);
  return {
    requestsRemainingToday: Number.isFinite(remaining) ? remaining : 100000,
    nonCriticalBudgetRemaining: 100000,
    overloaded: env?.OVERLOADED === "1",
  };
}

export default {
  /**
   * Zamanlanmis dunya turu (belge 8.8). Free plan cron tetikleyicisi ile
   * calisir; istek kotasindan bagimsizdir. Simulasyon katmanli ve partili
   * oldugu icin tek turda yazma kotasi asilmaz.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    if (!env?.DB) return;
    const row = await queryOne<{ game_day: number; game_year: number; last_tick_real_ms: number }>(
      env.DB,
      "SELECT game_day, game_year, last_tick_real_ms FROM world_clock WHERE id = 1",
    );
    if (!row) return;
    const advanced = advanceWorldTime(
      { gameDay: row.game_day, gameYear: row.game_year, lastTickRealMs: row.last_tick_real_ms },
      Date.now(),
    );
    if (advanced.advancedDays > 0) {
      await execute(
        env.DB,
        "UPDATE world_clock SET game_day = ?, game_year = ?, last_tick_real_ms = ? WHERE id = 1",
        advanced.gameDay,
        advanced.gameYear,
        advanced.lastTickRealMs,
      );
    }
    await runWorldSimulation(env.DB, advanced.gameDay).catch(() => undefined);
    // Karakter gunluk ilerlemesi (belge 6, 12.8); partili ve idempotent.
    await advanceAllCharacters(env.DB, advanced.gameDay).catch(() => undefined);
    await settleDueAuctions(env.DB).catch(() => undefined);
    // Temerrut/iflas/tasfiye (belge 20): vadesi gecen krediler her turda
    // denetlenir; iflas eden borclunun varligi alacaklilara dagitilir.
    await settleBankruptcies(env.DB).catch(() => undefined);
    // Aylik devlet butcesi (belge 9.7-9.9): her 30 oyun gununde bir vergi
    // toplanir, gider odenir, yetmezse borclanilir. Partili calisir.
    if (advanced.advancedDays > 0 && advanced.gameDay % 30 === 0) {
      const kingdoms = await queryAll<{ id: string }>(env.DB, "SELECT id FROM kingdoms ORDER BY id");
      for (const kingdom of kingdoms) {
        await runKingdomBudget(env.DB, kingdom.id).catch(() => undefined);
      }
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedOrigin(env?.ALLOWED_ORIGIN);

    // On kontrol (preflight) istekleri kota/kimlik gerektirmez; dogrudan yanitlanir.
    if (request.method === "OPTIONS") return preflightResponse(origin);

    const isCritical = url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/trade");

    // 0 TL korumasi: kota karari istek islenmeden once uygulanir.
    const outcome = decideQuota(readQuotaState(env), { critical: isCritical });
    const guarded = quotaResponse(outcome);
    if (guarded) return withCors(guarded, origin);

    const handled = await router.handle(request, env, ctx);
    if (handled) {
      // Kota olcumu: gercek tuketimi say (E1.11). Basarisizlik oyunu bloklamaz.
      if (env?.DB) await recordUsage(env.DB, "requests").catch(() => undefined);
      return withCors(handled, origin);
    }

    return withCors(error("not_found", "Kaynak bulunamadi.", 404), origin);
  },
};

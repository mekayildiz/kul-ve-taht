/**
 * Kul ve Taht - Workers giris noktasi.
 *
 * Kimlik dogrulama, yetkilendirme, kota korumasi, dunya verisi ve yedekleme
 * modullerini birbirine baglar. YALNIZCA Workers Free plan ozellikleri.
 * Hicbir ucretli plan ozelligi kullanilmaz (bkz. ADR-010).
 */

import { Router, type RouteContext } from "./http/router";
import { json, error, noContent } from "./http/response";
import { decideQuota, quotaResponse, type QuotaState } from "./quota/guard";
import { verifySessionToken } from "./auth/session";
import { authorize } from "./auth/authorize";
import { worldSummary, SETTLEMENTS, KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./world";
import { advanceWorldTime, seasonFor } from "./time/world-clock";
import { queryOne, execute, type SqlDatabase } from "./db/client";
import { registerAccount, loginAccount } from "./auth/service";
import { createCharacter, type CreateCharacterInput } from "./character/service";
import { seedWorld } from "./world/seed";

export { PasswordHashGate } from "./durable/password-hash-gate";
export { BackupWorkflow } from "./workflows/backup-workflow";

export interface Env {
  DB: SqlDatabase;
  SESSION_SECRET: string;
  OVERLOADED?: string;
  REQUESTS_REMAINING?: string;
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

function readQuotaState(env: Env | undefined): QuotaState {
  const remaining = Number.parseInt(env?.REQUESTS_REMAINING ?? "100000", 10);
  return {
    requestsRemainingToday: Number.isFinite(remaining) ? remaining : 100000,
    nonCriticalBudgetRemaining: 100000,
    overloaded: env?.OVERLOADED === "1",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isCritical = url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/trade");

    // 0 TL korumasi: kota karari istek islenmeden once uygulanir.
    const outcome = decideQuota(readQuotaState(env), { critical: isCritical });
    const guarded = quotaResponse(outcome);
    if (guarded) return guarded;

    const handled = await router.handle(request, env, ctx);
    if (handled) return handled;

    if (request.method === "OPTIONS") return noContent();
    return error("not_found", "Kaynak bulunamadi.", 404);
  },
};

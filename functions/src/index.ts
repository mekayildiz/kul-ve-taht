/**
 * Kul ve Taht - Workers giris noktasi (E1 iskeleti).
 *
 * Bu dosya yalnizca iskelettir: kimlik dogrulama, yetkilendirme, kota
 * korumasi ve yedekleme modullerini birbirine baglar. Gercek D1/R2/DO
 * binding'leri E1.2'de eklenir. Hicbir ucretli plan ozelligi kullanilmaz.
 */

import { Router } from "./http/router";
import { json, error, noContent } from "./http/response";
import { decideQuota, quotaResponse, type QuotaState } from "./quota/guard";
import { verifySessionToken } from "./auth/session";
import { authorize } from "./auth/authorize";

export interface Env {
  SESSION_SECRET: string;
  /** Ortam degiskeni: '1' ise sistem asiri yuk modunda. */
  OVERLOADED?: string;
  /** Gunluk kalan istek butcesi (izleme servisi tarafindan guncellenir). */
  REQUESTS_REMAINING?: string;
}

const router = new Router();

router.get("/api/health", () =>
  json({ status: "ok", service: "kul-ve-taht-functions", paidFeatures: false }),
);

router.get("/api/world/time", () =>
  json({
    // 1 oyun gunu = 6 gercek saat; 1 oyun yili = 360 oyun gunu.
    realHoursPerGameDay: 6,
    gameDaysPerGameYear: 360,
    realDaysPerGameYear: 90,
  }),
);

router.get("/api/me", async ({ request }) => {
  const secret = request.headers.get("x-session-secret") ?? "";
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const session = await verifySessionToken(token, secret, Date.now());
  const decision = authorize({ session, action: "profile:read" });
  if (!decision.allowed) return error("unauthorized", "Gecerli oturum yok.", 401);
  return json({ accountId: session?.accountId, role: session?.role });
});

function readQuotaState(env: Env): QuotaState {
  const remaining = Number.parseInt(env.REQUESTS_REMAINING ?? "100000", 10);
  return {
    requestsRemainingToday: Number.isFinite(remaining) ? remaining : 100000,
    nonCriticalBudgetRemaining: 100000,
    overloaded: env.OVERLOADED === "1",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isCritical = url.pathname.startsWith("/api/auth") || url.pathname.startsWith("/api/trade");

    // 0 TL korumasi: kota karari istek islenmeden once uygulanir.
    const outcome = decideQuota(readQuotaState(env), { critical: isCritical });
    const guarded = quotaResponse(outcome);
    if (guarded) return guarded;

    const handled = await router.handle(request);
    if (handled) return handled;

    if (request.method === "OPTIONS") return noContent();
    return error("not_found", "Kaynak bulunamadi.", 404);
  },
};

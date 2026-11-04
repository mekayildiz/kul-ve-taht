/**
 * 0 TL korumasi.
 *
 * Kota asiminda ucretli plana gecis YOKTUR. Platform, Workers Free limitleri
 * asildiginda istegi Error 1027 ile reddeder; bu modul ise uygulama duzeyinde
 * istegi daha erken karsilarak ucretli tetikleyici olusturmadan guvenli
 * sekilde yavaslatir / kuyruga alir / kritik olmayan isi durdurur.
 */

export type QuotaOutcome =
  | { kind: "allow" }
  | { kind: "throttle"; retryAfterSeconds: number }
  | { kind: "queue"; reason: string }
  | { kind: "degrade"; reason: string }
  | { kind: "readonly"; reason: string };

export interface QuotaState {
  /** Gunluk kalan istek butcesi (Workers 100.000/gun ile paylasimli). */
  requestsRemainingToday: number;
  /** Kritik olmayan isler icin kalan butce. */
  nonCriticalBudgetRemaining: number;
  /** Sistem su anda asiri yuk altinda mi. */
  overloaded: boolean;
}

export interface QuotaPolicy {
  /** Kritik islemler (auth, ticaret, savas) her zaman oncelikli. */
  critical: boolean;
}

/**
 * Saf fonksiyon: girdi durumuna gore karar uretir. Ag cagrisi yapmaz,
 * boylece birim testi ile dogrulanabilir.
 */
export function decideQuota(state: QuotaState, policy: QuotaPolicy): QuotaOutcome {
  if (state.requestsRemainingToday <= 0) {
    // Butce bitti: istegi ucretli plana tasimak yerine reddet/kuyruga al.
    return policy.critical
      ? { kind: "queue", reason: "daily_request_budget_exhausted" }
      : { kind: "throttle", retryAfterSeconds: 60 };
  }

  if (state.overloaded) {
    return policy.critical
      ? { kind: "degrade", reason: "overload_critical_only" }
      : { kind: "queue", reason: "overload_non_critical" };
  }

  if (!policy.critical && state.nonCriticalBudgetRemaining <= 0) {
    return { kind: "readonly", reason: "non_critical_budget_exhausted" };
  }

  return { kind: "allow" };
}

/** Kota kararini HTTP yanitina cevirir; hicbir durumda ucret tetiklemez. */
export function quotaResponse(outcome: QuotaOutcome): Response | null {
  switch (outcome.kind) {
    case "allow":
      return null;
    case "throttle":
      return new Response(
        JSON.stringify({ error: { code: "throttled", message: "Yogunluk nedeniyle gecici olarak sinirlandi." } }),
        {
          status: 429,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "retry-after": String(outcome.retryAfterSeconds),
          },
        },
      );
    case "queue":
      return new Response(
        JSON.stringify({ status: "queued", reason: outcome.reason }),
        { status: 202, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    case "degrade":
      return new Response(
        JSON.stringify({ status: "degraded", reason: outcome.reason }),
        { status: 503, headers: { "content-type": "application/json; charset=utf-8", "retry-after": "30" } },
      );
    case "readonly":
      return new Response(
        JSON.stringify({ error: { code: "readonly", message: "Kritik olmayan yazma islemleri gecici olarak durduruldu." } }),
        { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
      );
  }
}

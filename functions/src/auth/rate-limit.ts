/**
 * Hiz sinirlama + hesap basina eszamanli giris kontrolu.
 *
 * Amac:
 *  - Ayni hesaba yonelik parola denemelerini sinirlamak (brute-force savunmasi).
 *  - Hesap basina eszamanli hash islemi sayisini sinirlayarak tek bir Durable
 *    Object uzerinde dar bogaz olusmasini onlemek (bkz. hash dagitimi).
 *
 * Bu modul saf/durumsuz bir yardimci saglar; kalici sayaclar D1/DO'da tutulur.
 */

export interface LoginAttemptState {
  /** Son pencere icindeki deneme sayisi. */
  attemptsInWindow: number;
  /** Su anda ayni hesap icin devam eden eszamanli hash islemi. */
  concurrentHashes: number;
  /** Ilk denemenin zaman damgasi (ms). */
  windowStartedAtMs: number;
}

export interface RateLimitPolicy {
  maxAttemptsPerWindow: number;
  windowMs: number;
  maxConcurrentHashesPerAccount: number;
}

export const DEFAULT_LOGIN_POLICY: RateLimitPolicy = {
  maxAttemptsPerWindow: 10,
  windowMs: 60_000,
  maxConcurrentHashesPerAccount: 2,
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "too_many_attempts"; retryAfterSeconds: number }
  | { allowed: false; reason: "too_many_concurrent_hashes" };

export function checkLoginAllowed(
  state: LoginAttemptState,
  policy: RateLimitPolicy,
  nowMs: number,
): RateLimitDecision {
  if (state.concurrentHashes >= policy.maxConcurrentHashesPerAccount) {
    return { allowed: false, reason: "too_many_concurrent_hashes" };
  }

  const windowExpired = nowMs - state.windowStartedAtMs >= policy.windowMs;
  const attempts = windowExpired ? 0 : state.attemptsInWindow;
  if (attempts >= policy.maxAttemptsPerWindow) {
    const elapsed = nowMs - state.windowStartedAtMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((policy.windowMs - elapsed) / 1000));
    return { allowed: false, reason: "too_many_attempts", retryAfterSeconds };
  }

  return { allowed: true };
}

/**
 * Hash islerinin hesap/bolge bazinda dagitimi icin hangi DO shard'inin
 * kullanilacagini belirler. Boylece tum parola hash'leri tek bir Durable
 * Object'e yikilmaz.
 */
export const HASH_SHARD_COUNT = 16;

export function hashShardFor(accountId: string): string {
  // Basit, kararli bir hash (FNV-1a); shard dagilimi icin yeterli.
  let h = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i += 1) {
    h ^= accountId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `hash-gate-${h % HASH_SHARD_COUNT}`;
}

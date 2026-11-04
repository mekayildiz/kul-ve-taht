/**
 * Parola hash kapisi - Durable Object.
 *
 * Neden DO:
 *  - Worker HTTP istegi 10 ms CPU ile sinirli; PBKDF2 (100.000 iterasyon)
 *    bu butceye guvenle sigmaz.
 *  - Durable Object invocation CPU butcesi 30 s'dir (5 dk'ya ayarlanabilir),
 *    bu nedenle parola hash islemi DO icinde calistirilir.
 *
 * Dar bogaz onlemi:
 *  - Hash isleri tek bir DO'ya yikilmaz; hesap kimligine gore HASH_SHARD_COUNT
 *    (16) farkli DO ornegine dagitilir (bkz. auth/rate-limit.ts hashShardFor).
 *  - Her DO, hesap basina eszamanli hash sayisini ve hiz sinirini uygular.
 *
 * Saf is mantigi auth/password.ts ve auth/rate-limit.ts'te tutulur; bu sinif
 * yalnizca Cloudflare Durable Object kabugudur.
 */

import { DurableObject } from "cloudflare:workers";
import { hashPassword, verifyPassword, type PasswordHash } from "../auth/password";
import { checkLoginAllowed, DEFAULT_LOGIN_POLICY, type LoginAttemptState } from "../auth/rate-limit";

export interface HashRequest {
  kind: "hash" | "verify";
  accountId: string;
  password: string;
  stored?: PasswordHash;
}

export interface HashResponse {
  ok: boolean;
  hash?: PasswordHash;
  verified?: boolean;
  error?: "rate_limited" | "concurrent_limit";
}

export class PasswordHashGate extends DurableObject {
  // Shard basina hesap bazli durum: bir shard'i paylasan farkli hesaplar
  // birbirini hiz sinirina takmamali (tasarim: "hesap basina" limit).
  private readonly accounts = new Map<string, LoginAttemptState>();

  private stateFor(accountId: string): LoginAttemptState {
    let state = this.accounts.get(accountId);
    if (!state) {
      state = { attemptsInWindow: 0, concurrentHashes: 0, windowStartedAtMs: 0 };
      this.accounts.set(accountId, state);
    }
    return state;
  }

  private prune(nowMs: number): void {
    if (this.accounts.size <= 1024) return;
    for (const [id, state] of this.accounts) {
      if (state.concurrentHashes === 0 && nowMs - state.windowStartedAtMs >= DEFAULT_LOGIN_POLICY.windowMs) {
        this.accounts.delete(id);
      }
    }
  }

  async handle(req: HashRequest, nowMs: number): Promise<HashResponse> {
    const state = this.stateFor(req.accountId);
    const decision = checkLoginAllowed(state, DEFAULT_LOGIN_POLICY, nowMs);
    if (!decision.allowed) {
      return {
        ok: false,
        error: decision.reason === "too_many_attempts" ? "rate_limited" : "concurrent_limit",
      };
    }

    // Pencere suresi dolduysa sayaci sifirla; ardindan bu denemeyi say.
    if (nowMs - state.windowStartedAtMs >= DEFAULT_LOGIN_POLICY.windowMs) {
      state.windowStartedAtMs = nowMs;
      state.attemptsInWindow = 0;
    }
    state.attemptsInWindow += 1;
    state.concurrentHashes += 1;
    try {
      if (req.kind === "hash") {
        const hash = await hashPassword(req.password);
        return { ok: true, hash };
      }
      if (!req.stored) return { ok: false, error: "concurrent_limit" };
      const verified = await verifyPassword(req.password, req.stored);
      return { ok: true, verified };
    } finally {
      state.concurrentHashes = Math.max(0, state.concurrentHashes - 1);
      this.prune(nowMs);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const req = (await request.json()) as HashRequest;
    const result = await this.handle(req, Date.now());
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

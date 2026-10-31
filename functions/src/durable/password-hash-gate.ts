/**
 * Parola hash kapisi - Durable Object.
 *
 * Neden DO:
 *  - Worker HTTP istegi 10 ms CPU ile sinirli; PBKDF2 600.000 iterasyon bu
 *    butceye sigmaz.
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
  private state: LoginAttemptState = {
    attemptsInWindow: 0,
    concurrentHashes: 0,
    windowStartedAtMs: 0,
  };

  async handle(req: HashRequest, nowMs: number): Promise<HashResponse> {
    const decision = checkLoginAllowed(this.state, DEFAULT_LOGIN_POLICY, nowMs);
    if (!decision.allowed) {
      return {
        ok: false,
        error: decision.reason === "too_many_attempts" ? "rate_limited" : "concurrent_limit",
      };
    }

    this.state.concurrentHashes += 1;
    try {
      if (req.kind === "hash") {
        const hash = await hashPassword(req.password);
        return { ok: true, hash };
      }
      if (!req.stored) return { ok: false, error: "concurrent_limit" };
      const verified = await verifyPassword(req.password, req.stored);
      return { ok: true, verified };
    } finally {
      this.state.concurrentHashes = Math.max(0, this.state.concurrentHashes - 1);
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

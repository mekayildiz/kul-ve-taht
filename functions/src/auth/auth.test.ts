import { describe, expect, it } from "vitest";
import { authorize } from "./authorize";
import { checkLoginAllowed, DEFAULT_LOGIN_POLICY, hashShardFor, HASH_SHARD_COUNT } from "./rate-limit";
import { parseHash, serializeHash, type PasswordHash } from "./password";
import type { SessionPayload } from "./session";

const player: SessionPayload = {
  accountId: "acc-1",
  role: "player",
  issuedAt: 0,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

describe("authorize (D1 icin RLS yerine sunucu tarafli kontrol)", () => {
  it("oturum yoksa reddeder", () => {
    expect(authorize({ session: null, action: "profile:read" })).toEqual({
      allowed: false,
      reason: "no_session",
    });
  });

  it("oyuncu kendi profilini okuyabilir", () => {
    expect(authorize({ session: player, action: "profile:read", ownerAccountId: "acc-1" })).toEqual({
      allowed: true,
      reason: "ok",
    });
  });

  it("baskasinin kaynagina erisimi reddeder (sahiplik)", () => {
    expect(authorize({ session: player, action: "profile:write", ownerAccountId: "acc-2" })).toEqual({
      allowed: false,
      reason: "not_owner",
    });
  });

  it("oyuncu admin islemini yapamaz (rol)", () => {
    expect(authorize({ session: player, action: "admin:any" })).toEqual({
      allowed: false,
      reason: "role_forbidden",
    });
  });

  it("admin admin islemini yapabilir", () => {
    const admin: SessionPayload = { ...player, role: "admin" };
    expect(authorize({ session: admin, action: "admin:any" }).allowed).toBe(true);
  });
});

describe("rate limit ve eszamanli hash kontrolu", () => {
  it("pencere icinde cok fazla denemeyi engeller", () => {
    const decision = checkLoginAllowed(
      { attemptsInWindow: 10, concurrentHashes: 0, windowStartedAtMs: 1000 },
      DEFAULT_LOGIN_POLICY,
      1000 + 500,
    );
    expect(decision).toEqual({ allowed: false, reason: "too_many_attempts", retryAfterSeconds: 60 });
  });

  it("pencere gecince denemeleri sifirlar", () => {
    const decision = checkLoginAllowed(
      { attemptsInWindow: 10, concurrentHashes: 0, windowStartedAtMs: 0 },
      DEFAULT_LOGIN_POLICY,
      DEFAULT_LOGIN_POLICY.windowMs + 1,
    );
    expect(decision).toEqual({ allowed: true });
  });

  it("hesap basina eszamanli hash sinirini uygular", () => {
    const decision = checkLoginAllowed(
      { attemptsInWindow: 0, concurrentHashes: 2, windowStartedAtMs: 0 },
      DEFAULT_LOGIN_POLICY,
      0,
    );
    expect(decision).toEqual({ allowed: false, reason: "too_many_concurrent_hashes" });
  });

  it("hash islerini birden fazla shard'a dagitir (tek DO dar bogazi yok)", () => {
    const shards = new Set<string>();
    for (let i = 0; i < 200; i += 1) shards.add(hashShardFor(`account-${i}`));
    expect(shards.size).toBeGreaterThan(1);
    expect(shards.size).toBeLessThanOrEqual(HASH_SHARD_COUNT);
  });
});

describe("parola hash serilestirme", () => {
  const hash: PasswordHash = {
    algorithm: "pbkdf2-sha256",
    iterations: 600_000,
    saltB64: "AAAA",
    hashB64: "BBBB",
  };

  it("serilestirip tekrar okuyabilir", () => {
    expect(parseHash(serializeHash(hash))).toEqual(hash);
  });

  it("bozuk girdiyi reddeder", () => {
    expect(parseHash("bozuk")).toBeNull();
    expect(parseHash("pbkdf2-sha256$0$AAAA$BBBB")).toBeNull();
    expect(parseHash("md5$10$AAAA$BBBB")).toBeNull();
  });
});

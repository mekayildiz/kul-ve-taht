/**
 * Parola hash'ini Durable Object'e tasiyan koprü (bkz. durable/password-hash-gate.ts).
 *
 * Neden gerekli: PBKDF2 100.000 iterasyon ~15 ms CPU harcar; Worker HTTP
 * istegi Free planda 10 ms CPU ile sinirlidir. Hash islemi DO icinde (30 s
 * CPU butcesi) calistirilir; boylece kayit/giris istegi CPU sinirini asmaz.
 *
 * Hesap kimligine gore 16 shard'a dagitilir (auth/rate-limit.ts hashShardFor).
 */

import { hashShardFor } from "./rate-limit";
import { localHasher, type Hasher } from "./service";
import type { PasswordHash } from "./password";

/** Durable Object namespace'inin bu modul icin gereken minimal yuzu. */
export interface HashGateNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

interface GateResponse {
  ok: boolean;
  hash?: PasswordHash;
  verified?: boolean;
  error?: string;
}

async function callGate(
  stub: { fetch(input: string, init?: RequestInit): Promise<Response> },
  payload: Record<string, unknown>,
): Promise<GateResponse> {
  const res = await stub.fetch("https://password-hash-gate/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as GateResponse;
}

/**
 * Verilen anahtara (hesap/e-posta) karsilik gelen shard DO'su uzerinden hash
 * yapan bir Hasher dondurur. Namespace yoksa (yerel birim testleri) saf
 * yerel hasher'a duser; uretimde binding her zaman tanimlidir.
 */
export function createGateHasher(namespace: HashGateNamespace | undefined, key: string): Hasher {
  if (!namespace) return localHasher;
  const id = namespace.idFromName(hashShardFor(key));
  const stub = namespace.get(id);

  return {
    async hash(password: string): Promise<PasswordHash> {
      const result = await callGate(stub, { kind: "hash", accountId: key, password });
      if (!result.ok || !result.hash) throw new Error("password_hash_gate_failed");
      return result.hash;
    },
    async verify(password: string, stored: PasswordHash): Promise<boolean> {
      const result = await callGate(stub, { kind: "verify", accountId: key, password, stored });
      if (!result.ok) return false;
      return result.verified === true;
    },
  };
}

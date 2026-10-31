/**
 * Test yardimcisi: PASSWORD_HASH_GATE Durable Object namespace taklidi.
 *
 * Gercek DO'yu (PasswordHashGate) bellek icinde ornekler ve `fetch` cagrilarini
 * dogrudan `handle`'a yonlendirir. Boylece Worker kayit/giris yolu, uretimdeki
 * DO uzerinden hash akisini testlerde de gercege yakin sekilde calistirir.
 */

import { PasswordHashGate, type HashRequest } from "../durable/password-hash-gate";
import type { HashGateNamespace } from "../auth/hash-gate";

export function makeFakeHashGateNamespace(): HashGateNamespace {
  const shards = new Map<string, PasswordHashGate>();
  return {
    idFromName: (name: string) => name,
    get: (id: unknown) => {
      const key = String(id);
      let gate = shards.get(key);
      if (!gate) {
        gate = new PasswordHashGate({} as never, {} as never);
        shards.set(key, gate);
      }
      const bound = gate;
      return {
        async fetch(_input: string, init?: RequestInit): Promise<Response> {
          const req = JSON.parse(String(init?.body)) as HashRequest;
          const result = await bound.handle(req, Date.now());
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      };
    },
  };
}

import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "./turnstile";

describe("Turnstile bot korumasi", () => {
  it("sir yoksa koruma kapali: her zaman basarili", async () => {
    expect(await verifyTurnstile(undefined, undefined)).toEqual({ ok: true });
    expect(await verifyTurnstile("", "herhangi")).toEqual({ ok: true });
  });

  it("sir varsa jeton yoksa reddeder", async () => {
    expect(await verifyTurnstile("gizli", undefined)).toEqual({ ok: false, error: "missing_token" });
  });

  it("sir varsa jetonu Cloudflare'e dogrulatir", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push(String(url));
      const body = String(init?.body ?? "");
      const success = body.includes("response=iyi-jeton");
      return new Response(JSON.stringify({ success }), { status: 200 });
    }) as typeof fetch;
    try {
      expect(await verifyTurnstile("gizli", "iyi-jeton")).toEqual({ ok: true });
      expect(await verifyTurnstile("gizli", "kotu-jeton")).toEqual({ ok: false, error: "verification_failed" });
      expect(calls.every((u) => u.includes("challenges.cloudflare.com"))).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("ag hatasinda guvenli tarafta kalir (reddeder)", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ag yok");
    }) as typeof fetch;
    try {
      expect(await verifyTurnstile("gizli", "jeton")).toEqual({ ok: false, error: "network_error" });
    } finally {
      globalThis.fetch = original;
    }
  });
});

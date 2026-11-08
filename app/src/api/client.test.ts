import { describe, expect, it } from "vitest";
import { ApiClient, ApiRequestError } from "./client";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ApiClient", () => {
  it("temel URL sonundaki slash'i temizler", async () => {
    let seen = "";
    const client = new ApiClient({
      baseUrl: "https://api.kulvetah.local/",
      fetchImpl: fakeFetch((url) => {
        seen = url;
        return jsonResponse({ status: "ok", paidFeatures: false });
      }),
    });
    await client.health();
    expect(seen).toBe("https://api.kulvetah.local/api/health");
  });

  it("yerlesim filtresini sorgu parametresine cevirir", async () => {
    let seen = "";
    const client = new ApiClient({
      baseUrl: "https://x",
      fetchImpl: fakeFetch((url) => {
        seen = url;
        return jsonResponse({ count: 0, settlements: [] });
      }),
    });
    await client.settlements({ kingdom: "varkhenn", kind: "castle" });
    expect(seen).toBe("https://x/api/world/settlements?kingdom=varkhenn&kind=castle");
  });

  it("hata govdesindeki kodu ApiRequestError'a tasir", async () => {
    const client = new ApiClient({
      baseUrl: "https://x",
      fetchImpl: fakeFetch(() =>
        jsonResponse({ error: { code: "throttled", message: "sinirlandi" } }, 429),
      ),
    });
    await expect(client.worldSummary()).rejects.toBeInstanceOf(ApiRequestError);
    await expect(client.worldSummary()).rejects.toMatchObject({ status: 429, code: "throttled" });
  });

  it("hata govdesindeki reason alanini ApiRequestError'a tasir", async () => {
    const client = new ApiClient({
      baseUrl: "https://x",
      fetchImpl: fakeFetch(() =>
        jsonResponse({ error: { code: "invalid_action", message: "olmadi", reason: "no_feed" } }, 400),
      ),
    });
    await expect(client.worldSummary()).rejects.toMatchObject({ code: "invalid_action", reason: "no_feed" });
  });

  it("kimlik dogrulama basligini gonderir", async () => {
    let authHeader: string | undefined;
    const client = new ApiClient({
      baseUrl: "https://x",
      fetchImpl: fakeFetch((_url, init) => {
        authHeader = new Headers(init?.headers).get("authorization") ?? undefined;
        return jsonResponse({ accountId: "a1", role: "player" });
      }),
    });
    const me = await client.me("belirtec-123");
    expect(authHeader).toBe("Bearer belirtec-123");
    expect(me.accountId).toBe("a1");
  });

  it("JSON olmayan hata govdesini guvenli sekilde ele alir", async () => {
    const client = new ApiClient({
      baseUrl: "https://x",
      fetchImpl: fakeFetch(() => new Response("sunucu hatasi", { status: 500 })),
    });
    await expect(client.worldTime()).rejects.toMatchObject({ status: 500, code: "unknown" });
  });
});

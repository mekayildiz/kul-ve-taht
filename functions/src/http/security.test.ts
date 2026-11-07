/**
 * Guvenlik basliklari ve HTTPS zorlamasi testleri (tasarim belgesi 21.1).
 *
 * Amac: Yanitlarin tarayici sertlestirme basliklarini tasidigini ve duz HTTP
 * isteklerinin HTTPS'e yonlendirildigini KANITLAMAK. CSP'de betik icin
 * inline'a izin VERILMEDIGI de dogrulanir (XSS yuzeyi daraltilir).
 */

import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  httpsRedirect,
  withSecurity,
} from "./security";

describe("Guvenlik basliklari (E21.1)", () => {
  it("yanita tum guvenlik basliklarini ekler", async () => {
    const res = withSecurity(new Response("ok", { status: 200 }));
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("mevcut basliklari (content-type) korur", () => {
    const res = withSecurity(
      new Response("{}", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }),
    );
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("durum kodunu ve govdeyi degistirmez", async () => {
    const res = withSecurity(new Response("govde", { status: 418 }));
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("govde");
  });

  it("CSP betik icin inline'a izin vermez, Turnstile kaynagini acar", () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(CONTENT_SECURITY_POLICY).toContain("https://challenges.cloudflare.com");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  it("HSTS bir yil ve alt alan adlarini kapsar", () => {
    expect(SECURITY_HEADERS["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
  });
});

describe("HTTPS zorlamasi (E21.1)", () => {
  it("https istegi yonlendirilmez", () => {
    const request = new Request("https://kulvetah.local/api/health");
    expect(httpsRedirect(request)).toBeNull();
  });

  it("x-forwarded-proto: http istegini 301 ile https'e tasir", () => {
    const request = new Request("http://kulvetaht.dpdns.org/oyun?x=1", {
      headers: { "x-forwarded-proto": "http" },
    });
    const res = httpsRedirect(request);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(301);
    expect(res!.headers.get("location")).toBe("https://kulvetaht.dpdns.org/oyun?x=1");
  });

  it("x-forwarded-proto: https istegini yonlendirmez", () => {
    const request = new Request("http://kulvetaht.dpdns.org/api/health", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(httpsRedirect(request)).toBeNull();
  });

  it("baslik yoksa yonlendirmez (yerel gelistirme http uzerinden calisir)", () => {
    // `wrangler dev` yerelde x-forwarded-proto set etmez; istek http semasinda
    // gelse bile yonlendirilmemeli, aksi halde yerel API erisilemez olur.
    const request = new Request("http://localhost:8787/api/health");
    expect(httpsRedirect(request)).toBeNull();
  });
});

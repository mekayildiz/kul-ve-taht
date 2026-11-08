import { describe, expect, it } from "vitest";
import { sendEmail, verificationEmail } from "./brevo";

describe("Brevo e-posta gonderimi", () => {
  it("anahtar yoksa no-op (skipped) doner", async () => {
    expect(await sendEmail({}, { to: "a@b.tr", subject: "x", html: "<p>x</p>" })).toEqual({ ok: true, skipped: true });
  });

  it("anahtar varsa API'ye gonderir", async () => {
    const original = globalThis.fetch;
    const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      });
      return new Response("{}", { status: 201 });
    }) as typeof fetch;
    try {
      const result = await sendEmail(
        { apiKey: "gizli", sender: "oyun@ornek.tr" },
        { to: "oyuncu@ornek.tr", subject: "Dogrulama", html: "<p>123</p>" },
      );
      expect(result).toEqual({ ok: true });
      expect(calls[0]!.url).toBe("https://api.brevo.com/v3/smtp/email");
      expect(calls[0]!.headers["api-key"]).toBe("gizli");
      expect((calls[0]!.body as { to: { email: string }[] }).to[0]!.email).toBe("oyuncu@ornek.tr");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("HTTP hatasini bildirir", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    try {
      expect(await sendEmail({ apiKey: "k", sender: "s@t.tr" }, { to: "a@b.tr", subject: "x", html: "y" })).toEqual({
        ok: false,
        error: "http_401",
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("dogrulama e-postasi kodu icerir", () => {
    expect(verificationEmail("123456")).toContain("123456");
  });
});

import { describe, expect, it } from "vitest";
import { registerAccount, loginAccount, PASSWORD_MIN_LENGTH } from "./service";
import { createTestDb } from "../test-support/sqlite-harness";
import { queryOne } from "../db/client";
import { verifySessionToken } from "./session";

const SECRET = "test-oturum-secret";

describe("kimlik dogrulama servisi", () => {
  it("gecerli kayit sonrasi hesap olusturur ve parolayi hash'ler", async () => {
    const db = createTestDb();
    const result = await registerAccount(db, { email: "oyuncu@valedorn.tr", password: "cok-guclu-parola-1" });
    expect(result.ok).toBe(true);
    const row = await queryOne<{ password_hash: string; locale: string; role: string }>(
      db,
      "SELECT password_hash, locale, role FROM accounts",
    );
    expect(row?.password_hash.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(row?.password_hash).not.toContain("cok-guclu-parola-1");
    expect(row?.locale).toBe("tr");
    expect(row?.role).toBe("player");
  });

  it("gecersiz e-postayi reddeder", async () => {
    const db = createTestDb();
    const result = await registerAccount(db, { email: "gecersiz", password: "cok-guclu-parola-1" });
    expect(result).toEqual({ ok: false, error: "invalid_email" });
  });

  it("kisa parolayi reddeder", async () => {
    const db = createTestDb();
    const result = await registerAccount(db, { email: "a@b.tr", password: "kisa" });
    expect(result).toEqual({ ok: false, error: "weak_password" });
    expect("kisa".length).toBeLessThan(PASSWORD_MIN_LENGTH);
  });

  it("ayni e-posta ile ikinci kayda izin vermez", async () => {
    const db = createTestDb();
    await registerAccount(db, { email: "tek@valedorn.tr", password: "cok-guclu-parola-1" });
    const second = await registerAccount(db, { email: "tek@valedorn.tr", password: "baska-parola-22" });
    expect(second).toEqual({ ok: false, error: "email_taken" });
  });

  it("dogru parola ile giris yapar ve oturum belirteci uretir", async () => {
    const db = createTestDb();
    const reg = await registerAccount(db, { email: "giris@valedorn.tr", password: "cok-guclu-parola-1" });
    expect(reg.ok).toBe(true);
    const login = await loginAccount(db, { email: "giris@valedorn.tr", password: "cok-guclu-parola-1" }, SECRET);
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const payload = await verifySessionToken(login.token, SECRET, Date.now());
    expect(payload?.accountId).toBe(reg.ok ? reg.accountId : "");
    expect(payload?.role).toBe("player");
  });

  it("yanlis parolayi reddeder", async () => {
    const db = createTestDb();
    await registerAccount(db, { email: "x@valedorn.tr", password: "cok-guclu-parola-1" });
    const login = await loginAccount(db, { email: "x@valedorn.tr", password: "yanlis-parola-99" }, SECRET);
    expect(login).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("olmayan hesap icin ayni hatayi doner (kullanici kesfi engellenir)", async () => {
    const db = createTestDb();
    const login = await loginAccount(db, { email: "yok@valedorn.tr", password: "cok-guclu-parola-1" }, SECRET);
    expect(login).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("askiya alinmis hesabin girisini engeller", async () => {
    const db = createTestDb();
    await registerAccount(db, { email: "ban@valedorn.tr", password: "cok-guclu-parola-1" });
    await db.prepare("UPDATE accounts SET status = 'suspended'").run();
    const login = await loginAccount(db, { email: "ban@valedorn.tr", password: "cok-guclu-parola-1" }, SECRET);
    expect(login).toEqual({ ok: false, error: "suspended" });
  });

  it("giris sonrasi oturum kaydini D1'de tutar", async () => {
    const db = createTestDb();
    await registerAccount(db, { email: "s@valedorn.tr", password: "cok-guclu-parola-1" });
    await loginAccount(db, { email: "s@valedorn.tr", password: "cok-guclu-parola-1" }, SECRET);
    const sessions = await db.prepare("SELECT COUNT(*) AS c FROM sessions").first<{ c: number }>();
    expect(sessions?.c).toBe(1);
  });

  it("kurcalanmis belirteci reddeder (imza dogrulamasi)", async () => {
    const db = createTestDb();
    await registerAccount(db, { email: "t@valedorn.tr", password: "cok-guclu-parola-1" });
    const login = await loginAccount(db, { email: "t@valedorn.tr", password: "cok-guclu-parola-1" }, SECRET);
    if (!login.ok) throw new Error("giris basarisiz");
    const [body] = login.token.split(".");
    const forged = `${body}.sahte-imza`;
    const payload = await verifySessionToken(forged, SECRET, Date.now());
    expect(payload).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { execute } from "../db/client";
import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "./totp";
import { decryptSecret, encryptSecret } from "./secret-box";
import {
  confirmTotpSetup,
  consumeRecoveryCode,
  disableTotp,
  issueRecoveryCodes,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  startTotpSetup,
} from "./security";
import { loginAccount, registerAccount } from "./service";

const SECRET_KEY = "test-anahtar-1234567890";

async function makeAccount(db: ReturnType<typeof createTestDb>, email = "guvenlik@ornek.tr"): Promise<string> {
  const result = await registerAccount(db, { email, password: "cok-guclu-parola-1" });
  if (!result.ok) throw new Error("kayit basarisiz");
  return result.accountId;
}

describe("TOTP cekirdegi (RFC 6238)", () => {
  it("base32 gidis-donus", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 250, 200, 100]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("RFC 6238 test vektoru (SHA-1, T=59) 8 haneli kod uretir", async () => {
    const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
    const code = await totpCode(secret, Math.floor(59 / 30));
    expect(code).toBe("287082");
  });

  it("verifyTotp dogru kodu kabul, yanlis kodu reddeder", async () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = await totpCode(secret, Math.floor(now / 1000 / 30));
    expect(await verifyTotp(secret, code, now)).toBe(true);
    expect(await verifyTotp(secret, "000000", now)).toBe(false);
    expect(await verifyTotp(secret, "abc", now)).toBe(false);
  });

  it("saat kaymasini ±1 pencere tolere eder", async () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const prev = await totpCode(secret, Math.floor(now / 1000 / 30) - 1);
    expect(await verifyTotp(secret, prev, now)).toBe(true);
  });

  it("otpauth URI uretir", () => {
    const uri = otpauthUri("ABCDEF", "oyuncu@ornek.tr");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=ABCDEF");
  });
});

describe("sifreleme kutusu (AES-GCM)", () => {
  it("sifreler ve cozer", async () => {
    const enc = await encryptSecret("gizli-sir", SECRET_KEY);
    expect(enc).not.toContain("gizli-sir");
    expect(await decryptSecret(enc, SECRET_KEY)).toBe("gizli-sir");
  });

  it("yanlis anahtarla cozmez", async () => {
    const enc = await encryptSecret("gizli-sir", SECRET_KEY);
    expect(await decryptSecret(enc, "baska-anahtar")).toBeNull();
  });
});

describe("hesap guvenligi servisi", () => {
  it("2FA kurulumu, dogrulama ve kurtarma kodlari", async () => {
    const db = createTestDb();
    const accountId = await makeAccount(db);
    const start = await startTotpSetup(db, accountId, "guvenlik@ornek.tr", SECRET_KEY);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const code = await totpCode(start.secret, Math.floor(Date.now() / 1000 / 30));
    const confirm = await confirmTotpSetup(db, accountId, code, SECRET_KEY);
    expect(confirm.ok).toBe(true);
    if (!confirm.ok) return;
    expect(confirm.recoveryCodes).toHaveLength(10);
  });

  it("2FA acikken giris ikinci faktor ister", async () => {
    const db = createTestDb();
    const accountId = await makeAccount(db);
    const start = await startTotpSetup(db, accountId, "guvenlik@ornek.tr", SECRET_KEY);
    if (!start.ok) return;
    await confirmTotpSetup(db, accountId, await totpCode(start.secret, Math.floor(Date.now() / 1000 / 30)), SECRET_KEY);

    const noFactor = await loginAccount(db, { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1" }, SECRET_KEY);
    expect(noFactor).toMatchObject({ ok: false, error: "totp_required" });

    const badFactor = await loginAccount(
      db,
      { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1", totpCode: "000000" },
      SECRET_KEY,
    );
    expect(badFactor).toMatchObject({ ok: false, error: "invalid_totp" });

    const goodFactor = await loginAccount(
      db,
      { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1", totpCode: await totpCode(start.secret, Math.floor(Date.now() / 1000 / 30)) },
      SECRET_KEY,
    );
    expect(goodFactor.ok).toBe(true);
  });

  it("kurtarma kodu ile giris (tek kullanimlik)", async () => {
    const db = createTestDb();
    const accountId = await makeAccount(db);
    const codes = await issueRecoveryCodes(db, accountId);
    await execute(db, "UPDATE accounts SET totp_enabled = 1, totp_secret = ? WHERE id = ?", await encryptSecret("X", SECRET_KEY), accountId);
    const first = await loginAccount(
      db,
      { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1", recoveryCode: codes[0]! },
      SECRET_KEY,
    );
    expect(first.ok).toBe(true);
    expect(await consumeRecoveryCode(db, accountId, codes[0]!)).toBe(false);
  });

  it("2FA kapatma kodu dogrular", async () => {
    const db = createTestDb();
    const accountId = await makeAccount(db);
    const start = await startTotpSetup(db, accountId, "guvenlik@ornek.tr", SECRET_KEY);
    if (!start.ok) return;
    await confirmTotpSetup(db, accountId, await totpCode(start.secret, Math.floor(Date.now() / 1000 / 30)), SECRET_KEY);
    expect(await disableTotp(db, accountId, "000000", SECRET_KEY)).toMatchObject({ ok: false, error: "invalid_code" });
    expect(await disableTotp(db, accountId, await totpCode(start.secret, Math.floor(Date.now() / 1000 / 30)), SECRET_KEY)).toMatchObject({ ok: true });
  });

  it("oturum listeler ve iptal eder", async () => {
    const db = createTestDb();
    await makeAccount(db);
    const login = await loginAccount(db, { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1" }, SECRET_KEY);
    if (!login.ok) return;
    const second = await loginAccount(db, { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1" }, SECRET_KEY);
    if (!second.ok) return;

    const sessions = await listSessions(db, login.payload.accountId, second.token);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);

    const revoked = await revokeOtherSessions(db, second.payload.accountId, second.token);
    expect(revoked).toBe(1);
    const after = await listSessions(db, second.payload.accountId, second.token);
    expect(after).toHaveLength(1);
  });

  it("tek oturumu iptal eder", async () => {
    const db = createTestDb();
    await makeAccount(db);
    const login = await loginAccount(db, { email: "guvenlik@ornek.tr", password: "cok-guclu-parola-1" }, SECRET_KEY);
    if (!login.ok) return;
    const sessions = await listSessions(db, login.payload.accountId, login.token);
    expect(await revokeSession(db, login.payload.accountId, sessions[0]!.id)).toBe(true);
    expect(await listSessions(db, login.payload.accountId, login.token)).toHaveLength(0);
  });
});

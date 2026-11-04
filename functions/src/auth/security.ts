/**
 * Hesap guvenligi servisi: oturum yonetimi, TOTP 2FA ve kurtarma kodlari.
 *
 *  - Oturumlar: token'in yalnizca SHA-256 ozeti saklanir; kullanici kendi
 *    oturumlarini listeleyip digerlerini iptal edebilir.
 *  - 2FA: TOTP sirri AES-GCM ile sifrelenip saklanir; etkinlestirme iki adimli
 *    (setup -> verify) ve kurtarma kodlari hash'lenerek tutulur.
 *  - Kurtarma kodlari: tek kullanimlik; kullanimda `used_at` isaretlenir.
 *
 * Tum islemler SUNUCU tarafinda; istemci hicbir sirri uretmez (belge 21.1).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { constantTimeEqual } from "./constant-time";
import { decryptSecret, encryptSecret } from "./secret-box";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";
import { sessionTokenHash } from "./session";

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SessionRow {
  id: string;
  issuedAt: number;
  expiresAt: number;
  userAgent: string | null;
  /** Bu istekte kullanilan oturum mu? (iptal dugmesini gizlemek icin) */
  current: boolean;
}

/** Bir hesabin suresi dolmamis oturumlarini listeler. */
export async function listSessions(
  db: SqlDatabase,
  accountId: string,
  currentToken: string,
  nowMs = Date.now(),
): Promise<SessionRow[]> {
  const currentHash = await sessionTokenHash(currentToken);
  const rows = await queryAll<{ id: string; token_hash: string; issued_at: number; expires_at: number; user_agent: string | null }>(
    db,
    "SELECT id, token_hash, issued_at, expires_at, user_agent FROM sessions WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY issued_at DESC",
    accountId,
    nowMs,
  );
  return rows.map((r) => ({
    id: r.id,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    userAgent: r.user_agent,
    current: r.token_hash === currentHash,
  }));
}

/** Bir oturumu iptal eder (sahiplik dogrulanir). */
export async function revokeSession(db: SqlDatabase, accountId: string, sessionId: string, nowMs = Date.now()): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    "SELECT id FROM sessions WHERE id = ? AND account_id = ? AND revoked_at IS NULL",
    sessionId,
    accountId,
  );
  if (!row) return false;
  await execute(db, "UPDATE sessions SET revoked_at = ? WHERE id = ?", nowMs, sessionId);
  return true;
}

/** Kullanicinin MEVCUT oturumu haric tum oturumlarini iptal eder. */
export async function revokeOtherSessions(
  db: SqlDatabase,
  accountId: string,
  currentToken: string,
  nowMs = Date.now(),
): Promise<number> {
  const currentHash = await sessionTokenHash(currentToken);
  const rows = await queryAll<{ id: string }>(
    db,
    "SELECT id FROM sessions WHERE account_id = ? AND revoked_at IS NULL AND token_hash != ?",
    accountId,
    currentHash,
  );
  await execute(
    db,
    "UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL AND token_hash != ?",
    nowMs,
    accountId,
    currentHash,
  );
  return rows.length;
}

export type TotpError = "not_found" | "invalid_code" | "already_enabled" | "not_enabled";

/** 2FA kurulumunu baslatir: sir uretir, sifreli saklar ve otpauth URI doner. */
export async function startTotpSetup(
  db: SqlDatabase,
  accountId: string,
  email: string,
  secretKey: string,
  nowMs = Date.now(),
): Promise<{ ok: true; secret: string; uri: string } | { ok: false; error: TotpError }> {
  const account = await queryOne<{ totp_enabled: number }>(db, "SELECT totp_enabled FROM accounts WHERE id = ?", accountId);
  if (!account) return { ok: false, error: "not_found" };
  if (account.totp_enabled === 1) return { ok: false, error: "already_enabled" };
  const secret = generateTotpSecret();
  const encrypted = await encryptSecret(secret, secretKey);
  await execute(db, "UPDATE accounts SET totp_secret = ?, updated_at = ? WHERE id = ?", encrypted, nowMs, accountId);
  return { ok: true, secret, uri: otpauthUri(secret, email) };
}

/** Kurulumu tamamlar: ilk kodu dogrular, 2FA'yi acar ve kurtarma kodlari uretir. */
export async function confirmTotpSetup(
  db: SqlDatabase,
  accountId: string,
  code: string,
  secretKey: string,
  nowMs = Date.now(),
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: TotpError }> {
  const account = await queryOne<{ totp_secret: string | null; totp_enabled: number }>(
    db,
    "SELECT totp_secret, totp_enabled FROM accounts WHERE id = ?",
    accountId,
  );
  if (!account) return { ok: false, error: "not_found" };
  if (account.totp_enabled === 1) return { ok: false, error: "already_enabled" };
  if (!account.totp_secret) return { ok: false, error: "not_enabled" };
  const secret = await decryptSecret(account.totp_secret, secretKey);
  if (!secret) return { ok: false, error: "not_enabled" };
  if (!(await verifyTotp(secret, code, nowMs))) return { ok: false, error: "invalid_code" };

  await execute(db, "UPDATE accounts SET totp_enabled = 1, updated_at = ? WHERE id = ?", nowMs, accountId);
  const recoveryCodes = await issueRecoveryCodes(db, accountId, nowMs);
  return { ok: true, recoveryCodes };
}

/** 2FA'yi kapatir (mevcut kodu gerektirir). */
export async function disableTotp(
  db: SqlDatabase,
  accountId: string,
  code: string,
  secretKey: string,
  nowMs = Date.now(),
): Promise<{ ok: true } | { ok: false; error: TotpError }> {
  const account = await queryOne<{ totp_secret: string | null; totp_enabled: number }>(
    db,
    "SELECT totp_secret, totp_enabled FROM accounts WHERE id = ?",
    accountId,
  );
  if (!account) return { ok: false, error: "not_found" };
  if (account.totp_enabled !== 1 || !account.totp_secret) return { ok: false, error: "not_enabled" };
  const secret = await decryptSecret(account.totp_secret, secretKey);
  if (!secret || !(await verifyTotp(secret, code, nowMs))) return { ok: false, error: "invalid_code" };
  await execute(db, "UPDATE accounts SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?", nowMs, accountId);
  await execute(db, "DELETE FROM account_recovery_codes WHERE account_id = ?", accountId);
  return { ok: true };
}

/** TOTP sirrini cozer (giris sirasinda dogrulama icin). */
export async function resolveTotpSecret(db: SqlDatabase, accountId: string, secretKey: string): Promise<string | null> {
  const row = await queryOne<{ totp_secret: string | null; totp_enabled: number }>(
    db,
    "SELECT totp_secret, totp_enabled FROM accounts WHERE id = ?",
    accountId,
  );
  if (!row || row.totp_enabled !== 1 || !row.totp_secret) return null;
  return decryptSecret(row.totp_secret, secretKey);
}

/** 10 adet tek kullanimlik kurtarma kodu uretir ve hash'leyerek saklar. */
export async function issueRecoveryCodes(db: SqlDatabase, accountId: string, nowMs = Date.now()): Promise<string[]> {
  await execute(db, "DELETE FROM account_recovery_codes WHERE account_id = ?", accountId);
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const code = `${raw.slice(0, 6)}-${raw.slice(6)}`;
    codes.push(code);
    await execute(
      db,
      "INSERT INTO account_recovery_codes (id, account_id, code_hash, created_at) VALUES (?,?,?,?)",
      crypto.randomUUID(),
      accountId,
      await sha256Hex(code),
      nowMs,
    );
  }
  return codes;
}

/** Kurtarma kodunu tek kullanimlik olarak dogrular. */
export async function consumeRecoveryCode(db: SqlDatabase, accountId: string, code: string, nowMs = Date.now()): Promise<boolean> {
  const normalized = code.trim().toLowerCase();
  const rows = await queryAll<{ id: string; code_hash: string }>(
    db,
    "SELECT id, code_hash FROM account_recovery_codes WHERE account_id = ? AND used_at IS NULL",
    accountId,
  );
  const hash = await sha256Hex(normalized);
  for (const row of rows) {
    if (constantTimeEqual(new TextEncoder().encode(row.code_hash), new TextEncoder().encode(hash))) {
      await execute(db, "UPDATE account_recovery_codes SET used_at = ? WHERE id = ?", nowMs, row.id);
      return true;
    }
  }
  return false;
}

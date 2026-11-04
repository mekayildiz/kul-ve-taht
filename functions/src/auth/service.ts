/**
 * Kimlik dogrulama servisi: kayit ve giris.
 *
 * Guvenlik (tasarim belgesi 21.1):
 *  - Parolalar PBKDF2-HMAC-SHA256 ile hash'lenir; duz metin ASLA saklanmaz.
 *  - Hash islemi uretimde Durable Object icinde yapilir (10 ms CPU siniri);
 *    servis, hash fonksiyonunu disaridan alir (test edilebilirlik).
 *  - Ayni e-posta ile ikinci hesap olusturulamaz.
 *  - Giris denemeleri hiz sinirlidir (auth/rate-limit.ts).
 *  - Oturum belirtecleri HMAC ile imzalanir; sunucu tarafinda saklanir.
 */

import { type SqlDatabase } from "../db/client";
import { queryOne, execute } from "../db/client";
import { hashPassword, verifyPassword, serializeHash, parseHash, type PasswordHash } from "./password";
import { createSessionToken, SESSION_TTL_MS, sessionTokenHash, type SessionPayload } from "./session";

export interface Hasher {
  hash(password: string): Promise<PasswordHash>;
  verify(password: string, stored: PasswordHash): Promise<boolean>;
}

/** Varsayilan: hash islemini dogrudan bu ortamda yapar (DO icinde cagrilir). */
export const localHasher: Hasher = {
  hash: hashPassword,
  verify: verifyPassword,
};

export const PASSWORD_MIN_LENGTH = 12;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterResult =
  | { ok: true; accountId: string }
  | { ok: false; error: "invalid_email" | "weak_password" | "email_taken" };

export type LoginResult =
  | { ok: true; token: string; payload: SessionPayload }
  | { ok: false; error: "invalid_credentials" | "suspended" | "totp_required" | "invalid_totp" };

export interface RegisterInput {
  email: string;
  password: string;
  locale?: "tr" | "en";
}

export async function registerAccount(
  db: SqlDatabase,
  input: RegisterInput,
  hasher: Hasher = localHasher,
  nowMs: number = Date.now(),
): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "invalid_email" };
  if (input.password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: "weak_password" };

  const existing = await queryOne<{ id: string }>(db, "SELECT id FROM accounts WHERE email = ?", email);
  if (existing) return { ok: false, error: "email_taken" };

  const accountId = crypto.randomUUID();
  const passwordHash = serializeHash(await hasher.hash(input.password));
  await execute(
    db,
    `INSERT INTO accounts (id, email, password_hash, role, locale, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    accountId,
    email,
    passwordHash,
    "player",
    input.locale ?? "tr",
    "active",
    nowMs,
    nowMs,
  );
  return { ok: true, accountId };
}

export interface LoginInput {
  email: string;
  password: string;
  /** TOTP kodu (2FA aciksa zorunlu). */
  totpCode?: string;
  /** Kurtarma kodu (2FA kodu yerine). */
  recoveryCode?: string;
  /** Oturum listesinde gosterilir (cihaz tanima). */
  userAgent?: string;
}

export async function loginAccount(
  db: SqlDatabase,
  input: LoginInput,
  secret: string,
  hasher: Hasher = localHasher,
  nowMs: number = Date.now(),
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const account = await queryOne<{
    id: string;
    password_hash: string;
    role: "player" | "moderator" | "admin";
    status: string;
    totp_enabled: number;
  }>(db, "SELECT id, password_hash, role, status, totp_enabled FROM accounts WHERE email = ?", email);

  // Kullanici yoksa da hash dogrulama maliyeti benzer olsun diye sabit yanit.
  if (!account) return { ok: false, error: "invalid_credentials" };

  const stored = parseHash(account.password_hash);
  if (!stored) return { ok: false, error: "invalid_credentials" };

  const valid = await hasher.verify(input.password, stored);
  if (!valid) return { ok: false, error: "invalid_credentials" };
  if (account.status !== "active") return { ok: false, error: "suspended" };

  // Iki adimli dogrulama (TOTP) aciksa ikinci faktor zorunludur.
  if (account.totp_enabled === 1) {
    const { resolveTotpSecret, consumeRecoveryCode } = await import("./security");
    const { verifyTotp } = await import("./totp");
    const totpSecret = await resolveTotpSecret(db, account.id, secret);
    let secondFactorOk = false;
    if (input.recoveryCode) {
      secondFactorOk = await consumeRecoveryCode(db, account.id, input.recoveryCode, nowMs);
    } else if (input.totpCode && totpSecret) {
      secondFactorOk = await verifyTotp(totpSecret, input.totpCode, nowMs);
    }
    if (!input.totpCode && !input.recoveryCode) return { ok: false, error: "totp_required" };
    if (!secondFactorOk) return { ok: false, error: "invalid_totp" };
  }

  const payload: SessionPayload = {
    accountId: account.id,
    role: account.role,
    issuedAt: nowMs,
    expiresAt: nowMs + SESSION_TTL_MS,
  };
  const token = await createSessionToken(payload, secret);

  // Sunucu tarafi oturum kaydi (iptal edilebilirlik icin). Ham belirtec
  // saklanmaz; yalnizca imzanin SHA-256 ozeti tutulur.
  await execute(
    db,
    "INSERT INTO sessions (id, account_id, token_hash, issued_at, expires_at, user_agent) VALUES (?,?,?,?,?,?)",
    crypto.randomUUID(),
    account.id,
    await sessionTokenHash(token),
    payload.issuedAt,
    payload.expiresAt,
    input.userAgent?.slice(0, 200) ?? null,
  );

  return { ok: true, token, payload };
}

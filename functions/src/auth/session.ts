/**
 * Oturum belirteci - HMAC-SHA256 imzali, opak govde + imza.
 * Secret Workers Secret olarak tutulur (koda gomulmez).
 */

export interface SessionPayload {
  accountId: string;
  role: "player" | "moderator" | "admin";
  issuedAt: number;
  expiresAt: number;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeString(value: string): string {
  return b64url(new TextEncoder().encode(value));
}

function b64urlDecodeToString(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(normalized);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64urlEncodeString(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(signature)}`;
}

export async function verifySessionToken(token: string, secret: string, nowMs: number): Promise<SessionPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const key = await hmacKey(secret);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const provided = Uint8Array.from(b64urlDecodeToString(signature), (c) => c.charCodeAt(0));
  if (provided.length !== expected.length) return null;
  if (!crypto.subtle.timingSafeEqual(provided, expected)) return null;

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(b64urlDecodeToString(body)) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= nowMs) return null;
  return parsed;
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 saat

/**
 * Kucuk sifreleme kutusu (AES-GCM) - TOTP sirrini D1'de duz metin tutmamak icin.
 *
 * Anahtar `SESSION_SECRET`'ten SHA-256 ile turetilir; ayri bir sir gerekmez.
 * Format: base64url(iv[12] || ciphertext).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext)));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return b64url(combined);
}

export async function decryptSecret(payload: string, secret: string): Promise<string | null> {
  try {
    const combined = fromB64url(payload);
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const key = await deriveKey(secret);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return decoder.decode(plain);
  } catch {
    return null;
  }
}

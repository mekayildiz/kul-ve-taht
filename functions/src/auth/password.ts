/**
 * Parola hash - PBKDF2-HMAC-SHA256 (Web Crypto, Workers yerlesik).
 *
 * Neden PBKDF2:
 *  - Cloudflare Workers'ta argon2 DESTEKLENMEZ (node:crypto: "argon2 and
 *    argon2Sync are not supported"). bcrypt yerlesik degil.
 *  - Web Crypto PBKDF2'yi yerel olarak destekler ve JS'ten belirgin sekilde
 *    hizlidir.
 *
 * CPU notu: PBKDF2 iterasyon sayisi CPU maliyetini belirler. Worker HTTP
 * istegi 10 ms CPU ile sinirli oldugu icin hash islemi Durable Object icinde
 * (30 s CPU butcesi) calistirilir; bkz. src/durable/password-hash-gate.ts.
 *
 * ITERATIONS asgari degeri OWASP onerisine yakindir ve performans testi
 * (E1.3) ile DO icinde dogrulanmadan dusurulemez.
 */

export const PBKDF2 = {
  name: "PBKDF2" as const,
  hash: "SHA-256" as const,
  iterations: 600_000,
  keyLengthBytes: 32,
  saltBytes: 16,
};

export interface PasswordHash {
  algorithm: "pbkdf2-sha256";
  iterations: number;
  saltB64: string;
  hashB64: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: PBKDF2.hash, salt, iterations },
    keyMaterial,
    PBKDF2.keyLengthBytes * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2.saltBytes));
  const derived = await deriveBits(password, salt, PBKDF2.iterations);
  return {
    algorithm: "pbkdf2-sha256",
    iterations: PBKDF2.iterations,
    saltB64: toBase64(salt),
    hashB64: toBase64(derived),
  };
}

/** Sabit zamanli karsilastirma; zamanlama sizintisini onler. */
export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const salt = fromBase64(stored.saltB64);
  const expected = fromBase64(stored.hashB64);
  const actual = await deriveBits(password, salt, stored.iterations);
  if (actual.length !== expected.length) return false;
  return crypto.subtle.timingSafeEqual(actual, expected);
}

export function serializeHash(hash: PasswordHash): string {
  return `${hash.algorithm}$${hash.iterations}$${hash.saltB64}$${hash.hashB64}`;
}

export function parseHash(value: string): PasswordHash | null {
  const parts = value.split("$");
  if (parts.length !== 4) return null;
  const [algorithm, iterationsRaw, saltB64, hashB64] = parts;
  if (algorithm !== "pbkdf2-sha256" || !iterationsRaw || !saltB64 || !hashB64) return null;
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return null;
  return { algorithm: "pbkdf2-sha256", iterations, saltB64, hashB64 };
}

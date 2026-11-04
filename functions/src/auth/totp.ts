/**
 * TOTP (RFC 6238) iki adimli dogrulama cekirdegi.
 *
 * Neden TOTP: e-posta kodundan bagimsizdir, alan adi/e-posta saglayicisi
 * gerektirmez ve tamamen 0 TL icinde calisir (Web Crypto HMAC-SHA1).
 * Sirlar D1'de duz metin TUTULMAZ; uygulama katmaninda AES-GCM ile sifrelenir
 * (bkz. auth/secret-box.ts).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 20 rastgele bayti RFC 4648 base32 (padding'siz) kodlar. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("gecersiz base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** Yeni TOTP sirri uretir (base32, 32 karakter = 160 bit). */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Verilen zaman dilimi icin TOTP kodu uretir (RFC 6238, SHA-1). */
export async function totpCode(secretBase32: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secretBase32),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const b0 = mac[offset] ?? 0;
  const b1 = mac[offset + 1] ?? 0;
  const b2 = mac[offset + 2] ?? 0;
  const b3 = mac[offset + 3] ?? 0;
  const bin = ((b0 & 0x7f) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff);
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Kullanici kodunu dogrular. Saat kaymasini tolere etmek icin bir onceki ve
 * bir sonraki pencere de kabul edilir (±1 adim = ±30 sn).
 */
export async function verifyTotp(secretBase32: string, code: string, nowMs: number): Promise<boolean> {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  for (const delta of [-1, 0, 1]) {
    if ((await totpCode(secretBase32, counter + delta)) === normalized) return true;
  }
  return false;
}

/** Authenticator uygulamalari icin otpauth:// URI'si. */
export function otpauthUri(secretBase32: string, label: string, issuer = "Kul ve Taht"): string {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?${params.toString()}`;
}

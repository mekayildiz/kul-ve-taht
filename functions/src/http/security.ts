/**
 * Guvenlik basliklari ve HTTPS zorlamasi (tasarim belgesi 21.1).
 *
 * Mimari not: Workers statik varliklari, varsayilan yonlendirmede Worker
 * betiginden ONCE sunulur. Bu yuzden Worker'in ekledigi basliklar HTML ve
 * varlik yanitlarina ULASMAZ. Ayni basliklar `app/public/_headers` ile
 * statik yanitlara da uygulanir. Iki taraf TEK kaynaktan beslenir: bu modul
 * Worker tarafini uretir, `app/public/_headers` ayni degerleri tasir.
 * Degerler degisirse ikisini birlikte guncelleyin (bkz. docs/guvenlik-basliklari.md).
 *
 * CSP notu: Turnstile betigi ve iframe'i `challenges.cloudflare.com`'dan
 * gelir; bu kaynak `script-src`/`frame-src`/`connect-src` icinde acikca
 * listelenmistir. Stil icin `'unsafe-inline'` gereklidir (React calisma
 * zamaninda stil enjekte edebilir); betik icin inline'a izin VERILMEZ.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains";

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

/** Statik varlik yanitlari icin de gecerli guvenlik basliklari. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "strict-transport-security": STRICT_TRANSPORT_SECURITY,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": PERMISSIONS_POLICY,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

/** Yanita guvenlik basliklarini ekler; govde ve durum kodu degismez. */
export function withSecurity(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Duz HTTP istegini HTTPS'e yonlendirir (kalici, 301). Cloudflare
 * `x-forwarded-proto` basligini set eder; yerel testte istek zaten https
 * oldugu icin yonlendirme tetiklenmez.
 */
export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const proto = (request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).toLowerCase();
  if (proto !== "http") return null;
  url.protocol = "https:";
  return new Response(null, { status: 301, headers: { location: url.toString() } });
}

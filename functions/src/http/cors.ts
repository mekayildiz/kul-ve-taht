/**
 * CORS katmani (tasarim belgesi 21.1).
 *
 * Arayuz Cloudflare Pages'te, API Workers'ta ayri kaynaklarda calisir; bu
 * yuzden tarayicinin API'ye erisebilmesi icin CORS zorunludur. Kimlik
 * dogrulama `Authorization` basligiyla yapilir (cerez degil), bu nedenle
 * kimlik bilgisi tasimayan isteklerde `*` guvenlidir. Uretimde
 * `ALLOWED_ORIGIN` degiskeniyle tek bir kaynak kilitlenebilir.
 */

const ALLOW_HEADERS = "authorization, content-type";
const ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const MAX_AGE_SECONDS = "86400";

export function allowedOrigin(configured: string | undefined): string {
  const value = (configured ?? "").trim();
  return value.length > 0 ? value : "*";
}

/** Yanita CORS basliklarini ekler; govde ve durum kodu degismez. */
export function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", ALLOW_METHODS);
  headers.set("access-control-allow-headers", ALLOW_HEADERS);
  headers.set("access-control-max-age", MAX_AGE_SECONDS);
  // Kaynak `*` degilse onbellek anahtarini kaynaga gore ayir (Vary).
  if (origin !== "*") headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** On kontrol (preflight) yaniti: govdesiz 204, CORS basliklariyla. */
export function preflightResponse(origin: string): Response {
  return withCors(new Response(null, { status: 204 }), origin);
}

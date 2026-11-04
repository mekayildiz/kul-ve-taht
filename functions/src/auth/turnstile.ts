/**
 * Cloudflare Turnstile bot korumasi (0 TL, sinirsiz dogrulama).
 *
 * Neden Turnstile: ucretsiz ve sinirsizdir; e-posta/alan adi gerektirmez.
 * `TURNSTILE_SECRET` tanimli DEGILSE koruma KAPALIDIR (yerel gelistirme ve
 * testler etkilenmez). Tanimliysa kayit/giris istekleri `turnstileToken`
 * alanini tasimalidir ve jeton Cloudflare'e dogrulatilir.
 *
 * Sirri olusturma: Cloudflare panel > Turnstile > site ekle. Site anahtari
 * istemciye, gizli anahtar `wrangler secret put TURNSTILE_SECRET` ile sunucuya.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  ok: boolean;
  error?: "missing_token" | "verification_failed" | "network_error";
}

/**
 * Jetonu Cloudflare'e dogrulatir. `secret` bos ise koruma kapali kabul edilir
 * ve her zaman basarili doner.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!secret) return { ok: true };
  if (!token) return { ok: false, error: "missing_token" };
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, error: "verification_failed" };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

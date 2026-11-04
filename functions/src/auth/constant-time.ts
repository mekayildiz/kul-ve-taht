/**
 * Sabit zamanli karsilastirma.
 *
 * `crypto.subtle.timingSafeEqual` standart WebCrypto'nun parcasi DEGILDIR;
 * yalnizca Cloudflare'e ozgu bir uzantidir ve Node/yerel test ortaminda
 * bulunmaz. Bu nedenle tasinabilir bir uygulama kullanilir: uzunluk esitse
 * tum baytlar XOR'lanir ve tek bir fark biti bile sonucu degistirir.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

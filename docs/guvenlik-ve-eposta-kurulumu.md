# Güvenlik ve E-posta Kurulumu (0 TL)

Bu belge, **0 TL** kısıtı içinde kalan iki opsiyonel özelliğin nasıl
etkinleştirileceğini anlatır. İkisi de varsayılan olarak **kapalıdır**;
gizli anahtar girilmediğinde hiçbir şey değişmez ve mevcut kurulum çalışmaya
devam eder.

## 1. Bot koruması — Cloudflare Turnstile (ücretsiz, sınırsız)

Kayıt ve giriş uçlarına bot koruması ekler.

1. Cloudflare paneli > **Turnstile** > *Add site*.
2. **Site key** (genel) ve **Secret key** (gizli) alınır.
3. Gizli anahtarı sunucuya ekleyin:
   ```
   wrangler secret put TURNSTILE_SECRET --config functions/wrangler.toml
   ```
4. Site anahtarını arayüz derlemesine verin (örnek `.env.production`):
   ```
   VITE_TURNSTILE_SITE_KEY=<site-key>
   ```
5. Yeniden derleyip yayınlayın. Widget yalnızca site anahtarı tanımlıysa
   çizilir.

**Not:** `TURNSTILE_SECRET` yoksa koruma kapalıdır; istekler eskisi gibi
çalışır. Jeton doğrulanamazsa uç `captcha_failed` (403) döner.

## 2. E-posta gönderimi — Brevo (ücretsiz, günde 300)

Neden Brevo: ücretsiz katmanı **günde 300 e-posta** ve **alan adı doğrulaması
gerektirmez** (tek doğrulanmış gönderici adresi yeterli). Resend/Mailjet gibi
sağlayıcılar alan adı doğrulaması ister; bu, 0 TL kısıtında ek maliyet
doğurabilir.

1. `brevo.com` üzerinden ücretsiz hesap açın.
2. **Senders** bölümünden bir gönderici adresi doğrulayın (örnek:
   `oyun@ornek.tr` veya kişisel Gmail).
3. **SMTP & API > API Keys** üzerinden bir API anahtarı oluşturun.
4. Sunucuya ekleyin:
   ```
   wrangler secret put BREVO_API_KEY --config functions/wrangler.toml
   ```
5. Gönderici adresini değişken olarak ekleyin (`wrangler.toml` `[vars]`):
   ```
   MAIL_SENDER = "oyun@ornek.tr"
   ```

**Not:** `BREVO_API_KEY` veya `MAIL_SENDER` yoksa `sendEmail` sessizce
`skipped` döner; hiçbir istek dışarı çıkmaz. Kod yolu:
`functions/src/mail/brevo.ts`.

## Mevcut durum (0 TL özeti)

| Özellik | Durum | Maliyet |
|---|---|---|
| Turnstile bot koruması | Hazır, anahtar girilince etkin | 0 TL, sınırsız |
| Brevo e-posta | Hazır, anahtar girilince etkin | 0 TL, 300/gün |
| TOTP 2FA + kurtarma kodları | Etkin (anahtar gerekmez) | 0 TL |
| Oturum yönetimi | Etkin | 0 TL |

Hiçbiri ücretli plana geçiş tetiklemez (`npm run check:paid` ile doğrulanır).

# AGENTS.md — Kül ve Taht

## Proje özeti

Çevrimiçi, kalıcı dünyalı, metin tabanlı ortaçağ-fantezi RPG/strateji oyunu.
Cloudflare **ücretsiz** katmanında çalışır (Workers/D1/Durable Objects).
**0 TL şartı bağlayıcıdır**; ücretli plana geçiş yoktur. **R2 kullanılmaz**
(hesap düzeyinde etkinleştirme gerektirir): yedekleme D1 Time Travel, görsel
varlıklar Worker `[assets]` statik sistemiyle karşılanır.

Tasarım belgesi `Kul_ve_Taht.txt` **değiştirilmez** (md5 korunur). Belge 21.5
ve 26 (yapay zekâ araç koordinasyonu) bölümleri asla değiştirilmez.

## Mimari

- `functions/src/` — Worker arka ucu. `index.ts` yönlendirici.
  - `auth/` kimlik, `db/` veri katmanı, `world/` dünya verisi,
  - `world/settlement-profile.ts` — belge 20: 130 yerleşimin tam profili (nüfus/ekonomi/yönetim/güvenlik/ulaşım),
  - `play/` kalıcı oynanış durumu (istemci OTORİTE DEĞİLDİR),
  - `play/systems.ts` — belge 20: askeri/ekonomi/adalet/dövüş/sosyal/siyaset sistemlerinin kalıcı bağlantısı (sunucu otoriteli),
  - `economy/` pazar + mülk/şirket + `economy/extras.ts` (depolama/açık artırma/kira/tekel/bütçe),
  - `military/` ordu/savaş, `npc/` simülasyon,
  - `family/` hanedan/miras, `politics/` makam/konsey, `social/` sohbet,
  - `livelihood/` tarım/hayvancılık/av, `magic/` büyü/din/lonca, `underworld/` yeraltı,
  - `notify/` bildirim özeti, `quests/`, `inventory/`, `health/`, `justice/`, `travel/`, `assets/` görsel kayıt,
  - `quota/` 0 TL kota koruması.
- `app/src/` — React arayüz (ekranlar, i18n TR/EN, API istemcisi).
- `db/migrations/` — D1 şeması + referans veri (130 yerleşim).
- `assets/` — görsel varlık manifesti (BLOB yok; dosyalar Worker statik varlık
  sisteminden `app/dist/assets/...` sunulur).

## Komutlar

```bash
npm run verify   # lint + typecheck + build + test + 0 TL denetimi (zorunlu)
npx vitest run <dosya>   # tek test dosyası
npm run gen:assets       # görsel varlıkları yerel üret (deterministik SVG→WebP)
npm run rehearsal:load-restore  # yük/kota + yedek/geri yükleme provası
npm run dev:api          # yerel Worker (Miniflare; hesap gerekmez, ücretsiz)
npm run db:migrate:local # yerel D1'e migration uygula
npm run deploy:api       # üretim Worker yayını (ücretsiz katman)
npm run deploy:web       # Cloudflare Pages yayını (ücretsiz katman)
```

Yayın adımları: `docs/yayin-kilavuzu.md`.

> **Üretim yayını:** tek adım `npm run deploy:production`. Bu betik migration'ları
> uzak D1'e uygular, sonra Worker'ı dağıtır ve canlı duman testini koşar.
> `wrangler deploy` **tek başına** migration uygulamaz; yeni bir migration
> eklendiyse önce `npm run db:migrate:remote` çalıştırılmalıdır. Aksi halde
> `/api/health` ve giriş yeşil kalır ama oyun durumu ucu 500 verir (eksik
> kolon/tablo). `npm run smoke:live <adres>` bu yolu kapsar.

## Kurallar

- **Test edilmeyen görev "tamamlandı" işaretlenmez.**
- Testler gerçek SQLite motorunu (`node:sqlite`) kullanır; bu modül **Node ≥ 22.5**
  gerektirir. CI (`.github/workflows/ci.yml`) bu yüzden Node 24 kullanır;
  Node 20 ile testler `ERR_UNKNOWN_BUILTIN_MODULE` verir.
- Her özellik sunucuda doğrulanır; istemciden gelen para/eşya/sahiplik yok sayılır.
- Görseller yerel üretilir (`scripts/gen-assets.mjs`), CC0/self lisanslıdır;
  harici indirme veya atıf zorunluluğu yoktur.
- Kota aşımı 429/202/503 ile karşılanır; **402/ödeme üretilmez**.
- İlerleme `docs/gorev-panosu.md` panosunda ve `docs/yedekleme-durumu.md`'de izlenir.

## GitHub durumu

`feat/kul-ve-taht-development` dalı `origin`'e gönderilebilir (push çalışır).
Ayrıntı: `docs/yedekleme-durumu.md`. Her aşama sonunda bundle yenilenir.

## Yayın mimarisi (belge 18, 21.1)

- **Tek kaynak (önerilen, ücretsiz):** `functions/wrangler.toml` içindeki
  `[assets]` bloğu `app/dist`'i aynı Worker'dan sunar; arayüz + `/api/*` tek
  kaynakta çalışır, tarayıcıda CORS sorunu olmaz. Önce `npm run build -w @kvt/app`.
- **Ayrı kaynak (isteğe bağlı):** arayüz ayrı bir Pages projesinde barındırılırsa
  `functions/src/http/cors.ts` devreye girer; `ALLOWED_ORIGIN` secret'ı ile
  kaynak kilitlenir. Kimlik `Authorization` başlığıyla (çerez değil) olduğundan
  varsayılan `*` güvenlidir.
- Yerel geliştirme `npx wrangler dev --local --ip 0.0.0.0` ile yapılır; Miniflare
  D1/DO'yu hesap gerekmeden emüle eder. Yedekleme D1 Time Travel (ücretsiz, 30
  gün); ayrı Workflow veya R2 binding'i yoktur.

## Güvenlik başlıkları ve HTTPS (belge 21.1)

- **Statik varlıklar Worker betiğinden ÖNCE sunulur**, bu yüzden güvenlik
  başlıkları **iki yerde** tanımlıdır: `functions/src/http/security.ts` (Worker
  yanıtları: `/api/*`, 404, ön kontrol) ve `app/public/_headers` (HTML/JS/CSS).
  Değerler **aynı** olmalı; birini değiştirince diğerini de güncelle.
- `withSecurity()` tüm Worker yanıtlarına HSTS, CSP, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, COOP/CORP ekler. `httpsRedirect()` düz
  HTTP'yi (`x-forwarded-proto: http`) 301 ile HTTPS'e taşır; panel ayarı
  (Always Use HTTPS) gerekmez.
- CSP'de **betik inline'a kapalı** (`script-src 'self'
  https://challenges.cloudflare.com`); stil için `'unsafe-inline'` açıktır
  (React). Turnstile kaynağı `script-src`/`connect-src`/`frame-src`'te açıktır.
- Ayrıntı ve doğrulama: `docs/guvenlik-basliklari.md`. Test:
  `functions/src/http/security.test.ts`.

## Yerel gelistirme notlari (kapali test)

- Yerel API icin once `npm run db:migrate:local` (aksi halde `no such table:
  accounts`). `functions/.dev.vars` (git'e girmez) icinde
  `SESSION_SECRET=yerel-gelistirme-anahtari-uretimde-degistirilir` ve
  `BOOTSTRAP_ADMIN_TOKEN=kapali-yerel-bootstrap` gerekir. `.dev.vars` okunmasi
  icin sunucu YENIDEN baslatilmalidir; eski surec portta kalirsa yeni degerler
  yuklenmez (`pgrep -af "wrangler dev"` ile kontrol et).
- `httpsRedirect` yalnizca `x-forwarded-proto: http` iken tetiklenir. Yerelde bu
  baslik yoktur; yonlendirme yapilmaz, boylece HTTP uzerinden gelistirme surer.
- Kapali test (`npm run test:closed`) sentetik admin token kullanamaz; yonetim
  uclari rolu DB'den tazeler. Test gercek `bootstrap-admin` + giris akisini izler
  ve tekrar calistirmada 409'u beklenen kabul eder. Beklenen: 17/17.

## Arayuz temasi (belge 18.1)

- Tek stil dosyasi `app/src/styles.css`; tum siniflar `kvt-` onekli. Harici
  font/gorsel YOK: sistem serif yigini + inline SVG (`components/Crest.tsx`).
  CSP bu yuzden `font-src 'self'`, `img-src 'self' data:` ile sinirlidir.
- Dokunma hedefleri >= 44px; `prefers-reduced-motion` destegi var.

## Dunya simulasyonu (belge 8/9/19)

- Katmanli NPC simulasyonu `functions/src/play/world-sim.ts` icindedir ve
  `scheduled()` (Cron Trigger) veya dunya saati ilerlemesi ile calisir;
  istemci istegine bagli DEGILDIR.
- Parti limiti `NPC_BATCH_LIMIT = 50` Free plan yazma kotasini korur. Simulasyon
  idempotenttir (`last_simulated_day`, `world_event_log.game_day`).
- NPC'ler `seedWorld` icinde tohumlanir (yerlesim basina 1 onemli + 2 yerel +
  4 arka plan). Sema `db/migrations/0008_world_simulation.sql`.

## Statik gorsel varliklar (belge 17)

- Tek kaynak `assets/` (surum kontrolunde). `npm run gen:assets` deterministik
  uretir; `npm run sync:assets` bunlari `app/public/assets/`'e kopyalar.
  `app/public/assets/` .gitignore'dadir; ikili dosyalar depoda iki kez tutulmaz.
- Kok `npm run build` once `sync:assets` calistirir; Cloudflare Pages derlemesi
  de ayni komutu kullanmalidir.
- Oyun icinde portre (`/assets/portraits/pool-NN.webp`) ve esya ikonlari
  (`/assets/icons/<icon>.webp`) kullanilir; veri tasarrufu modunda 96/64px
  turevler istenir (belge 17.5).

## Hedefli islemler icin oyuncu rehberi (belge 16)

- `functions/src/play/directory.ts` diger canli karakterleri (yalnizca herkese
  acik alanlar) doner ve `/api/play/:id/state.directory` icinde yer alir.
- Arayuzdeki hedef secici bu listeyi kullanir; takas, karsilikli kredi, emanet,
  tapu uyusmazligi, ortaklik ve grup katilma gibi islemler bu kimligi kullanir.

## Parola hash: PBKDF2 platform siniri (KRITIK)

- Cloudflare **workerd WebCrypto, PBKDF2'de 100.000 iterasyonun uzerini
  reddeder**: `NotSupportedError: Pbkdf2 failed: iteration counts above 100000
  are not supported`. Uretimde yakalanmayan bu istisna Worker hatasi 1101 ve
  HTTP 500'e donusur (arayuzde genel hata gorunur).
- Bu nedenle `auth/password.ts` icindeki `PBKDF2.iterations` **100.000**
  (platform ust siniri) olarak sabitlenmistir; OWASP'in 600.000 onerisi bu
  ortamda UYGULANAMAZ. `PBKDF2_MAX_ITERATIONS` korumasi asimi erken, anlasilir
  bir `RangeError` ile engeller.
- Hash islemi **PASSWORD_HASH_GATE Durable Object**'inde calisir (Worker HTTP
  istegi Free planda 10 ms CPU ile sinirli; 100k PBKDF2 ~15 ms). Worker kendi
  CPU butcesini asmaz; DO'nun 30 s butcesi kullanilir.
- Hash, hesap kimligine gore 16 shard'a dagitilir (`auth/rate-limit.ts`
  `hashShardFor`). Hiz siniri **hesap bazlidir** (bir shard'i paylasan farkli
  hesaplar birbirini etkilemez).
- Kayit/giris yollari hasher'i `createGateHasher(env.PASSWORD_HASH_GATE, ...)`
  ile alir (`auth/hash-gate.ts`); namespace yoksa (birim testi) yerel hasher'a
  duser. Yeni bir auth yolu eklerken bu sarmalayiciyi kullanin.
- Regresyon testleri: `auth/hash-gate.test.ts` (platform siniri + DO akisi),
  `auth-e2e.test.ts` (kayit→giris→oturum). Uretimde dogrulama: `wrangler tail`
  ile `outcome: ok`, istisna yok.

## Rol yonetimi ve yonetim paneli (belge 20)

- Roller `accounts.role` sutununda tutulur: `player` | `moderator` | `admin`
  (CHECK kisiti). Rol **sunucu tarafinda** uygulanir; istemci rol otoritesi
  degildir.
- Yetki eslemesi `auth/authorize.ts`: `admin:read` (panel goruntuleme) hem
  `moderator` hem `admin`'de; `admin:any` (yazma) yalnizca `admin`'de. Salt
  okunur uclar (overview, characters listesi, economy, quota) `admin:read`
  kullanir.
- **Rol degisikligi aninda etkilidir**: yonetim uclari `adminSession()` ile
  oturumu cozer ve rolu DB'den TAZELER. Aksi halde 12 saatlik belirtec eski
  rolu tasir ve yetki sizmasi olusur. Bu yuzden testlerde admin belirteci
  uretmeden ONCE `adminSetAccountRole` ile DB rolu yazilmalidir.
- Rol servisi `admin/roles.ts`: `adminAccounts`, `adminSetAccountRole`,
  `isAccountRole`. Her degisiklik `audit_log`'a yazilir. **Son adminin
  dusurulmesi engellenir** (`last_admin`): aksi halde panel kilitlenir.
- Uclar: `GET /api/admin/accounts`, `POST /api/admin/accounts/:id/role`,
  `POST /api/admin/accounts/:id/status` (yalnizca `admin:any`).
- Arayuz: `nav.admin` dugmesi ve `AdminPanel` yalnizca `role` moderator/admin
  ise gorunur; rol atama, ban/unban ve tohumlama kontrolleri yalnizca `admin`'de
  aciktir.

### Korumali (kurucu) hesap

- `accounts.protected = 1` olan hesap **banlanamaz, askiya alinamaz ve rolu
  dusurulemez** (`adminSetAccountStatus`/`adminSetAccountRole` → `protected`).
  Amac: kurucu/yönetici hesabi kilitlenmesin.
- Ek kilit: **son aktif admin banlanamaz** (`last_admin`); aksi halde yonetici
  kendi kendini kilitleyebilirdi (kendi banini kaldiramaz, cunku `adminSession`
  banli hesabi aninda gecersiz kilar).
- Bootstrap (`/api/auth/bootstrap-admin`) atadigi hesabi otomatik `protected=1`
  yapar.
- Bayrak panelden DEGISTIRILEMEZ; yalnizca dogrudan D1 uzerinden kaldirilir:
  `UPDATE accounts SET protected = 0 WHERE email = '...'`.
- Ban etkisi: `auth/service.ts` giris akisinda `status !== 'active'` ise giris
  403 ile reddedilir.

### Ilk yoneticiyi atama (bootstrap)

Hic yonetici yokken panel acilamaz. Tek seferlik cozum:

1. `wrangler secret put BOOTSTRAP_ADMIN_TOKEN` (guclu, rastgele bir deger).
2. Oyuna normal sekilde kayit olun.
3. `curl -X POST <worker>/api/auth/bootstrap-admin -H 'content-type: application/json'
   -H "x-bootstrap-token: <jeton>" -d '{"email":"siz@ornek.com"}'`
4. Jeton tanimli degilse uc 404; zaten bir admin varsa 409 doner. Atama
   sonrasi jetonu SILIN: `wrangler secret delete BOOTSTRAP_ADMIN_TOKEN`.

Sonrasinda tum rol dagitimi yonetim panelinden yapilir.

### Uye islemleri (yonetim panelinden)

`AdminPanel` icinde `AdminGrants` bolumu (yalnizca `admin`):

- **Para**: `POST /api/admin/characters/:id/gold` ile `{delta}` (± ). Deger
  sunucuda kirpilir; altin negatife dusmez.
- **Esya**: `POST /api/admin/characters/:id/items` `{itemId, quantity}` ver/al
  (negatif adet = al). Gecersiz esya reddedilir.
- **Nitelik**: `POST /api/admin/characters/:id/attributes` `{attribute, value}`.
  Yedi nitelik 1..20 araligina kirpilir.
- **Canli durum**: saglik/enerji/itibar duzeltmesi.
- Her islem `audit_log`'a yazilir; panel son kayitlari gosterir
  (`GET /api/admin/audit`).

### Hesap guvenligi (2FA + oturumlar)

`SecurityPanel` ekrani (hesap menusunde):

- **TOTP 2FA**: `POST /api/account/2fa/setup` sirri (AES-GCM ile sifreli
  saklanir) ve `otpauth://` baglantisini dondurur; `confirm` ile etkinlesir.
  Giris akisi `totpCode` veya tek kullanimlik `recoveryCode` kabul eder.
- **Oturumlar**: `GET /api/account/sessions`; tek oturum
  `POST /api/account/sessions/:id/revoke`, digerleri `revoke-others`.
  `readSession` iptal edilmis (revoked) oturumu reddeder.
- Oturum belirtecinin yalnizca SHA-256 ozeti saklanir.

### Bot korumasi ve e-posta (0 TL, opsiyonel)

- **Turnstile**: `TURNSTILE_SECRET` tanimliysa kayit/giris `turnstileToken`
  ister; degilse koruma kapalidir. Istemci widget'i yalnizca
  `VITE_TURNSTILE_SITE_KEY` varsa cizilir.
- **Brevo e-posta**: `BREVO_API_KEY` + `MAIL_SENDER` tanimliysa
  `functions/src/mail/brevo.ts` ile gonderim yapilir; yoksa no-op.
- Kurulum ayrintilari: `docs/guvenlik-ve-eposta-kurulumu.md`.

### Ucretsiz alan adi

Araştırma ve secenekler: `docs/ucretsiz-alan-adi-arastirmasi.md`. Ozet:
gercek `.com` ucretsiz alinamaz; 0 TL icin mevcut `*.pages.dev` adresi veya
DigitalPlat FreeDomain (`*.dpdns.org`) alt alan adi kullanilabilir.

**Kurulu durum (canli):** `https://kulvetaht.dpdns.org` — DigitalPlat
FreeDomain'den alinan alan adi Cloudflare'de tam (full) zone olarak tanimli
(zone id `dd28c5c113f1076544eae95c3d1e55a3`) ve Worker'a **ozel alan adi**
(Workers Custom Domain) olarak bagli: `kulvetaht.dpdns.org` →
`kul-ve-taht-functions` (production). SSL sertifikasi Cloudflare tarafindan
otomatik saglanir; HSTS etkindir. Kaynak: `docs/alan-adi-baglama-kilavuzu.md`.

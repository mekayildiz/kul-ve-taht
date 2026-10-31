# Yayın (Deployment) Kılavuzu

Bu kılavuz "Kül ve Taht"ı **0 TL** bütçeyle, yalnızca Cloudflare ücretsiz
planlarını kullanarak yayına alma adımlarını içerir. Hiçbir adım ücretli plan
gerektirmez; ücretli plana geçiş tetikleyen yapılandırma yoktur (`npm run
check:paid` bunu doğrular).

## 0. Ön koşullar

- Cloudflare hesabı (ücretsiz katman yeterlidir).
- Node.js >= 22.5 (testler gercek SQLite motoru `node:sqlite` kullanir).
- `npx wrangler login` ile hesabın yetkilendirilmesi (ücretsiz).

## 1. Yerel doğrulama (hesap gerekmez)

Yerel geliştirme Miniflare ile D1/Durable Objects'i **hesap
açmadan ve ücretsiz** emüle eder.

```bash
npm install
npm run verify                                   # lint + tip + build + test + 0 TL denetimi
npx wrangler d1 migrations apply kul-ve-taht-db --local --config functions/wrangler.toml
npx wrangler dev --local --config functions/wrangler.toml
```

Doğrulama uçları:

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/world/summary
curl http://localhost:8787/api/catalog
curl "http://localhost:8787/api/world/profile?id=varkhenn-drahkmar"
```

## 2. Üretim kaynakları (ücretsiz)

```bash
# D1 veritabanı oluştur (ücretsiz katman) ve dönen database_id'yi wrangler.toml'a yaz
npx wrangler d1 create kul-ve-taht-db

# Oturum anahtarı (ücretsiz; varsayılan yerel değer ÜRETİMDE KULLANILMAZ)
npx wrangler secret put SESSION_SECRET --config functions/wrangler.toml
```

> Not: Ücretsiz D1'de 5 GB / 5M okuma-gün / 100K yazma-gün; Workers'ta 100K
> istek-gün; DO'da 100K istek-gün sınırları vardır (bkz. `docs/kota-butcesi.md`).
> Bu sınırlar içinde kalındığı sürece ücret oluşmaz.
>
> **R2 oluşturulmaz.** Bu proje R2 kullanmaz (hesap düzeyinde etkinleştirme
> gerektirir). Yedekleme D1 Time Travel ile, görsel varlıklar Worker `[assets]`
> statik sistemiyle karşılanır.

## 3. Şema ve dünya verisi

```bash
# Üretim D1'e migration'ları uygula (krallıklar, 130 yerleşim, profil verisi)
npx wrangler d1 migrations apply kul-ve-taht-db --remote --config functions/wrangler.toml
```

Referans veri (0003) krallık/yerleşim kayıtlarını ve **nüfus/güvenlik**
değerlerini yerleşim profilinden yükler. Tohumlama idempotenttir.

## 4. Yayın

Önerilen (tek kaynak, ücretsiz): arayüz ve API **aynı Worker**'dan sunulur.
`functions/wrangler.toml` içindeki `[assets]` bloğu `app/dist`'i statik
varlık olarak bağlar; `not_found_handling = "single-page-application"`
derin bağlantıları `index.html`'e düşürür. Bu sayede tarayıcıda kaynaklar
arası (CORS) sorunu yaşanmaz ve ayrı bir Pages projesine gerek kalmaz.

```bash
# 1) Arayüzü derle (statik varlıklar)
npm run build -w @kvt/app

# 2) Arka uç + arayüzü birlikte yayınla (Workers + D1 + DO + assets)
npx wrangler deploy --config functions/wrangler.toml
```

Yerel doğrulama da aynı yapıyı kullanır:

```bash
npx wrangler dev --local --ip 0.0.0.0 --config functions/wrangler.toml
# http://localhost:8787/ arayüzü, /api/* arka ucu aynı kaynaktan sunar
```

### Ayrı kaynakta (Pages) yayın isteğe bağlıdır

Arayüz ayrı bir Cloudflare Pages projesinde barındırılacaksa, tarayıcı
farklı kaynaktan API'ye erişeceği için CORS gerekir (belge 21.1):

```bash
npm run build -w @kvt/app
VITE_API_BASE_URL=https://kul-ve-taht-functions.<hesap>.workers.dev \
  npx wrangler pages deploy app/dist --project-name kul-ve-taht
```

Arka uçta izinli kaynağı kilit (isteğe bağlı, önerilir):

```bash
npx wrangler secret put ALLOWED_ORIGIN --config functions/wrangler.toml
# değer: https://kul-ve-taht.pages.dev
```

`ALLOWED_ORIGIN` boşsa API tüm kaynaklara açıktır; kimlik doğrulama
`Authorization` başlığıyla yapıldığından (çerez değil) bu güvenlidir.

## 5. Yedekleme (R2 gerektirmez)

- **D1 Time Travel** (ücretsiz, 30 gün): her D1 üretim veritabanı otomatik olarak
  geri dönüş noktası tutar; etkinleştirme gerekmez, ek maliyet yoktur.

```bash
# Bookmark al (mevcut geri dönüş noktası)
npx wrangler d1 time-travel info kul-ve-taht-db --config functions/wrangler.toml

# Belirli bir ana geri dön
npx wrangler d1 time-travel restore kul-ve-taht-db \
  --bookmark=<BOOKMARK> --config functions/wrangler.toml
```

Ek olarak, elle tam dump almak isterseniz (dosya yerelde tutulur):

```bash
npx wrangler d1 export kul-ve-taht-db --remote --output backup.sql
```

Geri yükleme bütünlük doğrulaması `functions/src/workflows/restore.ts` içindedir
(yıkıcı ifade reddi, kısmi geri yükleme engeli); dump kaynağından bağımsızdır ve
**R2'ye bağlı değildir**.

## 6. 0 TL denetimi

Her yayın öncesi:

```bash
npm run check:paid
```

Bu betik `wrangler.toml`, `package.json` ve diğer yapılandırmalarda ücretli
plana geçiş tetikleyen ayar olmadığını doğrular.

## 7. Üretim yayını için gereken kullanıcı işlemi

Kod, yapılandırma ve yerel (Miniflare) doğrulama tamdır. Gerçek üretim
kaynaklarını (`wrangler d1 create`, `wrangler deploy`)
oluşturmak için **Cloudflare hesabı yetkilendirmesi** gerekir; bu adım
ücretsizdir ama hesap sahibinin onayını ister. İki yol vardır:

**A) Tek komutla otomatik yayın (önerilen).** Yetkilendirdikten sonra:

```bash
npx wrangler login                 # tarayıcıda ücretsiz hesap onayı
# (alternatif: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID ortam değişkenleri)
npm run deploy:production          # D1 + secret + migration + deploy + sağlık kontrolü
```

`scripts/deploy-production.mjs` idempotenttir: D1 varsa yeniden oluşturmaz,
`SESSION_SECRET` tanımlıysa korur, dönen `database_id`'yi `wrangler.toml`'a
yazar, migration'ları uygular, dağıtır ve canlı `/api/health` kontrolü yapar.
**R2 kovası oluşturmaz** (R2 kullanılmaz).

**B) Elle adım adım:**

```bash
npx wrangler login                     # tarayıcıda ücretsiz hesap onayı
npx wrangler d1 create kul-ve-taht-db  # dönen database_id'yi wrangler.toml'a yaz
npx wrangler secret put SESSION_SECRET --config functions/wrangler.toml
npm run build -w @kvt/app && npx wrangler deploy --config functions/wrangler.toml
```

> `SESSION_SECRET` yalnızca `wrangler secret put` ile ayarlanır; depodaki
> `functions/wrangler.toml` içine **yazılmaz**. Yerel geliştirme için
> `functions/.dev.vars` (git'e girmez) kullanılır.

**Yayın sonrası dünya tohumlama (idempotent).** Şema migration'ları krallıkları
ve 130 yerleşimi zaten yükler. NPC/saray/oyun saati tohumlaması için bir kez:

```bash
curl -X POST https://<worker>.workers.dev/api/admin/seed-world \
  -H "authorization: Bearer <YÖNETİCİ_TOKEN>"
```

Yönetici hesabı gerekir (bkz. `docs/gorev-panosu.md`); tohumlama tekrar
çalıştırılsa bile mevcut oyuncu verisini ezmez.

Hesap yetkilendirmesi olmadan da tüm sistemler Miniflare ile yerel olarak
çalışır ve doğrulanır (bkz. Bölüm 1); ücretli hiçbir adım yoktur.

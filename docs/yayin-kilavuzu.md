# Yayın (Deployment) Kılavuzu

Bu kılavuz "Kül ve Taht"ı **0 TL** bütçeyle, yalnızca Cloudflare ücretsiz
planlarını kullanarak yayına alma adımlarını içerir. Hiçbir adım ücretli plan
gerektirmez; ücretli plana geçiş tetikleyen yapılandırma yoktur (`npm run
check:paid` bunu doğrular).

## 0. Ön koşullar

- Cloudflare hesabı (ücretsiz katman yeterlidir).
- Node.js >= 20.
- `npx wrangler login` ile hesabın yetkilendirilmesi (ücretsiz).

## 1. Yerel doğrulama (hesap gerekmez)

Yerel geliştirme Miniflare ile D1/R2/Durable Objects/Workflows'u **hesap
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

# R2 kovaları (ücretsiz katman)
npx wrangler r2 bucket create kul-ve-taht-backups
npx wrangler r2 bucket create kul-ve-taht-assets

# Oturum anahtarı (ücretsiz; varsayılan yerel değer ÜRETİMDE KULLANILMAZ)
npx wrangler secret put SESSION_SECRET --config functions/wrangler.toml
```

> Not: Ücretsiz D1'de 5 GB / 5M okuma-gün / 100K yazma-gün; Workers'ta 100K
> istek-gün; DO'da 100K istek-gün sınırları vardır (bkz. `docs/kota-butcesi.md`).
> Bu sınırlar içinde kalındığı sürece ücret oluşmaz.

## 3. Şema ve dünya verisi

```bash
# Üretim D1'e migration'ları uygula (krallıklar, 130 yerleşim, profil verisi)
npx wrangler d1 migrations apply kul-ve-taht-db --remote --config functions/wrangler.toml
```

Referans veri (0003) krallık/yerleşim kayıtlarını ve **nüfus/güvenlik**
değerlerini yerleşim profilinden yükler. Tohumlama idempotenttir.

## 4. Yayın

```bash
# Arka uç (Workers + D1 + R2 + DO + Workflows)
npx wrangler deploy --config functions/wrangler.toml

# Arayüz (Cloudflare Pages, ücretsiz)
npm run build -w @kvt/app
npx wrangler pages deploy app/dist --project-name kul-ve-taht
```

Arayüzün arka uca bağlanması için `VITE_API_BASE_URL` ortam değişkeni Pages
projesinde Worker adresine ayarlanır.

## 5. Yedekleme

- **D1 Time Travel** (ücretsiz): 30 güne kadar geri dönüş.
- **Workflows → R2**: `BackupWorkflow` günlük yedeği R2'ye yazar; geri yükleme
  provası test edilmiştir (`functions/src/workflows/restore.ts`).

```bash
# Manuel yedek alma (workflow tetikleme) — yayın sonrası doğrulanır
npx wrangler d1 export kul-ve-taht-db --remote --output backup.sql
```

## 6. 0 TL denetimi

Her yayın öncesi:

```bash
npm run check:paid
```

Bu betik `wrangler.toml`, `package.json` ve diğer yapılandırmalarda ücretli
plana geçiş tetikleyen ayar olmadığını doğrular.

## 7. Bilinen dış engel (kullanıcı işlemi gerekir)

Bu depodaki çalışma, GitHub'a **yazma** yetkisi olmayan bir token nedeniyle
`mekayildiz/kul-ve-taht` deposuna gönderilememektedir. Ayrıntı ve çözüm
adımları `docs/yedekleme-durumu.md` içindedir. Bu engel yayın adımlarını
etkilemez; kod yerel olarak tam çalışır ve doğrulanmıştır.

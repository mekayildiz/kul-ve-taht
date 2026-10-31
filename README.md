# Kül ve Taht (Ash and Throne)

Metin tabanlı, kalıcı ortak dünyalı, Ortaçağ-fantezi RPG/strateji oyunu.
Dünya: **Valedorn** — 5 krallık, 3 bağımsız şehir, 2 tarafsız bölge ve **130 yerleşim**.

**Bütçe: 0 TL.** Ücretli kredi, abonelik, ücretli API veya ücretli barındırma yoktur.
Yalnızca doğrulanmış ücretsiz araçlar kullanılır.

## Teknoloji

- Ön yüz: React + TypeScript (mobil öncelikli), Cloudflare Pages
- Sunucu: Cloudflare Workers + Durable Objects + Workflows
- Veritabanı: Cloudflare D1 (sağlayıcı-bağımsız katman; Turso taşınabilirliği)
- Depolama: Cloudflare R2
- CI: GitHub Actions (public repo → ücretsiz)

## Dizin yapısı

```
app/        React + TypeScript ön yüz (arayüz kabuğu, i18n)
functions/  Workers / Durable Objects / Workflows
db/         Şema ve migration'lar
assets/     Görsel varlıklar + lisans manifesti
docs/       Görev panosu, araç kaydı, kota bütçesi, karar kayıtları
scripts/    0 TL denetimi
```

## Komutlar

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm run test
npm run check:paid
npm run verify   # hepsini sırayla çalıştırır
```

## Dokümantasyon

- `docs/gorev-panosu.md` — E1–E7 aşamaları ve görevler
- `docs/kota-butcesi.md` — doğrulanmış ücretsiz sınırlar ve tüketim hesabı
- `docs/arac-kaydi.md` — kullanılan araçlar ve lisanslar
- `docs/karar-kayitlari.md` — mimari kararlar (ADR)

## Durum

Aşama: **E1.1 (monorepo iskeleti)** tamamlandı. E1.2 için onay bekleniyor.
Hiçbir Cloudflare kaynağı oluşturulmadı ve hiçbir ücretli hizmet etkinleştirilmedi.

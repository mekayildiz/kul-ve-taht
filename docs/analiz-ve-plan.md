# Kül ve Taht — Analiz, Eksik Gereksinimler ve Geliştirme Planı

Bu belge, tasarım belgesinin (`Kul_ve_Taht.txt`) tamamının mevcut kodla
karşılaştırılmasıyla üretilmiştir. Belge 20 ve 26 uyarınca **hiçbir özellik
daraltılmış MVP gerekçesiyle kapsam dışı bırakılmaz**; 130 yerleşimin tamamı ve
daha önce ertelenmiş tüm sistemler nihai teslimin parçasıdır.

## 1. Oyunun kimliği ve sistemleri (belge 1–19)

| Alan | Kapsam | Durum |
|---|---|---|
| Kimlik/tür | Çevrim içi kalıcı dünya, metin tabanlı RPG + krallık/ekonomi + yaşam simülasyonu + strateji | Kurulu |
| Dünya | Valedorn: 5 krallık + 3 bağımsız şehir + 2 tarafsız bölge + 130 yerleşim | Tam veri seti |
| Karakter | Doğum yeri, geçmiş, aile, görünüş, 7 nitelik, kişilik, uzmanlık, meslek | Kurulu |
| Zaman/ölüm | Olay tabanlı dünya saati (6 sa = 1 oyun günü), yaşlanma, kalıcı ölüm, miras | Kurulu |
| Aile | Evlilik, gebelik, süt anne, çocuk eğitimi, NPC'ye dönüşen çocuklar, hanedan | Kurulu |
| NPC | 5 etkenli karar, hafıza, ilişki, hiyerarşi, katmanlı simülasyon | Kurulu |
| Ekonomi | Arz-talep, stok/bozulma, tekel, banka, vergi, hazine, devlet borcu, mülk, işletme, şirket | Kurulu |
| Askerî | Birlik/komuta/ikmal, kara savaşı, kuşatma, donanma, deniz savaşı | Kurulu |
| Siyaset | Rütbe/makam, konsey, diplomasi, ittifak, savaş/barış, önergeler | Kurulu |
| Yaşam | Sağlık/tıp, açlık, hapishane/kaçış, suç/yargı, keşif, görev, olaylar, tarım | Kurulu |
| Büyü/din/lonca | Büyü yolları, kara büyü suçu, tapınak hizmetleri, loncalar | Kurulu |
| Sosyal | Sohbet, özel mesaj, grup/lonca, arkadaşlık, düello, PvP, takas | Kurulu |
| Görsel/arayüz | Statik illüstrasyon, mobil öncelikli arayüz, TR varsayılan + EN, erişilebilirlik | Kurulu |

## 2. Ertelenmiş ancak nihai kapsamda olan özellikler (belge 20, 26)

Belge 20 açıkça şunları nihai kapsama alır: 130 yerleşim, binlerce NPC'ye
ölçeklenen simülasyon, kuşaklar arası aile/hanedan, büyük kara savaşları,
ayrıntılı kuşatmalar, deniz savaşları, kapsamlı bankacılık/devlet borcu,
şirket/işletme sistemleri, ayrıntılı sağlık ve hapishane, gelişmiş görünüş,
çok oyunculu sosyal sistemler, tüm sistemler için oyuncu + yönetici arayüzü,
bildirimler, kayıt geçmişi, erişilebilirlik ve mobil kullanım.

Bu kalemler E9.1–E9.18 işlerine ayrılmış ve **tamamlanmıştır** (bkz.
`docs/gorev-panosu.md`).

## 3. Korunan bölümler (belge 21.5 ve 26)

Belge 21.5 (Yapay zekâ araçları ve otomatik görev dağılımı) ve belge 26 (Ana
talimat) **değiştirilmemiş, silinmemiştir**. Uygulamada:

- Ana orkestratör belgeyi analiz eder, görevleri uzmanlıklara böler, her görev
  için en uygun ve ücretsiz aracı seçer (21.5).
- Kod, görsel, veritabanı, güvenlik, test, performans ve yayın işleri ilgili
  uzmanlıkla yürütülür; görsel iş koda, kod işi görsel üretime zorlanmaz.
- Üretilen her dosya ortak depoya aktarılır; lisans/kaynak bilgisi kaydedilir
  (`assets/manifest.json`).
- Ücretli kredi/API/abonelik zorunlu tutulmaz; kota dolarsa ücretli plana
  geçilmez, ücretsiz alternatif/optimizasyon/beklemeye alma uygulanır.
- Test edilmeyen hiçbir görev tamamlandı işaretlenmez.

## 4. 0 TL bütçe değerlendirmesi

| Katman | Seçim | Ücretsiz limit | Uyum |
|---|---|---|---|
| Barındırma/API | Cloudflare Workers | 100.000 istek/gün | Uygun |
| Veritabanı | Cloudflare D1 (SQLite) | 5M okuma, 100K yazma/gün | Uygun |
| Depolama | Cloudflare R2 | 10 GB, sınıf A/B sınırlı | Uygun |
| Zamanlayıcı | Workflows + Cron | Ücretsiz katman | Uygun |
| Kimlik | Kendi PBKDF2 + HMAC oturumu | Sunucu içi | Uygun |
| Statik ön yüz | Cloudflare Pages | Ücretsiz | Uygun |
| Sürüm kontrolü | GitHub | Ücretsiz özel/genel depo | Uygun |
| Görsel üretim | **Yerel, deterministik SVG→WebP** | İndirme yok | Uygun |

Görsel varlıklar hiçbir ücretli/ücretsiz üçüncü taraf üretim servisine
bağlanmaz; `scripts/gen-assets.mjs` ile yerel üretilir (CC0/self lisans).
`scripts/check-no-paid-config.mjs` her `npm run verify` içinde ücretli plana
geçiş tetikleyen yapılandırmayı reddeder.

## 5. GitHub deposu gereksinimi

Geliştirme **mevcut `mekayildiz/kul-ve-taht` deposunda** yürütülür; yeni depo
açılmaz. Dal: `feat/kul-ve-taht-development`. Not: depo salt-okunur bir
entegrasyon token'ıyla erişildiğinde push engellenebilir; bu durum
`docs/yedekleme-durumu.md` içinde açıkça raporlanmıştır.

## 6. Görev yürütme planı

| Görev türü | Yürütücü uzmanlık | Araç/çıktı |
|---|---|---|
| Teknik geliştirme | Kod ajanı | TypeScript monorepo, Workers, D1 migration, vitest |
| Arayüz | UI/UX ajanı | `app/src/screens/*`, i18n TR+EN, mobil alt gezinme |
| Görseller | Görsel ajanı | `scripts/gen-assets.mjs`, `assets/*`, `assets/manifest.json` |
| Veritabanı | Kod/mimari ajanı | `db/migrations/*.sql`, `functions/src/db/client.ts` |
| Güvenlik | Güvenlik ajanı | Sunucu otoritesi, authz, `security.test.ts` |
| Test | Test ajanı | `vitest`, 480 test, `npm run verify` |
| Performans/kota | Performans ajanı | `quota/*`, `scripts/load-restore-rehearsal.mjs` |
| Yayın | Yayın ajanı | `docs/yayin-kilavuzu.md`, `scripts/push-to-github.sh` |

## 7. Tamamlanan P3 işleri (bu tur)

- **E9.16 Yönetici arayüzleri:** `functions/src/admin/console.ts` (özet, karakter
  listesi, durum değiştirme, ekonomi), `/api/admin/*`, `AdminPanel.tsx`, 3 UI
  testi + 5 birim testi.
- **E9.17 Bildirim + erişilebilirlik:** bildirim özeti/okundu, öncelik eşiği,
  `aria-label`/`role="alert"`, tablo `scope` başlıkları, klavye erişimi.
- **E9.14/E9.15 Görsel varlıklar:** `scripts/gen-assets.mjs` ile 40 portre
  havuzu + 7 ikon + arma + harita ve 96/64px türevler; `WorldOverview.tsx`
  varlık galerisi + veri tasarrufu modu + lisans atıfları.
- **E9.18 Yük/yedek provası:** `scripts/load-restore-rehearsal.mjs` — 88 tablo,
  141 satır, D1→R2 dump ve veri kayıpsız geri yükleme; ücretsiz limit içinde.
- **E9.13 P2 arayüz/testleri** doğrulandı ve panoya işlendi.

Doğrulama: `npm run verify` → lint 0 hata, tip kontrolü temiz, build başarılı,
**480 test geçti**, 0 TL denetimi geçti.

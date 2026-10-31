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
**497 test geçti**, 0 TL denetimi geçti.

## 8. G1–G6 boşluk kapatma turu (bu tur)

Önceki turda "modül olarak var ama oynanışa bağlı değil" durumunda kalan
fonksiyonlar gerçek sistemlere bağlandı ve **gerçek ağ/kapalı test ölçümleri
sayısal olarak kaydedildi** (iddia değil, ölçüm).

### 8.1 G1 — `advanceCharacterDay` dünya saatine bağlandı

- Yeni migration `db/migrations/0020_character_daily_advance.sql`:
  `character_state.last_advanced_day` sütunu (çift ilerlemeyi önler).
- `functions/src/play/service.ts`: `advanceCharacterDay(db, id, targetDay?, nowMs?)`
  artık hedef oyun gününe kadar **açlık + uzun açlık hasarı (`starvationDamage`)
  + günlük toparlanma + yaşlanma** uygular; `last_advanced_day` sayesinde
  **idempotenttir** (aynı gün tekrar uygulanmaz). Ölümde `settleDeath` ile
  miras işlenir (belge 6, 7.6, 12.8).
- Yeni `advanceAllCharacters(db, gameDay, limit=200)`: canlı karakterleri
  partili ilerletir (yazma kotası dostu).
- `functions/src/index.ts`: `/api/world/time` ilerlemesinde **ve** saatlik cron
  dünya turunda `runWorldSimulation` yanında `advanceAllCharacters` çağrılır.

### 8.2 G2 — `areMutualFriends` gerçek sisteme bağlandı

- `functions/src/play/multiplayer-extras.ts`: sorgu, var olmayan `relationships`
  sütunlarından **oynanışta yazılan `character_social`** tablosuna düzeltildi.
- `functions/src/play/multiplayer.ts`: oyuncu–oyuncu evliliği artık **karşılıklı
  arkadaşlık** (iki taraflı kayıt) gerektirir; tek taraflı istek
  `no_mutual_consent` ile reddedilir (belge 7.1, 16.3). NPC evliliği etkilenmez.

### 8.3 G3 — `auditKingdomCorruption` gerçek sisteme bağlandı

- `functions/src/index.ts`: yeni yönetici ucu `POST /api/admin/corruption/audit`.
  Kayıtlı gelir ile hazineye ulaşan gerçek gelir arasındaki fark denetim
  gücüyle ortaya çıkarılır, kayıp hazineye döner ve krallık yolsuzluk oranı
  güncellenir; sonuç `audit_log`'a yazılır (belge 9.8, 21.1).

### 8.4 G4 — `recordDarkMagicCrime` gerçek sisteme bağlandı

- `functions/src/play/service.ts`: `performCastSpell` yasaklı krallıkta kara
  büyü kullanımını `recordDarkMagicCrime` ile **tespit eder** (`detail.outlawed`).
- `functions/src/index.ts`: `castSpell` aksiyonunda tespit doğruysa tam yargı
  akışı `performCrime(..., "dark_magic", 60)` ile işlenir (belge 13.1, 13.4).

### 8.5 G5 — Gerçek ağ ve kapalı test ölçümleri (kayıtlı)

Yerel Workers (Miniflare, **hesap gerekmez, 0 TL**) sunucusuna gerçek HTTP
istekleri gönderildi.

- `scripts/network-measurement.mjs` → `docs/olcum/ag-olcumu.json`:
  300 gerçek istek, **0 hata**, ~102–110 istek/sn, gecikme ort. ~9 ms,
  p95 ~11 ms; kota raporu **379/100.000 istek (%0,38) — ücretsiz sınır içinde**.
- `scripts/closed-test.mjs` → `docs/olcum/kapali-test.json`: 14 adımlı uçtan
  uca akış (kayıt → karakter → iş/dinlenme/keşif/ticaret/ilişki → durum →
  bildirim → yönetici uçları), **14/14 geçti, 0 hata**; tüm doğrulamalar
  (`characterCreated`, `playStateRead`, `socialListed`, `corruptionDetected`,
  `quotaWithinFreeTier`) `true`.

### 8.6 G6 — Bu belge güncellendi

Yeni dosya oluşturulmadı; mevcut `docs/analiz-ve-plan.md` güncellendi.

### 8.7 Doğrulama (bu tur)

- `npm run verify` → lint 0 hata, tip kontrolü temiz, build başarılı,
  **52 dosya / 497 test geçti**, 0 TL denetimi geçti.
- Korunan belge `Kul_ve_Taht.txt` md5 `563e0708d1fdc3c833c92437586dacd2`
  **değişmedi**; 21.5 ve 26. bölümler yerinde.

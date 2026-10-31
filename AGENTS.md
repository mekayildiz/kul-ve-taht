# AGENTS.md — Kül ve Taht

## Proje özeti

Çevrimiçi, kalıcı dünyalı, metin tabanlı ortaçağ-fantezi RPG/strateji oyunu.
Cloudflare **ücretsiz** katmanında çalışır (Pages/Workers/D1/R2/Durable
Objects/Workflows). **0 TL şartı bağlayıcıdır**; ücretli plana geçiş yoktur.

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
- `assets/` — görsel varlık manifesti (BLOB yok; dosyalar R2'de).

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

## Kurallar

- **Test edilmeyen görev "tamamlandı" işaretlenmez.**
- Her özellik sunucuda doğrulanır; istemciden gelen para/eşya/sahiplik yok sayılır.
- Görseller yerel üretilir (`scripts/gen-assets.mjs`), CC0/self lisanslıdır;
  harici indirme veya atıf zorunluluğu yoktur.
- Kota aşımı 429/202/503 ile karşılanır; **402/ödeme üretilmez**.
- İlerleme `docs/gorev-panosu.md` panosunda ve `docs/yedekleme-durumu.md`'de izlenir.

## GitHub durumu

`feat/kul-ve-taht-development` dalı `origin`'e gönderilebilir (push çalışır).
Ayrıntı: `docs/yedekleme-durumu.md`. Her aşama sonunda bundle yenilenir.

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

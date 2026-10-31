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
npm run dev:api          # yerel Worker (Miniflare; hesap gerekmez, ücretsiz)
npm run db:migrate:local # yerel D1'e migration uygula
npm run deploy:api       # üretim Worker yayını (ücretsiz katman)
npm run deploy:web       # Cloudflare Pages yayını (ücretsiz katman)
```

Yayın adımları: `docs/yayin-kilavuzu.md`.

## Kurallar

- **Test edilmeyen görev "tamamlandı" işaretlenmez.**
- Her özellik sunucuda doğrulanır; istemciden gelen para/eşya/sahiplik yok sayılır.
- Yalnızca ücretsiz lisanslı görseller (CC0, CC-BY) kullanılır.
- Kota aşımı 429/202/503 ile karşılanır; **402/ödeme üretilmez**.
- İlerleme `docs/gorev-panosu.md` panosunda ve `docs/yedekleme-durumu.md`'de izlenir.

## Bilinen engel

`GITHUB_TOKEN` yazma yetkisi olmayan bir kurulum belirtecidir: repo okuma 200,
`git push` ve API yazma 403. Çözüm için `docs/yedekleme-durumu.md` içindeki tek
kullanıcı müdahalesine bakın.

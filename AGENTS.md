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
  - `play/` kalıcı oynanış durumu (istemci OTORİTE DEĞİLDİR),
  - `economy/` pazar + mülk/şirket, `military/` ordu/savaş, `npc/` simülasyon,
  - `family/` hanedan/miras, `politics/` makam/konsey, `social/` sohbet,
  - `quests/`, `inventory/`, `health/`, `justice/`, `travel/`, `assets/` görsel kayıt,
  - `quota/` 0 TL kota koruması.
- `app/src/` — React arayüz (ekranlar, i18n TR/EN, API istemcisi).
- `db/migrations/` — D1 şeması + referans veri (130 yerleşim).
- `assets/` — görsel varlık manifesti (BLOB yok; dosyalar R2'de).

## Komutlar

```bash
npm run verify   # lint + typecheck + build + test + 0 TL denetimi (zorunlu)
npx vitest run <dosya>   # tek test dosyası
```

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

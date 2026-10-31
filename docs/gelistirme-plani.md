# Kül ve Taht — Analiz ve Geliştirme Planı

Bu belge, tasarım belgesinin (`Kul_ve_Taht.txt`, md5 `563e0708…`) tam
incelenmesinin ardından hazırlanan analiz, eksik gereksinim ve uygulama
planıdır. **Tasarım belgesi 21.5 ve 26. bölümlerdeki yapay zekâ aracı
koordinasyon talimatları aynen korunur; değiştirilmemiştir.**

## 1. Kapsam kararları (bağlayıcı)

| # | Karar |
|---|---|
| 1 | Mevcut GitHub deposu kullanılır: `mekayildiz/kul-ve-taht` (yeni depo açılmaz) |
| 2 | **130 yerleşim** ve **ertelenen tüm özellikler** nihai kapsamdadır |
| 3 | 21.5 ve 26. bölümler (AI araç koordinasyonu) **korunur** |
| 4 | Bütçe **0 TL** — yalnızca doğrulanmış ücretsiz Cloudflare/GitHub katmanları |
| 5 | React+TS (mobil öncelikli) → Worker statik varlık sistemi; Workers + Durable Objects + D1 |

### Ertelenmiş → nihai kapsama alınan özellikler

- Ayrıntılı karakter görünüş editörü (belge 5.4, 20) — **E2.5 tamamlandı**
- Ayrıntılı tıp sistemi (belge 6/7) — E3.3
- Suç, yargı, hapishane/kaçış (belge 9) — E3.4
- Kuşatma (belge 11) — E5.2
- Deniz savaşları + gemi sınıfları (belge 11) — E5.3
- Binlerce NPC katmanlı simülasyon (belge 10) — E6.2
- Şirket birleşme/devralma (belge 12) — E4.5

## 2. Bütçe ve ücretsiz kullanım değerlendirmesi

Tüm sınırlar resmî belgeden doğrulanmıştır (bkz. `docs/arac-kaydi.md`,
`docs/kota-butcesi.md`). Kritik bulgular:

- **Workers HTTP isteği 10 ms CPU** ile sınırlıdır. PBKDF2 (600.000 iterasyon,
  OWASP düzeyi) bu bütçeye sığmaz → parola hash işlemi **Durable Object**
  içinde (30 s CPU) çalıştırılır. **Ölçüldü:** medyan 84 ms / maks 96 ms
  (`scripts/bench-pbkdf2.mjs`) → güvenlikten taviz vermeden sığar.
- **D1 Free** satır yazma 100.000/gün. Yüksek frekanslı yazma gerektiren
  canlı durum (savaş, sohbet) DO'da tutulur; D1'e toplu yazılır.
- **Worker `[assets]`** statik sistemi → görsel depolama için ücretsiz; yedekleme D1 Time Travel.
- `check-no-paid-config.mjs` her doğrulamada ücretli plana geçiş tetikleyen
  yapılandırmayı reddeder (CI'da zorunlu).

**Sonuç:** Proje 0 TL şartına uygundur. Hiçbir ücretli kredi, abonelik veya
API kullanılmaz. Yerel geliştirme Miniflare ile hesap/ödeme gerektirmez.

## 3. GitHub deposu gereksinimi

**Gerekli ve mevcut:** `mekayildiz/kul-ve-taht`. CI (lint/tip/test) ve
Cloudflare Pages/Workers dağıtımı bu depoya bağlanır.

> **⚠️ ENGELLEYİCİ:** Ortamdaki `GITHUB_TOKEN`, yalnızca `metadata=read`
> yetkili bir GitHub App kurulum belirtecidir. `git push` **403** verir
> ("Resource not accessible by integration"). API ile yazma testi de
> reddedildi. Depoya yazma yetkisi verilmesi **kullanıcı müdahalesi**
> gerektirir. Tüm çalışma yerel olarak commit'lidir ve
> `/tmp/kvt-bundle/kul-ve-taht-feat.bundle` paketinde saklanmıştır.

## 4. Görev yürütme planı

| Alan | Yürütme |
|---|---|
| Teknik geliştirme | TypeScript strict; sağlayıcı-bağımsız veri katmanı; modüller `functions/src/{auth,world,character,time,quota,durable}` |
| Arayüz | React+TS, mobil öncelikli; API istemcisi (`app/src/api/client.ts`); TR varsayılan + EN; erişilebilirlik (rol/etiket) |
| Görseller | CC0/CC BY kaynaklar (Kenney, Game-icons); `assets/manifest.json` kimlik+lisans kaydı; 40 portrelik havuz |
| Veritabanı | D1 + SQLite ortak alt kümesi; migration'lar `db/migrations`; referans veri migration olarak üretilir (`npm run gen:world`) |
| Güvenlik | PBKDF2 600k (DO); HMAC oturum; sunucu tarafı yetkilendirme (RLS yok); hız sınırı; istemci asla otorite değil |
| Test | Vitest; gerçek SQLite donanımı; Miniflare uçtan uca; her aşama sonunda `npm run verify` |

## 5. Mevcut durum (aşama panosu)

Bkz. `docs/gorev-panosu.md`. E1 aşaması büyük ölçüde tamamlandı; E2
karakter sistemi başladı. Ölçülen doğrulama: **101/101 test geçiyor**,
lint 0 hata, typecheck temiz, build başarılı, 0 TL denetimi geçiyor.

## 6. Sonraki adımlar

1. E3 — oynanış ve yaşam (keşif, envanter, üretim, tıp, suç/yargı, seyahat)
2. E4 — ekonomi ve mülkiyet (pazar, kervan/deniz ticareti, bankacılık, vergi)
3. E5 — askerî ve siyasi (birlikler, kuşatma, deniz savaşı, diplomasi)
4. E6 — NPC, aile/kuşaklar, çok oyunculu
5. E7 — görsel varlıklar, portreler, kapsamlı testler ve yayın

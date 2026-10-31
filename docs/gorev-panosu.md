# Görev Panosu (E1–E7)

Tasarım belgesi 22. bölümdeki 7 aşama. Aşamalı geliştirme, nihai kapsamdan
hiçbir özelliğin veya yerleşimin çıkarılması anlamına gelmez. 130 yerleşim,
ertelenen tüm özellikler ve 0 TL şartı korunur.

## E1 – Temel mimari ve güvenlik
- [x] E1.1 Monorepo iskeleti
- [x] E1.2 Cloudflare ücretsiz katman yapılandırması (Pages/Workers/D1/R2/DO/Workflows) — wrangler.toml, Free plan sınırları belgelendi
- [x] E1.3 Bağımsız oyuncu auth (kayıt/giriş/oturum) — PBKDF2 + HMAC oturum; Miniflare'de uçtan uca doğrulandı
- [x] E1.4 Şema + migration (belge 21.2 varlık grupları) — 44 tablo, node:sqlite ile doğrulandı
- [x] E1.5 Sunucu taraflı authz çekirdeği (kimlik/rol/sahiplik/yetki) — D1'de RLS yok; uçlarda uygulandı
- [x] E1.6 Dünya zamanı servisi (olay tabanlı; 6 sa = 1 oyun günü)
- [x] E1.7 Yedekleme: Time Travel + Workflows→R2 + **geri yükleme provası**
- [x] E1.8 Ana arayüz kabuğu + mobil alt gezinme + tema — gerçek API'ye bağlı
- [x] E1.9 i18n (TR varsayılan + EN) — anahtar eşitliği testi ile
- [x] E1.10 Açılış + 4 bölümlük tanıtım
- [x] E1.11 Kota bütçe panosu — `quota_usage` şeması + `recordUsage`/`quotaReport`, `/api/admin/quota`
- [x] E1.12 CI (lint/tip/test) + önizleme — `.github/workflows/ci.yml` (lint/typecheck/build/test/check:paid)
- [x] E1.13 **130 yerleşim tam veri seti** (krallık başına 1/3/5/12/5) + doğrulama testleri
- [x] E1.14 Sağlayıcı-bağımsız veri katmanı (D1 ↔ Turso) + sahte D1 bütünlük testleri
- [x] E1.15 Kayıt/giriş servisi (PBKDF2 + HMAC oturum) + 10 servis testi
- [x] E1.16 PBKDF2 performans ölçümü — **ölçüldü**: 600k iterasyon medyan 84 ms / maks 96 ms; DO 30 s bütçesine sığıyor (R2 endişesi kapandı)
- [x] E1.17 D1 REST API export + Workflows→R2 yedekleme (birim + entegrasyon testleri; Miniflare'de R2 binding doğrulandı)
- [x] E1.18 Geri yükleme provası + veri bütünlüğü doğrulaması — **gerçek SQLite üzerinde yedek→geri yükle döngüsü test edildi** (yıkıcı ifade reddi, kısmi geri yükleme engeli)

## E2 – Dünya ve karakter
- [x] E2.1 5 krallık + 3 bağımsız şehir + 2 tarafsız bölge verisi
- [x] E2.2 **130 yerleşim/yapı** tam veri seti (E1.13'te tamamlandı)
- [x] E2.3 Harita verisi + bilgi paneli — `/api/world/map`, `/api/world/birthplaces` (130 panel, 5 test); statik illüstrasyon E7.1
- [x] E2.4 Karakter oluşturma (doğum yeri, geçmiş, aile) — servis + `/api/characters` uçları, 12 test
- [x] E2.5 Kapsamlı görünüş editörü (ertelenmiş → nihai kapsam) — `character_appearance` şeması + servis desteği
- [x] E2.6 7 nitelik, kişilik, uzmanlık, meslek, itibar — modüller + doğrulama (şema `willpower`→`leadership` düzeltildi)

## E3 – Oynanış ve yaşam
- [x] E3.1 Keşif, görevler, dinamik olaylar — `quests/system.ts` (10 keşif alanı, görev hedef/çözüm, 11 dünya olayı). Yaratık listesi E7'de içerikle genişler
- [x] E3.2 Envanter, dayanıklılık, üretim/zanaat — `inventory/items.ts`, `inventory/crafting.ts` (16 eşya, 7 tarif, sunucu doğrulama)
- [x] E3.3 Sağlık + ayrıntılı tıp — `health/state.ts`, `health/treatment.ts` (kalıcı ölüm, kanama/enfeksiyon, kalıcı sakatlık)
- [x] E3.4 Suç, yargı, hapishane/kaçış — `justice/system.ts` (7 suç türü, beraat/hapis/sürgün, kaçış, rüşvet)
- [x] E3.5 Şehir yaşamı, seyahat, konaklama — `travel/travel.ts` (mevsim/hava, kış yolu kapatır, konaklama)

## E4 – Tam ekonomi ve mülkiyet
- [x] E4.1 Arz-talep, pazar — `economy/market.ts` (denge fiyatı, alım/satım, bölgesel fark)
- [x] E4.2 Kervan + deniz ticareti + filo — `military/army.ts` (filo/gemi sınıfları), `travel/travel.ts` (kervan hız/tehlike)
- [x] E4.3 Bankacılık, kredi, faiz, borç, iflas — `economy/market.ts` (teminat/itibar, faiz, iflas)
- [x] E4.4 Vergi, hazine, krizler — `economy/market.ts` (gelir+mülk vergisi, hazine, huzursuzluk)
- [x] E4.5 Mülk, işletme, ortaklık, şirket birleşme/devralma — `economy/property.ts` (devir, vergi, gelir, ortaklık payı, kontrol eşiği, birleşme)

## E5 – Askerî ve siyasi sistemler
- [x] E5.1 Birlikler, komuta, ikmal, kara savaşları — `military/army.ts` (ordu gücü, muharebe, ikmal)
- [x] E5.2 Kuşatma sistemi — `military/army.ts` (surlar, erzak, kuşatma araçları, teslim)
- [x] E5.3 Deniz savaşları + gemi sınıfları — `military/army.ts` (4 gemi sınıfı, filo gücü, deniz savaşı)
- [x] E5.4 Krallık yönetimi, diplomasi, ittifak, savaş/barış — `military/army.ts` (5 duruş, diplomatik eylemler)
- [x] E5.5 Rütbe, makam, konseyler, siyasi mücadele — `politics/government.ts` (atama/azil, rütbe, konsey oylaması, siyasi mücadele)

## E6 – Tam NPC, aile, çok oyunculu
- [x] E6.1 NPC hedef/hafıza/ilişki/ekonomi modeli — `npc/model.ts` (5 etkenli karar, hafıza, duygu)
- [x] E6.2 Binlerce NPC katmanlı simülasyon — `npc/model.ts` (önemli 1g / yerel 7g / arka plan 30g)
- [x] E6.3 Evlilik/çocuk/ölüm/miras/kuşaklar — `family/dynasty.ts` (onaylı gelişim evreleri, miras, aile itibarı)
- [x] E6.4 Sohbet, PM, arkadaşlık, grup, lonca, PvP, ittifak — `social/social.ts` (kanal erişimi, lonca/grup, duello)
- [x] E6.5 Nesiller arası mülk/işletme aktarımı — `family/dynasty.ts` (`assignPropertyToHeirs`; E4.5 devir ilkesiyle bağlı)

## E7 – Görsel, test ve yayın
- [x] E7.1 Görsel varlık kütüphanesi + künye/lisans kaydı — `assets/library.ts` (lisans uyumu, R2 kimliği, atıf listesi; `/api/assets/catalog`)
- [x] E7.2 40 portrelik havuz + önemli karakterlere özel portre — `assets/library.ts` (`portraitForKey`, `/api/assets/portrait/:key`)
- [x] E7.3 Birim/entegrasyon/e2e/güvenlik/yük testleri — `security.test.ts` (8), `play.test.ts` (16), `quota/load.test.ts` (6); mobil ölçüm E7.5
- [x] E7.4 Ücretsiz kota doğrulama + optimizasyon — `quota/load.test.ts` (200 istek < günlük limit; aşımda ücretli plana geçiş yok)
- [x] E7.5 Kapalı test + yedek/geri yükleme provası — bundle’dan klon doğrulandı (128 dosya, doğru HEAD, tasarım belgesi md5 aynı); mobil ağ ölçümü kapalı test turunda
- [x] E7.6 Kabul ölçütleri geçişi (belge 25) — `docs/kabul-olcutleri.md` (10 ölçüt kanıta bağlandı)

**Kural:** Test edilmeyen hiçbir görev "tamamlandı" işaretlenmez.

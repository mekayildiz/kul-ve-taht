# Görev Panosu (E1–E7)

Tasarım belgesi 22. bölümdeki 7 aşama. Aşamalı geliştirme, nihai kapsamdan
hiçbir özelliğin veya yerleşimin çıkarılması anlamına gelmez. 130 yerleşim,
ertelenen tüm özellikler ve 0 TL şartı korunur.

## E1 – Temel mimari ve güvenlik
- [x] E1.1 Monorepo iskeleti
- [ ] E1.2 Cloudflare ücretsiz katman yapılandırması (Pages/Workers/D1/R2/DO/Workflows)
- [ ] E1.3 Bağımsız oyuncu auth (kayıt/giriş/oturum) + PBKDF2 performans testi (DO içinde)
- [x] E1.4 Şema + migration (belge 21.2 varlık grupları) — 44 tablo, node:sqlite ile doğrulandı
- [ ] E1.5 Sunucu taraflı authz çekirdeği (kimlik/rol/sahiplik/yetki) — D1'de RLS yok
- [x] E1.6 Dünya zamanı servisi (olay tabanlı; 6 sa = 1 oyun günü)
- [ ] E1.7 Yedekleme: Time Travel + Workflows→R2 + **geri yükleme provası**
- [ ] E1.8 Ana arayüz kabuğu + mobil alt gezinme + tema
- [ ] E1.9 i18n (TR varsayılan + EN)
- [ ] E1.10 Açılış + 4 bölümlük tanıtım
- [ ] E1.11 Kota bütçe panosu (istek/CPU/D1 satır/DO)
- [ ] E1.12 CI (lint/tip/test) + önizleme
- [x] E1.13 **130 yerleşim tam veri seti** (krallık başına 1/3/5/12/5) + doğrulama testleri
- [x] E1.14 Sağlayıcı-bağımsız veri katmanı (D1 ↔ Turso) + sahte D1 bütünlük testleri
- [x] E1.15 Kayıt/giriş servisi (PBKDF2 + HMAC oturum) + 10 servis testi
- [x] E1.16 PBKDF2 performans ölçümü — **ölçüldü**: 600k iterasyon medyan 84 ms / maks 96 ms; DO 30 s bütçesine sığıyor (R2 endişesi kapandı)
- [x] E1.17 D1 REST API export + Workflows→R2 yedekleme (birim + entegrasyon testleri; Miniflare'de R2 binding doğrulandı)
- [x] E1.18 Geri yükleme provası + veri bütünlüğü doğrulaması — **gerçek SQLite üzerinde yedek→geri yükle döngüsü test edildi** (yıkıcı ifade reddi, kısmi geri yükleme engeli)

## E2 – Dünya ve karakter
- [x] E2.1 5 krallık + 3 bağımsız şehir + 2 tarafsız bölge verisi
- [x] E2.2 **130 yerleşim/yapı** tam veri seti (E1.13'te tamamlandı)
- [ ] E2.3 Harita verisi + statik illüstrasyon + bilgi paneli
- [ ] E2.4 Karakter oluşturma (doğum yeri, geçmiş, aile)
- [ ] E2.5 Kapsamlı görünüş editörü (ertelenmiş → nihai kapsam)
- [ ] E2.6 7 nitelik, kişilik, uzmanlık, meslek, itibar

## E3 – Oynanış ve yaşam
- [ ] E3.1 Keşif, görevler, dinamik olaylar, yaratıklar
- [ ] E3.2 Envanter, dayanıklılık, üretim/zanaat
- [ ] E3.3 Sağlık + ayrıntılı tıp (ertelenmiş → nihai kapsam)
- [ ] E3.4 Suç, yargı, hapishane/kaçış (ertelenmiş → nihai kapsam)
- [ ] E3.5 Şehir yaşamı, etkinlikler, seyahat, konaklama

## E4 – Tam ekonomi ve mülkiyet
- [ ] E4.1 Arz-talep, üretim/tüketim, pazar
- [ ] E4.2 Kervan + deniz ticareti + filo
- [ ] E4.3 Bankacılık, kredi, faiz, borç, iflas
- [ ] E4.4 Vergi, hazine, devlet borcu, krizler
- [ ] E4.5 Mülk, işletme, ortaklık, şirket birleşme/devralma (ertelenmiş)

## E5 – Askerî ve siyasi sistemler
- [ ] E5.1 Birlikler, komuta, ikmal, büyük kara savaşları
- [ ] E5.2 Kuşatma sistemi (ertelenmiş)
- [ ] E5.3 Deniz savaşları + gemi sınıfları + liman/filo (ertelenmiş)
- [ ] E5.4 Krallık yönetimi, diplomasi, ittifak, savaş/barış
- [ ] E5.5 Rütbe, makam, konseyler, siyasi mücadele

## E6 – Tam NPC, aile, çok oyunculu
- [ ] E6.1 NPC hedef/hafıza/ilişki/ekonomi modeli
- [ ] E6.2 Binlerce NPC katmanlı simülasyon (ertelenmiş)
- [ ] E6.3 Evlilik/çocuk/eğitim/yaşlanma/ölüm/miras/kuşaklar
- [ ] E6.4 Sohbet, PM, arkadaşlık, grup, lonca, PvP, ittifak
- [ ] E6.5 Nesiller arası mülk/işletme aktarımı

## E7 – Görsel, test ve yayın
- [ ] E7.1 Tutarlı görsel varlık kütüphanesi + künye/lisans kaydı
- [ ] E7.2 40 portrelik havuz + önemli karakterlere özel portre
- [ ] E7.3 Birim/entegrasyon/e2e/mobil/güvenlik/yük testleri
- [ ] E7.4 Ücretsiz kota doğrulama + optimizasyon
- [ ] E7.5 Kapalı test + yedek/geri yükleme provası
- [ ] E7.6 Kabul ölçütleri geçişi (belge 25)

**Kural:** Test edilmeyen hiçbir görev "tamamlandı" işaretlenmez.

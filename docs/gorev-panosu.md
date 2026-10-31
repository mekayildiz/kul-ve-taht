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

## E8 – Ertelenen özelliklerin nihai kapsama alınması

Belgede ertelenmiş sayılan ancak nihai kapsamda istenen sistemler. Her biri
sunucu otoriteli servis + API ucu + arayüz + test ile tamamlandı.

- [x] E8.1 Geçim/üretim: tarım (ekim/hasat), hayvancılık, avcılık, evcilleştirme, kıtlık riski — `livelihood/production.ts` (12 test)
- [x] E8.2 Büyü ve inanç: büyü yolları, öğrenme/kullanma, enerji, kara büyü suçu, tapınak hizmetleri, loncalar — `magic/lore.ts` (13 test)
- [x] E8.3 Ekonomi tamamlayıcıları: depolama/bozulma, açık artırma, kira, tekel, piyasa bozulması, devlet bütçesi, yolsuzluk — `economy/extras.ts` (12 test)
- [x] E8.4 Bildirimler: öncelik eşikli, arka planı tek satırda toplayan özet (belge 19) — `notify/notifications.ts` (5 test) + `/api/notifications`, `/api/notifications/read`
- [x] E8.5 Yeraltı ve suç örgütleri: hırsızlık/kaçakçılık/dolandırıcılık/suikast/karaborsa, çete itibarı — `underworld/gangs.ts` (10 test)
- [x] E8.6 Belge 20: 130 yerleşimin **tamamı** için nüfus/ekonomi/yönetim/güvenlik/ulaşım/mevsim/siyasi bağlılık profili — `world/settlement-profile.ts` (7 test)
- [x] E8.7 Oynanış katmanı bağlantısı: 12 yeni sunucu-taraflı aksiyon + `/api/catalog` keşif ucu — `play/service.ts`, `index.ts` (14 API testi)
- [x] E8.8 Arayüz: tarım, av, büyü, tapınak, lonca, şehir etkinlikleri ve yeraltı panelleri — `app/src/screens/PlayPanel.tsx` (6 arayüz testi)
- [x] E8.9 i18n: tüm yeni anahtarlar TR + EN (anahtar eşitliği testi)
- [x] E8.10 Yerel uçtan uca doğrulama: Miniflare'de gerçek kayıt → karakter → aksiyon akışı çalıştırıldı
- [x] E8.11 Askeri sistem bağlantısı (belge 14.5, 11): birlik toplama, ikmal, kara savaşı, kuşatma, gemi inşası, deniz savaşı — `play/systems.ts` (sunucu otoriteli), `/api/play/:id/action` + state ucu
- [x] E8.12 Ekonomi bağlantısı (belge 9.6–9.12): kredi alma/ödeme, mülk satın alma, işletme geliri, vergi — `play/systems.ts`
- [x] E8.13 Adalet bağlantısı (belge 13.4–13.5): suç işleme, yakalanma, yargılama, hapis, kaçış — `play/systems.ts`
- [x] E8.14 Dövüş bağlantısı (belge 14.1–14.4, 16.5): tekil dövüş ve güvenli şehir/riza kurallı düello — `play/systems.ts`
- [x] E8.15 Sosyal ve siyasi bağlantı (belge 10, 16.3–16.4): ilişki kurma, makam/rütbe, diplomasi — `play/systems.ts`
- [x] E8.16 Arayüz genişletmesi: askeri, ekonomi, adalet, dövüş, sosyal ve siyaset panelleri — `PlayPanel.tsx` (8 arayüz testi)
- [x] E8.17 Veritabanı: yeni kalıcı tablolar (`character_units`, `character_ships`, `character_loans`, `character_properties`, `character_prison`, `character_social`, `character_offices`, `character_family`) — `db/migrations/0007_systems_state.sql`
- [x] E8.18 API testleri: 19 yeni uçtan uca test (`systems-api.test.ts`) — toplam 390 test geçiyor
- [x] E8.19 Çok oyunculu sohbet (belge 16.2): genel/yerel/lonca/özel kanal, sunucu taraflı erişim ve uzunluk doğrulaması, `/api/chat` geçmiş ucu — `play/multiplayer.ts`
- [x] E8.20 Aile ve hanedan (belge 7): evlilik (yaş + tek eş kuralı), çocuk sahibi olma, hanedan kaydı — `play/multiplayer.ts`, `character_family` tablosu
- [x] E8.21 Bildirim yayma (belge 19): evlilik/çocuk/özel mesaj olayları hesaba bildirim yazar; öncelik eşiği özeti — `notifyCharacter`
- [x] E8.22 Arayüz: aile paneli + sohbet paneli (mesaj listesi ve gönderme) — `PlayPanel.tsx`
- [x] E8.23 Test: 7 yeni API testi + 2 yeni arayüz testi — toplam 400 test geçiyor
- [x] E8.24 NPC simülasyonunu çalıştırma (belge 8.8): katmanlı ve partili dünya turu — `play/world-sim.ts` (önemli 1g / yerel 7g / arka plan 30g, parti limiti 50)
- [x] E8.25 NPC tohumlama (belge 8.8): 130+ yerleşime katmanlı NPC üretimi (~950 NPC) — `world/seed.ts`
- [x] E8.26 Ekonomi tamamlayıcıları bağlantısı (belge 9.4): bozulma olayları pazar çarpanı + dünya olay günlüğü — `market_state`, `world_event_log`
- [x] E8.27 Zamanlanmış dünya turu (belge 8.8): Free plan Cron Trigger (saatlik) + dünya saati ilerlemesinde tetikleme — `wrangler.toml`, `scheduled()`
- [x] E8.28 Yeni kalıcı tablolar (belge 9, 10, 18): `market_state`, `auctions`, `offices`, `character_quests` + NPC simülasyon kolonları — `db/migrations/0008_world_simulation.sql`
- [x] E8.29 Test: 10 yeni simülasyon testi (`world-sim.test.ts`) — toplam 410 test geçiyor
- [x] E8.30 Siyasi sistem bağlantısı (belge 10–11): makam tek sahipli, rütbe yükseltme ve siyasi mücadele sunucuda çözülür — `play/systems.ts` + `politics/government.ts`
- [x] E8.31 Saray makamları (belge 8.7): oyun başında hükümdardan kâtibe kadar makamlar NPC'lerle dolu — `world/seed.ts` (`seedCourtOffices`)
- [x] E8.32 NPC yönetimi (belge 8.7): boş makamlar dünya turunda NPC'lerle doldurulur — `world-sim.ts` (`assignNpcOffices`)
- [x] E8.33 Test: 4 yeni siyaset/makam testi — toplam 414 test geçiyor

- [x] E8.34 Görev kataloğu ve günlüğü (belge 12.4, 18.3): ana hikâye/yan/iş/keşif/kriz görevleri, çok çözümlü hedefler, sunucu otoriteli ilerleme — `play/quests.ts`, `/api/quests`, `character_quests.progress_json`
- [x] E8.35 Açık artırma (belge 9.3): sunucu otoriteli teklif doğrulama, rezerv fiyat, kapanınca eşya el değiştirir ve satıcıya altın geçer — `play/auctions.ts`, `/api/auctions`, `auctions.seller_id`
- [x] E8.36 Pazar fiyatı bağlantısı (belge 9.2, 9.4): yerleşim bazlı arz/talep + bozulma çarpanı, alım-satım pazarı kalıcı günceller — `play/market-state.ts`, `/api/market?settlementId=`
- [x] E8.37 Arayüz + test: görev günlüğü ve açık artırma panelleri (3 yeni arayüz testi) + 6 yeni API testi — toplam 423 test geçiyor

## E8.38–E8.42 Tam kapsam bağlantıları (belge 7, 9, 10, 13, 20)

Belge 20 "tam oyun kapsamı" gereği daha önce modülleri yazılmış ancak oynanışa
bağlanmamış sistemler sunucu otoriteli servis + API ucu + arayüz + test ile tamamlandı.

- [x] E8.38 Depolama kapasitesi ve bozulma bağlantısı (belge 9.3): envanter sınırlı depoya sahip; gıda/ilaç gün gün bozulur, depo dolunca alım reddedilir (`storage_full`) — `play/storage.ts`, `play/service.ts`, `/api/play/:id/state.storage`, arayüz depo göstergesi
- [x] E8.39 Bölgesel tekel ve devlet müdahalesi (belge 9.4, 9.9): pazar payı eşiği aşılırsa fiyat çarpanı; hazineden tahıl sürerek fiyat baskılama — `play/storage.ts` (`monopolyFactor`, `interveneMarket`), `/api/market` `monopoly` alanı, `/api/admin/market/intervene`
- [x] E8.40 Devlet bütçesi ve yolsuzluk (belge 9.7–9.9): aylık vergi/gider turu, borç krizi, yolsuzluk oranı ve denetim — `play/storage.ts` (`runKingdomBudget`, `auditKingdomCorruption`), zamanlanmış tur (`gameDay % 30`), `/api/admin/budget/run`, `kingdoms.corruption`
- [x] E8.41 Ölüm, miras ve kuşak devri (belge 7.6): ölüm kalıcı; altın/mülk/unvan varislere geçer, anlaşmazlık hane itibarını düşürür; gün ilerlemesi ve yolculuk ölümle sonuçlanırsa işlenir — `play/succession.ts` (`settleDeath`, `heirOf`), `play/service.ts`, `families.reputation/wealth/debt`
- [x] E8.42 Rütbe düşürme ve makam azli (belge 10, 13): ağır suç mahkumiyetinde rütbe bir basamak iner, en alt rütbede makam geri alınır; boş makam doğrudan atanır — `politics/government.ts` (`demote`, `isVacant`), `play/systems.ts`
- [x] Test: 6 yeni API testi (depolama, depo doluluğu, tekel, bütçe+yetki, miras+idempotans) + güncellenen ad doğrulama testi — toplam **428 test** geçiyor; `npm run verify` (lint+typecheck+build+test+0 TL denetimi) temiz

- [x] E8.43 Oyuncu grupları ve lonca üyeliği (belge 16.2, 16.4): oyuncular kendi gruplarını/birliklerini kurar (kurucu lider, üye sınırı 8); grup ve lonca sohbet kanalı erişimi kalıcı üyelik kaydına bağlanır — `play/multiplayer.ts` (`performCreateGroup`, `performJoinGroup`, `groupStatus`), `social/social.ts` (`canSendToChannel`, `canJoinGroup`), `/api/play/:id/state.group`, `player_groups` + `player_group_members` + `character_guilds` (`0013_player_groups.sql`), arayüz grup paneli
- [x] E8.44 Yolsuzluk denetimi bağlantısı (belge 9.8): kayıtlı gelir ile gerçek gelir arasındaki fark denetim gücüyle ortaya çıkar, kaybolan kısım hazineye döner — `play/storage.ts` (`auditKingdomCorruption`), `kingdoms.corruption` (`0012`)
- [x] Test: 4 yeni API testi (grup kurma, yinelenen/kısa ad, gruba katılma + kanal erişimi, lonca üyeliği + kanal erişimi) — toplam **432 test** geçiyor; `npm run verify` temiz
- [x] E8.45 Karakter görünümü kişiselleştirme (belge 20, 17.2): yüz/ten/göz/saç/sakal/vücut/kıyafet/boy + yara izi ve dövme; seçenekler sunucuda doğrulanır, kısmi güncelleme korunur — `character/appearance.ts` (`applyAppearanceChange`, `appearanceOptions`), `play/systems.ts` (`performSetAppearance`, `appearanceStatus`), `/api/play/:id/action` `setAppearance`, `/api/catalog` görünüm seçenekleri, `/api/play/:id/state.appearance`, arayüz görünüm paneli
- [x] Test: 5 birim + 2 API testi (görünüm doğrulama/kalıcılık, katalog) — toplam **439 test** geçiyor; `npm run verify` temiz

## E9 – Analizde belirlenen eksik gereksinimler (belge 9, 16, 17, 20)

Bu bölüm, tasarım belgesinin tamamı ile mevcut kod arasındaki fark analizinde
çıkan ve **nihai kapsamda zorunlu** olan işleri listeler. Tamamlanmış işler
(E1–E8) korunur; bu kalemler açıkça "eksik" olarak tutulur ve bağımlılık
sırasına göre P1 → P2 → P3 olarak yürütülür. Her sistem veritabanı + sunucu
servisi + API + arayüz + test ile tamamlanır (belge 20 teslim kriteri).

### P1 – Bankacılık, şirket ve işletme finansmanı (belge 20, 9.x)

- [x] E9.1 Mevduat ve kasa (belge 20): oyuncu/NPC mevduat yatırır/çeker, faiz işler; kasa (vault) ayrı tutulur — `economy/bank.ts`, `play/systems.ts`, migration, `/api/play/:id/state.bank`, arayüz banka paneli
- [x] E9.2 Emanet (escrow) (belge 20): taraflar arası güvenli işlem; emanet bir hesapta tutulur, koşul gerçekleşince serbest kalır — `economy/bank.ts`, `/api/escrow`
- [x] E9.3 Faiz, temerrüt, iflas ve tasfiye (belge 20): gecikmiş borç temerrüde düşer; ödeyemeyen iflas eder, mülkleri tasfiye edilir — `economy/bank.ts`, `play/systems.ts`, `play/succession.ts`
- [x] E9.4 Oyuncular/NPC'ler arası finansman (belge 20): borç verme/alma, alacaklı kaydı — `economy/bank.ts`, migration
- [x] E9.5 Şirket, ortaklık ve hisse (belge 20): şirket kurma, ortak hissesi, kâr dağıtımı, kontrol eşiği — `economy/property.ts` (mevcut saf fn'ler), `play/company.ts`, migration, `/api/companies`
- [x] E9.6 Birleşme/devralma ve kurumsal bürokrasi (belge 20): şirket birleşmesi, satın alma, devralma — `economy/property.ts` (`mergeCompanies`, `canAcquire`), `play/company.ts`
- [x] E9.7 İşletme: çalışanlar, şube ağı, işletmeler arası ortaklık (belge 20) — `play/company.ts`, `economy/property.ts`
- [x] E9.8 Bankacılık/şirket arayüzü ve testleri (belge 20) — `app/src/screens/PlayPanel.tsx`, i18n TR+EN

### P2 – Mülk, çok oyunculu ve kalan saf fonksiyonlar (belge 9, 10, 16)

- [x] E9.9 Mülk tamamlayıcıları: kira, haciz, tapu uyuşmazlığı (belge 9.3, 20): `monthlyRent`, `rentAfterTax`, haciz (foreclosure), tapu uyuşmazlığı — `economy/extras.ts`, `play/systems.ts`, migration
- [x] E9.10 Çok oyunculu takas teklifi (belge 16): iki taraf onaylı eşya/altın takası sunucu otoriteli — `play/multiplayer.ts`, migration, `/api/trade`
- [x] E9.11 İttifak ve krallık savaşları (belge 11, 16): ittifak kurma, savaş ilanı, barış — `politics/government.ts`, `play/multiplayer.ts`
- [x] E9.12 Kalan saf fonksiyon bağlantıları (belge 10, 13, 16): `dismiss`, `councilVote`, `isMutual`, `isDuelRequestValid`, `childStage`, `childDevelopmentBonus`, `recordDeath`, `marketShare` oynanışa bağlanır — `politics/government.ts`, `social/social.ts`, `play/succession.ts`, `economy/extras.ts`
- [x] E9.13 P2 arayüz ve testleri (belge 16, 20) — `PlayPanel.tsx` (takas/ittifak/çocuk/ilişki/önerge panelleri), i18n TR+EN, API testleri (barter/ittifak/savaş)

### P3 – Görsel varlık, yönetim, erişilebilirlik ve doğrulama (belge 17, 19, 21.4, 25)

- [x] E9.14 Görsel varlık tüketimi (belge 17): portre/ikon/arma/harita arayüzde gösterilir; veri tasarrufu modu; lisans atıfları görünür — `WorldOverview.tsx` varlık galerisi, `client.assetCatalog()`, `/api/assets/catalog`
- [x] E9.15 Ücretsiz lisanslı görsel dosyalar (belge 17.2, 17.5): 40 portrelik havuz + 7 ikon + arma + harita; WebP + 96/64px küçük türev; lisans/kaynak kaydı — `scripts/gen-assets.mjs` (deterministik, yerel üretim; **0 TL, indirme yok**), `assets/portraits`, `assets/icons`, `assets/crests`, `assets/maps`, `assets/manifest.json`
- [x] E9.16 Yönetici arayüzleri (belge 20): bütçe/kota, pazar izleme, kullanıcı/karakter yönetimi panelleri — `functions/src/admin/console.ts` (+ test), `app/src/screens/AdminPanel.tsx` (+ 3 test), `/api/admin/*`, App kabuğu yönetim düğmesi
- [x] E9.17 Bildirim geçmişi ve erişilebilirlik (belge 19, 20): bildirim listesi + okundu işaretleme, öncelik eşiği/arka plan özeti, klavye erişimi, `aria-label`/`role="alert"`, tablo `scope` başlıkları — `PlayPanel.tsx`, `AdminPanel.tsx`, `client.notifications()`
- [x] E9.18 Yük/kota testi ve yedek/geri yükleme provası (belge 21.4, 25): gerçek yük benzetimi, kota kullanım raporu, D1→R2 dump ve veri kayıpsız geri yükleme provası — `scripts/load-restore-rehearsal.mjs` (`npm run rehearsal:load-restore`; 88 tablo, 141 satır, veri kaybı yok, ücretsiz limit içinde)
### P4 – Sunucu aksiyonlarının arayüze bağlanması (belge 9, 11, 16, 17, 19)

Arka uçta var olan ancak arayüzde düğmesi/paneli bulunmayan aksiyonlar
tamamlandı. Her düğme gerçek `/api/play/:id/action` çağrısı yapar ve testle
doğrulanır (belge 20 teslim kriteri). Ayrıca statik görseller arayüze bağlandı.

- [x] E9.19 Oyuncu rehberi (belge 16): hedefli işlemler (takas, karşılıklı kredi, emanet, tapu uyuşmazlığı, ortaklık, evlilik) için diğer canlı karakterlerin listesi; yalnızca herkese açık alanlar — `functions/src/play/directory.ts` (+ test), `/api/play/:id/state.directory`, `PlayPanel.tsx` hedef seçici
- [x] E9.20 Banka/finans arayüzü (belge 20): emanet açma, karşılıklı kredi verme/geri ödeme, temerrüt tahsili düğmeleri + karşılıklı kredi listesi — `PlayPanel.tsx` (banka paneli), i18n TR+EN
- [x] E9.21 Mülk arayüzü (belge 9.3): kiraya verme, haciz, tapu uyuşmazlığı açma/çözme, vergi haczi; tapu uyuşmazlığı listesi — `PlayPanel.tsx` (mülk paneli)
- [x] E9.22 Şirket arayüzü (belge 20): ortak ekleme ve devralma (birleşme/satın alma) düğmeleri — `PlayPanel.tsx` (şirket paneli)
- [x] E9.23 Çok oyunculu ve siyaset arayüzü (belge 11, 16): takas teklifi, ittifak oluşturma/katılma, savaş ilanı/barış, konsey önergesi, makamdan çekilme — `PlayPanel.tsx`, krallık ilişkileri ve önerge listeleri
- [x] E9.24 Yaşam, aile ve grup arayüzü (belge 7.3, 10): yemek, seyahat, hastalık tedavisi, çocuk kaydı, ölüm kaydı, gruba katılma — `PlayPanel.tsx`
- [x] E9.25 Görsel varlık tüketimi — oyun içi (belge 17): portre (karakter kimliğine göre havuzdan), envanter eşya ikonları, veri tasarrufu anahtarı (96/64px türev) — `PlayPanel.tsx`, `scripts/sync-assets.mjs` (assets/ → app/public/assets/), `app/src/styles.css`
- [x] E9.26 Bildirim geçmişi iyileştirmesi (belge 19): arka plan olay başlığı + tümünü okundu işaretle — `PlayPanel.tsx`

### P5 – Saf fonksiyonların gerçek sistemlere bağlanması (belge 9, 12, 14, 16)

Modül olarak var olan ancak hiçbir akıştan çağrılmayan fonksiyonlar gerçek
sistemlere bağlandı; her biri entegrasyon testiyle doğrulanır.

- [x] E9.27 PvP/duello kuralı (belge 16.5): `isPvpAllowed` güvenli şehir + savaş durumu + rıza ile `duelAllowed`'a bağlandı — `play/systems.ts`
- [x] E9.28 Vergi toplama ve uyum (belge 9.7-9.8): `collectTax` krallık bütçesine (`runKingdomBudget`) bağlandı; tahsilat, huzursuzluk ve uyum geri beslemesi — `play/storage.ts`, `db/migrations/0019_kingdom_tax_and_personality.sql`
- [x] E9.29 Lonca kazancı (belge 14.4): `guildBenefits` çalışma kazancına kidem bonusu olarak bağlandı — `play/service.ts`
- [x] E9.30 Varis belirleme (belge 7.6): `heirOf` varis çözümüyle hizalandı — `play/succession.ts`
- [x] E9.31 Kıtlık riski (belge 9.9): `famineRisk` dünya simülasyonunda günlük olayı kıtlığa çevirir — `play/world-sim.ts`
- [x] E9.32 Görev hedef ilerletme (belge 12.2): `advanceObjective` görev ilerlemesine bağlandı — `play/quests.ts`
- [x] E9.33 Kişilik kayması (belge 12.4): `applyPersonalityShift` görev sonucuyla kalıcı kişiliğe bağlandı + oyuncu arayüzü — `play/personality.ts`, `PlayPanel.tsx`, i18n TR+EN
- [x] E9.34 Yaralanma yönetimi (belge 6.4): `addInjury` tüm yaralanma oluşturma noktalarına bağlandı — `play/service.ts`, `play/systems.ts`
- [x] E9.35 Tedavi kalitesi (belge 6.5): `treatmentQuality` yara/hastalık tedavisine bağlandı (malzeme + yerleşim ortamı) — `play/service.ts`

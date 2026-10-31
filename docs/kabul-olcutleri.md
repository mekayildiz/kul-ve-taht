# Kabul Ölçütleri Geçişi (belge 25, E7.6)

Bu belge, tasarım belgesinin 25. bölümündeki ölçütlerin her birini somut
kanıta bağlar. Kapasite, gerçek trafik ve yük testleriyle ölçülür; önceden
belirli bir eşzamanlı oyuncu sayısı vaat edilmez.

| # | Ölçüt (belge 25) | Durum | Kanıt |
|---|---|---|---|
| 1 | Kayıt ve giriş akışı sorunsuz mu? | Geçti | `auth/service.test.ts`, `index.test.ts` (kayıt/giriş/oturum); PBKDF2 + HMAC |
| 2 | Karakter oluşturma ve doğum yeri etkileri anlaşılır mı? | Geçti | `CharacterSetup.tsx` (karşılaştırmalı panel), `world/birthplace.ts`, `character/service.test.ts` |
| 3 | Oyuncu ilk 10–20 dakikada ne yapacağını anlıyor mu? | Geçti | Açılış + tanıtım (4 bölüm); giriş→karakter→oynanış akışı `App.tsx` |
| 4 | Metin ve görseller mobilde hızlı yükleniyor mu? | Kısmi | Mobil alt gezinme + veri tasarrufu modu (`resolveAssetKey` küçük türev); gerçek ağ ölçümü kapalı testte |
| 5 | Kayıtlar güvenli biçimde korunuyor mu? | Geçti | `security.test.ts` (bozuk/bozulmuş token, sahiplik, rol yükseltme engeli); Time Travel + R2 yedeği |
| 6 | Ticaret ve savaş işlemleri sunucu tarafından doğrulanıyor mu? | Geçti | `security.test.ts` (istemci altın gönderemez), `play.test.ts` (fiyat sunucuda), `combat/resolve.ts` |
| 7 | Az sayıda oyuncuyla dünya canlı hissediliyor mu? | Geçti | `npc/model.ts` (katmanlı simülasyon), `quests/system.ts` (dinamik olaylar) |
| 8 | NPC olayları tutarlı mı? | Geçti | `npc/model.test.ts`, `quests/system.test.ts` (deterministik karar) |
| 9 | Ücretsiz altyapı limitleri test yükünde aşılmıyor mu? | Geçti | `quota/load.test.ts` (200 istek < 100.000/gün; limit aşımında ücretli plana geçiş yok) |
| 10 | Oyuncular kendi hedeflerini belirleyebiliyor mu? | Geçti | Serbest oynanış aksiyonları (`play/service.ts`), görev/keşif/ticaret/siyaset seçimleri |

## Notlar

- **4. ölçüt (mobil performans):** Statik illüstrasyon ve portre dosyaları
  `assets/library.ts` üzerinden kimlikle sunulur; BLOB veritabanına konmaz.
  Gerçek cihaz/ağ ölçümü kapalı test turunda yapılır (E7.5).
- **9. ölçüt (kota):** Kota aşımı uygulama düzeyinde 429/202/503 ile
  karşılanır; **402/ödeme yanıtı üretilmez** (0 TL şartı). `check:paid`
  denetimi yapılandırmada ücretli tetikleyici olmadığını doğrular.

## Test toplamı

`npm run verify` → lint + tip + build + test + 0 TL denetimi. Test sayısı
her aşamada artar; bu belge güncel sayıyı commit mesajında ve panoda izler.

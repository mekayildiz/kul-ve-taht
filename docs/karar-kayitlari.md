# Karar Kayıtları (ADR)

## ADR-001 — Kimlik doğrulama ayrımı
Cloudflare Access, oyuncu kayıt/giriş sistemi **olarak kullanılmaz**. Oyuncular
için bağımsız, güvenli kimlik doğrulama (Workers + D1 + PBKDF2 + HMAC oturum)
tasarlanır. Access yalnızca yönetici paneli gibi özel erişimli alanlarda kullanılır.

## ADR-002 — D1'de RLS yok
D1 SQLite tabanlıdır ve PostgreSQL RLS desteklemez. RLS yerine tüm kritik
işlemlerde **sunucu taraflı kimlik, rol, sahiplik ve yetki** kontrolleri uygulanır
(`functions/src/auth/authorize.ts`) ve testlerle kanıtlanır.

## ADR-003 — Parola hash: PBKDF2 (teste bağlı)
Argon2 Workers'ta desteklenmez; bcrypt yerleşik değil. Web Crypto **PBKDF2-HMAC-SHA256**
kullanılır. Hash işlemi, Worker'ın 10 ms CPU sınırı nedeniyle **Durable Object**
içinde (30 s CPU) çalıştırılır. İterasyon OWASP asgarisine yakın (600.000) tutulur;
gerçek Workers/DO ortamındaki performans testi **zorunludur** ve başarısızsa
alternatif ücretsiz mimari (DO cpu_ms artırımı / scrypt) uygulanır — güvenlikten
taviz verilmez.

## ADR-004 — Hash darboğazı dağıtımı
Parola hash işleri tek bir DO'ya yıkılmaz. Hesap kimliğine göre **16 shard**'a
(`hashShardFor`) dağıtılır; hesap başına eşzamanlı hash ve hız sınırı uygulanır.

## ADR-005 — Sağlayıcı-bağımsız veri katmanı (otomatik geçiş yok)
D1 ↔ Turso arası taşınabilir veri katmanı korunur. **Otomatik geçiş varsayılmaz**;
SQL uyumluluğu, migration, yedekleme, geri yükleme ve veri bütünlüğü testleri
eklenir; geçiş ancak tüm testler geçince "tamamlandı" sayılır.

## ADR-006 — Yedekleme ayrımı
- **Time Travel:** anlık hata kurtarma (PITR), 7 gün (Free), her zaman açık, ücretsiz.
- **Workflows + D1 REST API → R2:** uzun vadeli arşiv (`.sql`), 10 GB.
- **R2'den geri yükleme:** felaket sonrası kurulum; **gerçek prova yapılmadan
  tamamlanmış sayılmaz.**
`wrangler d1 export` bir CLI komutudur; Cron Worker içinde çalıştırılamaz.

## ADR-007 — Export sırasında sorgu kilidi
Resmî belge: "A running export will block other database requests." Bu nedenle
yedekleme **düşük yoğunluk saatinde (03:00 UTC)** çalışır; export süresince oyuncu
işlemleri kota koruması ile kuyruğa alınır/kısıtlanır. Başarısız export, yeniden
deneme ve geri yükleme senaryoları test edilir.

## ADR-008 — Workflows kotası
Free: **3.000 adım/gün, 1 GB-ay depolama**, istekler Workers 100.000/gün ile
paylaşımlı, CPU 10 ms/invocation, instance durumu 3 gün. Yedekleme Workflow'u
2 adım kullanır (yeniden denemeler sayılmaz) → günlük 2 adım.

## ADR-009 — GitHub Actions public/private
Public repoda standart runner **ücretsizdir**; private repoda aylık 2.000 dk
eşdeğeri dahildir ve aşım ücretlendirilir. "Sınırsız ücretsiz" yalnızca public +
standart runner için geçerlidir.

## ADR-010 — 0 TL koruması
Hiçbir yapılandırma ücretli plana geçişi tetiklemez. Kota aşımında sistem
yavaşlar, kuyruğa alır veya kritik olmayan işi durdurur (`functions/src/quota/guard.ts`).
`scripts/check-no-paid-config.mjs` CI'da bunu denetler.

---

## ADR-011 — Taşınabilir sabit-zamanlı karşılaştırma

**Bağlam:** `crypto.subtle.timingSafeEqual` standart WebCrypto'nun parçası
değildir; yalnızca Cloudflare'e özgü bir uzantıdır ve Node/yerel test
ortamında bulunmaz. `session.ts` ve `password.ts` bu API'yi kullanıyordu ve
testler bu nedenle çöküyordu.

**Karar:** `auth/constant-time.ts` içinde uzunluk-kontrollü, XOR tabanlı
sabit-zamanlı karşılaştırma uygulandı. İki modül de bunu kullanır.

**Sonuç:** Güvenlik korunur (zamanlama sızıntısı yok) ve kod hem Workers'ta
hem Node testlerinde çalışır.

## ADR-012 — Dünya saati referans noktası

**Bağlam:** `world_clock.last_tick_real_ms` başlangıçta 0 (epoch) olduğu için
ilk istekte 1970'ten bu yana geçen süre hesaplanıyor ve oyun yılı 231'e
fırlıyordu (gerçek hata, yerel entegrasyon testinde yakalandı).

**Karar:** `lastTickRealMs <= 0` ise saat "başlatılmamış" kabul edilir:
ilerletme yapılmaz, referans noktası şimdiye ayarlanır.

**Sonuç:** Yeni dünyada oyun günü 1'den başlar; sonraki istekler 6 gerçek
saatte 1 oyun günü ilerler.

## ADR-013 — Veri katmanı sağlayıcı bağımsızlığı

**Bağlam:** Tasarım belgesi Supabase/PostgreSQL önerir; ancak 0 TL şartı ve
D1'in Free plan sınırları nedeniyle SQLite ortak alt kümesi seçildi (ADR-005).

**Karar:** Tüm sorgular `db/client.ts` arayüzünden geçer. `node:sqlite`
tabanlı test donanımı (`test-support/sqlite-harness.ts`) gerçek SQLite
motorunda şemayı, kısıtları ve sorguları doğrular. Otomatik sağlayıcı geçişi
YOKTUR; D1 → Turso geçişi ancak bütünlük testleri geçince yapılır.

**Sonuç:** Aynı repository kodu D1'de ve Turso'da çalışır; yerel testler
hesap/ödeme gerektirmez.

## ADR-014 — Hesaplar tablosunda rol ve durum

**Bağlam:** `accounts.role` CHECK kısıtı `player|moderator|admin`; RLS
olmadığı için yetkilendirme sunucu tarafında (`auth/authorize.ts`) uygulanır.

**Karar:** `auth/service.ts` kayıt sırasında rolü daima `player` atar; rol
yükseltme yalnızca yönetici işlemiyle ve `audit_log` kaydıyla yapılır.
Askıya alınmış hesapların girişi `suspended` hatasıyla engellenir.

**Sonuç:** İstemci rolü dayatamaz; ayrıcalık yükseltme denetim altındadır.

## ADR-015 — Şema nitelik sütunu belgeye uyduruldu

**Bağlam:** `0001_core_schema.sql` içinde `character_attributes.willpower`
bulunuyordu. Tasarım belgesi 5.5 YEDİ niteliği açıkça sayar ve yedincisi
**Liderlik**'tir (Güç, Dayanıklılık, Çeviklik, Zekâ, Algı, Karizma,
Liderlik). Şans ayrı bir nitelik değildir.

**Karar:** `0002_character_and_world.sql` ile sütun `leadership` olarak
yeniden adlandırıldı; `character_appearance`, `character_background`,
`character_reputation` tabloları eklendi (belge 5.3/5.4/5.9).

**Sonuç:** Şema ile tasarım belgesi arasındaki gerçek tutarsızlık kapandı;
görünüş editörü ve geçmiş katmanları nihai kapsamda.

## ADR-016 — İstemci asla oyun otoritesi değildir

**Bağlam:** Nitelik puanları, meslekler, uzmanlık yolları ve doğum yeri
istemciden gelir. Kötü niyetli istemci 20/20/20 nitelik veya sınırsız
uzmanlık gönderebilir.

**Karar:** Tüm doğrulama `character/service.ts` içinde SUNUCUDA yapılır:
puan havuzu (56), aralık (1-20), en fazla 2 başlangıç uzmanlığı ve 2 meslek,
doğum yerinin `settlements` tablosunda var olması. Hesap kimliği istemciden
değil, oturumdan alınır.

**Sonuç:** Yetki yükseltme ve hile denemeleri reddedilir; testlerle
doğrulanmıştır.

## ADR-017 — Dünya tohumlama idempotenttir

**Bağlam:** Dünya verisi (5 krallık, 130 yerleşim) D1'e bir kez yüklenmeli;
yeniden çalıştırma oyuncu verisini bozmamalı.

**Karar:** `seedWorld` `INSERT OR IGNORE` kullanır; dünya saati yalnızca
başlatılmamışsa (`last_tick_real_ms <= 0`) güncellenir. Tohumlama yalnızca
`admin:any` yetkisiyle çalışır.

**Sonuç:** Tohumlama güvenle tekrarlanabilir; test edilmiştir.

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

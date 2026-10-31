# Kota Bütçesi (0 TL)

Tüm değerler resmî Cloudflare/GitHub belgelerinden doğrulanmıştır. Ücretli plana
geçiş tetikleyen hiçbir yapılandırma kullanılmaz; kota aşımında sistem güvenli
şekilde yavaşlar, kuyruğa alır veya kritik olmayan işi durdurur.

## Workers (Free)

| Ölçüt | Sınır |
|---|---|
| İstek | 100.000 / gün (aşımda Error 1027) |
| CPU | 10 ms / istek |
| Bellek | 128 MB |
| Subrequest | 50 / istek |
| Cron Trigger | 5 / hesap |
| Worker sayısı | 100 |

## D1 (Free)

| Ölçüt | Sınır |
|---|---|
| Satır okuma | 5.000.000 / gün |
| Satır yazma | 100.000 / gün |
| Depolama | 5 GB (toplam) |
| Veritabanı | 10 |
| Time Travel | 7 gün (her zaman açık, ücretsiz) |
| Time Travel geri yükleme | 10 / 10 dk (veritabanı başına) |

## Durable Objects (Free)

| Ölçüt | Sınır |
|---|---|
| İstek | 100.000 / gün |
| Duration | 13.000 GB-s / gün |
| Depolama | 1 GB (DO başına) / 5 GB (hesap) |
| DO sınıfı | 100 / hesap |
| CPU / invocation | 30 s (5 dk'ya ayarlanabilir) |
| WebSocket mesaj boyutu | 32 MiB (yalnızca gelen) |

### WebSocket / DO istek muhasebesi

| Olay | Kota karşılığı |
|---|---|
| WebSocket bağlantı açılışı | 1 istek |
| **Gelen** WS mesajı | 1/20 istek (20:1 oranı) |
| Giden WS mesajı | 0 (ücretsiz) |
| Protokol ping | 0 (ücretsiz) |
| RPC metot çağrısı | 1 istek |
| Alarm | 1 istek |

Örnek: 100 gelen mesaj = 5 istek. "Her mesaj = 1 istek" varsayımı yanlıştır.

## R2 (Free)

| Ölçüt | Sınır |
|---|---|
| Depolama | 10 GB-ay |
| Class A işlem | 1.000.000 / ay |
| Class B işlem | 10.000.000 / ay |
| Egress | Ücretsiz |

## Pages (Free)

| Ölçüt | Sınır |
|---|---|
| Build | 500 / ay |
| Dosya | 20.000 / proje |
| Dosya boyutu | 25 MiB |
| Bant genişliği/istek | Sınırsız |

## Workflows (Free)

| Ölçüt | Sınır |
|---|---|
| Adım | **3.000 / gün** (yeniden denemeler ve rollback handler'ları sayılmaz) |
| Depolama | **1 GB-ay** |
| İstek | Workers 100.000/gün ile paylaşımlı |
| CPU | 10 ms / invocation |
| Instance durumu saklama | 3 gün |
| Maks. adım / instance | 1.024 |

### Yedekleme Workflow'u tüketim hesabı

Yedekleme Workflow'u **2 adım** kullanır:
1. `start-export` (export başlat)
2. `poll-and-store-to-r2` (durum kontrol + R2'ye akıt)

- **Günlük tüketim:** 2 adım × 1 çalıştırma = **2 adım/gün** (3.000/gün sınırının %0,07'si).
- **Yeniden denemeler adım sayılmaz**; yalnızca istek/CPU harcar.
- **Depolama:** instance durumu 3 gün tutulur; `default_retention` ile daha da kısaltılabilir. Dump R2'ye yazılır (Workflows depolamasına değil).
- **İstek:** günlük yedek = birkaç istek (export init + poll + R2 put); Workers 100.000/gün bütçesinden payı ihmal edilebilir.

**Kritik not:** "A running export will block other database requests." Bu nedenle
yedekleme **düşük yoğunluk saatinde (03:00 UTC civarı)** çalışır; export süresince
oyuncu işlemleri kota koruması ile kuyruğa alınır / kısıtlanır.

## GitHub Actions

| Depo türü | Ücretsiz kullanım |
|---|---|
| **Public** | Standart GitHub-hosted runner ücretsiz (dahil compute kotasından düşmez) |
| **Private** | Aylık 2.000 dk eşdeğeri = 12 USD dahil; aşım ücretlendirilir |

Artifact depolama: 500 MB (Free) · Cache: 10 GB (repo başına).

**Kural:** Repo public tutulur; private olması gerekirse aylık 2.000 dk eşiği izlenir
ve aşımda CI sıklığı azaltılır — **ücretli plana geçilmez.**

## Kota aşımı davranışı

1. Hız sınırlama (istek/oyuncu, istek/IP)
2. Kuyruklama (kritik olmayan işler ertelenir)
3. Zarif bozulma (NPC özet simülasyonu seyreltilir)
4. Read-only mod (aşırı yükte yazma kısıtlanır)
5. Güvenlik-kritik yollarda "fail closed"; oyun yollarında kuyruk/gecikme mesajı

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

## R2 (Free) — KULLANILMIYOR

R2 bu projede **kullanılmaz** (hesap düzeyinde etkinleştirme gerektirir ve
ücretsiz kota sınırları vardır). Yedekleme D1 Time Travel ile, görsel varlıklar
ise Worker `[assets]` statik sistemiyle karşılanır. Aşağıdaki sınırlar yalnızca
karşılaştırma içindir; hiçbir bağımlılık R2'ye bağlı değildir.

| Ölçüt | Sınır |
|---|---|
| Depolama | 10 GB-ay |
| Class A işlem | 1.000.000 / ay |
| Class B işlem | 10.000.000 / ay |
| Egress | Ücretsiz |

## D1 Time Travel (Free) — YEDEKLEME

| Ölçüt | Sınır |
|---|---|
| PITR penceresi | **30 gün** (her dakikaya geri dönüş) |
| Etkinleştirme | Gerekmez; her zaman açık |
| Maliyet | **Ek maliyet yok** (geçmiş ve geri yükleme ücretsiz) |
| Ön koşul | Wrangler v3.4.0+ ve `version: production` D1 |

Time Travel otomatik olarak bookmark üretir; elle yedek tetiklemeye gerek yoktur.
Komutlar: `wrangler d1 time-travel info` (bookmark al) ve
`wrangler d1 time-travel restore` (geri yükle). Geri yükleme bir yedekleme
Workflow'u gerektirmez; bu nedenle **Workflows kotası harcanmaz.**

## Pages (Free)

| Ölçüt | Sınır |
|---|---|
| Build | 500 / ay |
| Dosya | 20.000 / proje |
| Dosya boyutu | 25 MiB |
| Bant genişliği/istek | Sınırsız |

## Workflows (Free) — KULLANILMIYOR

Yedekleme artık D1 Time Travel ile yapıldığı için **hiçbir Workflow çalışmaz**;
Workflows kotası (adım/depolama) tüketilmez. Aşağıdaki sınırlar yalnızca
karşılaştırma içindir.

| Ölçüt | Sınır |
|---|---|
| Adım | 3.000 / gün |
| Depolama | 1 GB-ay |
| İstek | Workers 100.000/gün ile paylaşımlı |
| CPU | 10 ms / invocation |

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

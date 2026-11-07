# Güvenlik Başlıkları ve HTTPS Zorlaması

Bu belge, Worker'ın ve statik arayüzün tarayıcıya gönderdiği güvenlik
başlıklarını ve düz HTTP'nin HTTPS'e nasıl yönlendirildiğini açıklar.

## Neden iki yer?

Workers statik varlıkları, **varsayılan yönlendirmede Worker betiğinden ÖNCE
sunulur**. Yani `app/dist` içindeki HTML/JS/CSS yanıtları Worker'ın
`fetch()`'ine uğramaz; orada eklenen başlıklar bu yanıtlara ulaşmaz. Bu yüzden
başlıklar **iki katmana** uygulanır:

| Katman | Dosya | Kapsam |
|--------|-------|--------|
| Statik varlıklar | `app/public/_headers` | HTML, JS, CSS, görseller |
| Worker yanıtları | `functions/src/http/security.ts` | `/api/*`, 404, CORS ön kontrol |

> **Tek kaynak kuralı:** İki dosyadaki değerler **aynı olmalıdır**. Birini
> değiştirirsen diğerini de güncelle. `security.test.ts` Worker tarafını
> doğrular; `_headers` tarafı derlemede `app/dist`'e kopyalanır.

## Başlıklar

| Başlık | Değer | Amaç |
|--------|-------|------|
| `Content-Security-Policy` | `default-src 'self'; …` | XSS yüzeyini daraltır |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPS'i zorunlu kılar (HSTS) |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing'i engeller |
| `X-Frame-Options` | `DENY` | Clickjacking'i engeller |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer sızıntısını sınırlar |
| `Permissions-Policy` | `accelerometer=(), camera=(), …` | Kullanılmayan tarayıcı API'lerini kapatır |
| `Cross-Origin-Opener-Policy` | `same-origin` | Kaynak izolasyonu |
| `Cross-Origin-Resource-Policy` | `same-origin` | Kaynak izolasyonu |

### CSP notları

- **Betik için inline'a izin verilmez.** `script-src 'self'
  https://challenges.cloudflare.com` — yalnızca kendi paketlenmiş JS'i ve
  Cloudflare Turnstile betiğini yükler.
- **Stil için `'unsafe-inline'` gereklidir.** React, çalışma zamanında stil
  enjekte edebilir; bu olmadan arayüz bozulur.
- **Turnstile** `script-src`, `connect-src` ve `frame-src` içinde açıkça
  listelenmiştir. Turnstile kapalıyken (`VITE_TURNSTILE_SITE_KEY` tanımsız) bu
  kaynak yine de güvenlidir; yalnızca yüklenmez.
- **Görsel** `img-src 'self' data:` — favicon ve olası data-URI görseller.

## HTTPS zorlaması

`httpsRedirect()` (`functions/src/http/security.ts`) `x-forwarded-proto: http`
gördüğünde **301** ile `https://` adrese yönlendirir. Bu, Worker seviyesinde
olduğundan panel ayarına (Always Use HTTPS) gerek kalmaz. Yerelde istek zaten
`https` olduğu için yönlendirme tetiklenmez.

## Doğrulama

```bash
# Başlıkları gör
curl -s -D - -o /dev/null https://kulvetaht.dpdns.org/api/health

# Statik HTML başlıkları
curl -s -D - -o /dev/null https://kulvetaht.dpdns.org/

# HTTP → HTTPS yönlendirmesi
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://kulvetaht.dpdns.org
```

Beklenen: `/api/health` yanıtında tüm güvenlik başlıkları; HTML yanıtında da
`_headers` sayesinde aynı başlıklar; HTTP isteği `301` ile `https`'e gider.

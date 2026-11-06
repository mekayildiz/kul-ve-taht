# Alan Adı Bağlama Kılavuzu — `kulvetaht.dpdns.org`

Ücretsiz `kulvetaht.dpdns.org` alan adını Cloudflare Worker'a
(`kul-ve-taht-functions`) bağlama süreci.

## Durum — TAMAMLANDI ✅

| Aşama | Açıklama | Durum |
|-------|----------|-------|
| A | Ücretsiz alan adı alımı (DigitalPlat) | ✅ Tamam |
| B | Cloudflare'e site ekleme | ✅ Zone **ACTIVE** |
| B2 | NS'leri DigitalPlat'te değiştirme | ✅ Tamam (`ray`/`rosalyn`) |
| C | Worker'a Custom Domain bağlama | ✅ Tamam (SSL otomatik) |

**Canlı adres:** https://kulvetaht.dpdns.org — HTTP 200, Let's Encrypt SSL.

- Zone: `kulvetaht.dpdns.org`
- Zone ID: `dd28c5c113f1076544eae95c3d1e55a3`
- Atanmış Cloudflare NS: `ray.ns.cloudflare.com`, `rosalyn.ns.cloudflare.com`
- Canlı NS (registry): `ray`/`rosalyn.ns.cloudflare.com` (delegasyon tamam)
- Worker Custom Domain: `kulvetaht.dpdns.org` → `kul-ve-taht-functions` (production)

## Adım adım

### 1) DigitalPlat paneli
1. https://dash.domain.digitalplat.org → giriş
2. **`kulvetaht.dpdns.org`** → **DNS** sekmesi
3. DNS tablosundaki `NS @ dns1/dns2.digitalplat.org` kayıtları **Managed by: system**
   → **elle düzenlenemez**; bunlara dokunma.
4. Sayfadaki **"Use other nameservers"** butonuna bas
   (*"Enter at least two authoritative nameservers. Your DigitalPlat DNS records will be kept for 7 days."*)
5. İki alana yaz:
   - `ray.ns.cloudflare.com`
   - `rosalyn.ns.cloudflare.com`
6. **Save / Submit** → 7 günlük kayıt uyarısı çıkarsa onayla (bu kurulumda 0 kayıt var)

> **Nameservers sekmesi (iki seçenekli):** Sayfada iki kart vardır:
> **"DigitalPlat DNS (Recommended)"** (`dns1`/`dns2.digitalplat.org`) ve
> **"Use other nameservers"**. Cloudflare için **ikinci** seçenek kullanılır.
> Formda `dns1`/`dns2` görünüyorsa **"Update nameservers"a BASMA** — delegasyonu
> DigitalPlat'e geri çevirir. DNS tablosundaki `NS @ dns1/dns2` kayıtları
> **Managed by: system** olup salt-okunurdur; elle düzenlenmez.

> **Doğrulama (bu kurulumda yapıldı):** Canlı delegasyon Cloudflare'e geçti —
> registry (`ns1.digitalplat.org`) `ray`+`rosalyn` döndürüyor, SOA'yı
> `ray.ns.cloudflare.com` yanıtlıyor. Cloudflare zone durumu: `pending`
> (aktivasyon bekleniyor).

### 2) Yayılım ✅
- Cloudflare zone **pending → active** (tamamlandı; `active_on: 2026-11-05`)
- Teyit: `kulvetaht.dpdns.org` NS = `ray`/`rosalyn.ns.cloudflare.com`

### 3) Worker'a Custom Domain ✅
Panel: Workers & Pages → `kul-ve-taht-functions` → **Domains** sekmesi →
**+ Add Domain** → `kulvetaht.dpdns.org` → **Add domain** (SSL otomatik).

> **Dikkat:** Zone zaten ekli olduğu için **"Add a site" ekranına tekrar girme**;
> orada "Please ensure you are providing the root domain…" hatası alınır. Doğru
> yer Worker'ın **Domains** sekmesindeki **+ Add Domain**'dir. `+ Add Route`
> değil.

API (yazma izinli token gerekir):
```bash
ZONE_ID=dd28c5c113f1076544eae95c3d1e55a3
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"environment\":\"production\",\"hostname\":\"kulvetaht.dpdns.org\",\"service\":\"kul-ve-taht-functions\",\"zone_id\":\"$ZONE_ID\"}"
```

Gerekli token izinleri:
- Account → Workers Scripts → Edit
- Account → Workers Routes → Edit
- Zone → DNS → Edit
- Zone → Zone → Edit

### 4) Doğrulama
```bash
curl -s -o /dev/null -w "%{http_code}\n" -L "https://kulvetaht.dpdns.org"
# 200 dönmeli
```

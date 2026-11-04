# Ücretsiz Alan Adı Araştırması (0 TL kısıtı)

Tarih: 2026-11-04. Amaç: "Kül ve Taht" için **0 TL** bütçeyle erişilebilir bir
alan adı/adres bulmak. Kısıt: hiçbir ücretli plana geçilmez (bkz.
`scripts/check-no-paid-config.mjs`).

## Özet sonuç

- **Gerçek bir `.com` alan adı ücretsiz olarak alınamaz.** Tüm `.com`
  kayıt şirketleri yıllık ücret alır (~10-11 USD/yıl). Ücretsiz `.com`
  yalnızca ücretli barındırma paketiyle "ilk yıl hediye" biçiminde gelir;
  bu, 0 TL kısıtını ihlal eder.
- **Hedef `alanadi.com` alınmış durumda.** DNS'te iki A kaydıyla
  yayında (13.248.169.48, 76.223.54.146). Yani ücretsiz ya da ücretli,
  bu ad şu an kullanılabilir değil.
- **`kulvetaht.com` şu an boş görünüyor** (DNS kaydı yok). Ücretsiz
  alınamaz ama istenirse ~10 USD/yıl ile alınabilir (0 TL dışı).
- **0 TL ile gerçekçi seçenek: ücretsiz alt alan adı (subdomain).**
  Bunlar tam sahiplik vermez ama ücretsizdir, HTTPS alır ve Cloudflare
  Pages/Workers ile doğrudan çalışır.

## 0 TL ile çalışan ücretsiz seçenekler

| Sağlayıcı | Uzantı örneği | Not |
|---|---|---|
| **DigitalPlat FreeDomain** | `*.dpdns.org`, `*.us.kg`, `*.qzz.io` | Açık kaynak, ücretsiz, Cloudflare NS/CNAME ile çalışır. 2026 itibarıyla en çok önerilen. Kayıt panosu: `domain.digitalplat.org` |
| **is-a.dev** | `*.is-a.dev` | Geliştiriciler için; GitHub PR ile alt alan adı. Yalnızca CNAME/A. |
| **eu.org** | `*.eu.org` | Ücretsiz gerçek alan adı benzeri; başvuru onayı yavaş (günler–haftalar). |
| **js.org** | `*.js.org` | JavaScript ekosistemi; CNAME. Oyun için uygun değil. |
| **Cloudflare Pages** | `proje.pages.dev` | Zaten mevcut; ücretsiz ve hazır. |

### Kapanan / önerilmeyen

- **Freenom** (`.tk`, `.ml`, `.ga`, `.cf`, `.gq`): 2024'te tamamen kapandı;
  milyonlarca alan adı çözülemez hâle geldi. **Kullanılmamalı.**
- **Amazon `.free`** (Nisan 2025): "ücretsiz" adı yanıltıcı; kayıt ücretli
  (`.free` için ~45 USD). Ücretsiz değildir.
- Ücretsiz barındırma + ücretsiz alan adı iddia eden siteler: genelde
  `.c0m.in` gibi reklam/limitli alt alan adları; oyun için önerilmez.

## Öğrenci / GitHub Student Developer Pack (yalnızca öğrenciyse)

Öğrenci doğrulaması varsa (üniversite e-postası):

- **Namecheap**: 1 yıl ücretsiz `.me` alan adı + 1 yıl SSL.
- **Name.com**: 1 yıl ücretsiz seçili uzantı (`.live`, `.studio`, `.app`, `.dev` vb.).
- **.TECH**: 1 yıl ücretsiz `.tech` alan adı.

Bunlar **ücretsizdir** ama öğrenci kimliği ve yıllık yenileme sonrası ücret
gerektirir; 0 TL kısıtı yalnızca ilk yıl için geçerlidir.

## Öneri (onaya sunulur)

1. **Hemen, 0 TL:** Mevcut `kul-ve-taht.pages.dev` adresi kullanılmaya devam
   edilsin (ek maliyet yok, ek işlem yok).
2. **Marka için 0 TL alternatif:** DigitalPlat FreeDomain'den
   `kulvetaht.dpdns.org` gibi ücretsiz bir alt alan adı alınıp Cloudflare
   Pages'e CNAME ile bağlanabilir. Tam sahiplik yoktur; sağlayıcı kapanırsa
   adres kaybedilir.
3. **Kalıcı çözüm (0 TL değil):** `kulvetaht.com` boş görünüyor; ~10 USD/yıl
   ile Cloudflare Registrar üzerinden alınabilir. Bu, 0 TL kısıtı nedeniyle
   **kullanıcı onayı olmadan yapılmaz.**

Karar: 0 TL kısıtı korunacaksa **1. ve 2. seçenek**. 2. seçenek için kullanıcı
onayı bekleniyor.

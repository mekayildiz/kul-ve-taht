# Yönetici Paneli Kılavuzu (0 TL)

Bu belge, oyunun **Yönetim Konsolu**'nu nasıl açacağını ve ne yapabileceğini
anlatır. Tamamı 0 TL (Workers/D1 ücretsiz katman) içinde çalışır.

## 1. Panele erişim

Panel yalnızca **yönetici (admin)** ve **moderatör** rollerine görünür.
Yazma işlemleri (rol atama, altın verme vb.) **yalnızca admin**'e açıktır;
moderatör paneli yalnızca okur.

1. **https://kulvetaht.dpdns.org** adresini aç.
2. **Giriş Yap** → yönetici hesabınla gir:
   - E-posta: `meka.yildiz@gmail.com`
   - Parola: (kendi belirlediğin parola)
3. Giriş yaptıktan sonra üst çubukta **Yönetim** düğmesi çıkar → tıkla.

> **Not:** Yönetici hesabın `protected = 1` (korumalı) işaretlidir: banlanamaz ve
> rolü düşürülemez. Bu, yanlışlıkla kendini kilitlemeni engeller.

### Üst çubuktaki düğmeler

| Düğme | Ne yapar |
|---|---|
| **Yönetim** | Yönetim Konsolu'nu açar (admin/moderatör) |
| **Hesap Güvenliği** | Oturumlar, 2FA (TOTP), kurtarma kodları |
| **Harita** | Dünya haritası ve krallıklar |
| **Karakter** | Karakter oluşturma / oynanış |
| **Çıkış Yap** | Oturumu kapatır |

## 2. Panel bölümleri

Panel tek sayfadır; bölümler yukarıdan aşağıya sıralanır.

### 2.1 Genel Bakış
Hesap, karakter, yaşayan karakter, yerleşim, krallık, toplam altın, mülk,
şirket, açık artırma ve oyun günü sayıları.

### 2.2 İşlemler
| Düğme | Ne yapar | Yetki |
|---|---|---|
| **Dünyayı Tohumla (NPC, saray, saat)** | NPC'leri, sarayları ve dünya saatini üretir. **İdempotent**: tekrar basmak veriyi çoğaltmaz. | admin |
| **Yükle** | Paneli yeniler. | admin/moderatör |

> İlk kurulumda dünyayı bir kez tohumlaman gerekir. Zaten tohumlanmışsa
> tekrar basmak zararsızdır.

### 2.3 Kota Durumu
Ücretsiz katman limitlerinin kullanımı (istek, D1 okuma/yazma, DO). Durum
`ok` dışına çıkarsa oyun geçici olarak sınırlanabilir.

### 2.4 Hesap ve Rol Yönetimi
Hesapların e-posta, rol ve durumunu gösterir.

- **Rol** açılır listesinden `Oyuncu` / `Moderatör` / `Yönetici` seç →
  **Rolü Kaydet**.
- **Banla / Banı Kaldır** ile hesabı askıya al veya geri aç.
- Korumalı hesapta ★ işareti vardır; rolü düşürülemez, banlanamaz.
- **Son yöneticinin** rolü düşürülemez (sistem engeller).

### 2.5 Karakter Listesi
Tüm karakterler, altınları ve bulundukları yerleşim.
- **Ölü İşaretle / Canlı İşaretle** ile karakter durumunu değiştir (admin).

### 2.6 Üye İşlemleri (yalnızca admin)
Karakter seçtikten sonra:
- **Altın Ver/Al** — miktar gir (eksi = al).
- **Eşya Ver / Eşya Al** — adet ile.
- **Nitelikler** — karakter niteliklerini düzenle.
- **Canlı Durum** — sağlık, enerji, itibar.

### 2.7 Pazar Durumu
Yerleşim bazında eşya arz ve fiyatları (ilk 25 satır).

### 2.8 Denetim Kaydı
Kim, ne zaman, kimi hedefledi ve ayrıntı. **Tüm yönetici işlemleri buraya
yazılır**; şeffaflık için kullan.

## 3. Tipik görevler

### İlk kurulum (tek sefer)
1. Admin ile gir → **Yönetim**.
2. **Dünyayı Tohumla**'ya bas.
3. **Genel Bakış**'ta sayıların dolduğunu doğrula (yerleşim ≈ 130, krallık 5).

### Bir arkadaşına moderatör vermek
1. Arkadaşın oyuna kayıt olsun.
2. **Hesap ve Rol Yönetimi** → ilgili satırda rolü `Moderatör` yap →
   **Rolü Kaydet**.
3. Arkadaşın bir sonraki istekte yeni rolü görür (rol DB'den tazelenir).

### Test/ölü karakteri düzeltmek
**Karakter Listesi** → ilgili karakterde **Canlı İşaretle**.

### Bir oyuncuya altın vermek
**Üye İşlemleri** → karakter seç → **Altın Ver/Al** → miktar (ör. `500`) →
kaydet.

## 4. Komut satırı alternatifi (panel olmadan)

Yönetici oturumu olmadan, gizli jetonla ilk yöneticiyi atamak gerekirse:

```bash
curl -X POST https://kulvetaht.dpdns.org/api/auth/bootstrap-admin \
  -H "content-type: application/json" \
  -H "x-bootstrap-token: <BOOTSTRAP_ADMIN_TOKEN>" \
  -d '{"email":"ornek@eposta.tr"}'
```

- Jeton tanımlı değilse uç `404` döner.
- Zaten bir admin varsa `409` döner (jeton sızmış olsa bile ele geçirme engellenir).
- İş bittikten sonra jetonu kaldır: `wrangler secret delete BOOTSTRAP_ADMIN_TOKEN`.

Dünyayı tohumlamak (elle):

```bash
curl -X POST https://kulvetaht.dpdns.org/api/admin/seed-world \
  -H "authorization: Bearer <ADMIN_TOKEN>"
```

## 5. Güvenlik notları

- **Yazma işlemleri sunucuda da doğrulanır**; rol istemciden gelmez, her
  istekte DB'den tazelenir.
- **Korumalı hesap** ve **son yönetici** korumaları kaldırılamaz.
- Tüm işlemler **Denetim Kaydı**'na yazılır.
- Oturumlar **Hesap Güvenliği** ekranından listelenip iptal edilebilir.
- 2FA (TOTP) ve kurtarma kodları **Hesap Güvenliği**'nden yönetilir.

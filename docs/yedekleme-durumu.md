# Yedekleme ve Sürüm Kontrol Durumu

## Yerel çalışma (güvence altında)

| Öğe | Değer |
|---|---|
| Dal | `feat/kul-ve-taht-development` |
| Commit sayısı | 24 |
| HEAD | `f5c4c3f` |
| Çalışma ağacı | temiz |
| Kalıcı bundle | `/workspace/backups/kul-ve-taht-feat-20261031.bundle` |
| Bundle SHA-256 | `83786ce51c39014e83837d431191988f854be3e3732bf7d8073951cc23e6f2fd` |
| Bundle doğrulama | `git bundle verify` → tam geçmiş |
| Test durumu | 369/369 geçti (43 dosya); lint 0 hata; build başarılı; Miniflare'de uçtan uca akış doğrulandı |

Bundle `--all` ile alınır (main + çalışma dalı). `/workspace/backups/` altındadır,
`/tmp` geçici dizininde değildir.

## GitHub push durumu — ENGELLEYİCİ (kullanıcı müdahalesi gerekir)

**Kesin teşhis (API ile doğrulandı):**

| Test | Sonuç |
|---|---|
| `GET /user` | `login: mekayildiz`, `type: User` |
| `GET /repos/mekayildiz/kul-ve-taht` → `permissions` | `push: true` (kullanıcının izni) |
| `POST /repos/.../git/refs` (dal oluştur) | ❌ `Resource not accessible by integration` |
| `PUT /repos/.../contents/probe.txt` | ❌ `Resource not accessible by integration` |
| `git push` | ❌ `403 Permission ... denied` |
| `GET /repos/...` (okuma) | ✅ `HTTP 200` (depo erişilebilir, salt-okunur) |

**Gerçek neden:** `GITHUB_TOKEN` bir **GitHub App kurulum/user-to-server
belirtecidir**; kullanıcı kimliği görünse de **`contents: write`** izni yoktur.
`permissions.push: true` yanıtı token'ın değil, kullanıcının depo iznini
gösterir. Token'ın yetkilerini aşmaya veya güvenlik önlemini atlamaya
çalışılmadı.

**Gereken tek kullanıcı müdahalesi (biri yeterli):**

1. GitHub App kurulumuna bu depo için **Contents: Read and write** izni vermek, **veya**
2. `repo` (classic) / `contents:write` (fine-grained) yetkili bir **kişisel erişim belirteci** sağlamak.

Yetki verildiğinde çalıştırılacak komut (tek adım):

```bash
cd /workspace/kul-ve-taht
git push -u origin feat/kul-ve-taht-development
```

Alternatif olarak `scripts/push-to-github.sh` betiği kullanılabilir (uzak
adresi belirteçle kurar, dalı gönderir ve başarısızlıkta net teşhis verir).

**Bu oturumda denenen ve başarısız olan ek yollar (kayıt için):**

- Dal oluşturma (`POST /git/refs`) → 403
- İçerik yazma (`PUT /contents/...`) → 403
- Kimlik bilgisi yardımcısı / SSH anahtarı → ortamda yok
- `gh auth` → `GITHUB_TOKEN` ile `mekayildiz` olarak giriş, ama belirteç `ghu_`
  (App kurulum belirteci) ve `contents: write` içermiyor

Belirtecin yetkilerini aşmaya veya güvenlik önlemini atlamaya çalışılmadı.

**Not:** GitHub'a gönderilemeyen hiçbir çalışma "gönderildi" olarak
gösterilmemektedir. Tüm ilerleme yerel commit'lerde ve yukarıdaki bundle'da
saklanır; her aşama sonunda bundle yenilenir.

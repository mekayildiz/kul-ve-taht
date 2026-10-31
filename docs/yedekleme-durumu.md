# Yedekleme ve Sürüm Kontrol Durumu

## Yerel çalışma (güvence altında)

| Öğe | Değer |
|---|---|
| Dal | `feat/kul-ve-taht-development` |
| Commit sayısı | 14 |
| HEAD | `8f5908e` |
| Çalışma ağacı | temiz |
| Kalıcı bundle | `/workspace/backups/kul-ve-taht-feat-20261031.bundle` |
| Bundle SHA-256 | `b84a6948fc7e5dac4ce01c7f3c8dbd5c69a1301a3ed124c94b0332409459b9b5` |
| Bundle doğrulama | `git bundle verify` → tam geçmiş |
| Test durumu | 258/258 geçti (32 dosya); lint 0 hata; uygulama build başarılı |

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

**Not:** GitHub'a gönderilemeyen hiçbir çalışma "gönderildi" olarak
gösterilmemektedir. Tüm ilerleme yerel commit'lerde ve yukarıdaki bundle'da
saklanır; her aşama sonunda bundle yenilenir.

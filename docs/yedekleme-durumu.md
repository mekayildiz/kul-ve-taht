# Yedekleme ve Sürüm Kontrol Durumu

## Yerel çalışma (güvence altında)

| Öğe | Değer |
|---|---|
| Dal | `feat/kul-ve-taht-development` |
| Commit sayısı | 26 |
| HEAD | `8aa20dd` |
| Çalışma ağacı | temiz |
| Kalıcı bundle | `/workspace/backups/kul-ve-taht-feat-20261031.bundle` |
| Bundle SHA-256 | her commit sonrası yeniden üretilir (aşağıdaki nota bakın) |
| Bundle doğrulama | `git bundle verify` → tam geçmiş |
| Test durumu | 483/483 geçti (51 dosya); lint 0 hata; build başarılı; 0 TL denetimi geçti |

Bundle `--all` ile alınır (main + çalışma dalı). `/workspace/backups/` altındadır,
`/tmp` geçici dizininde değildir.

## GitHub push durumu — ÇÖZÜLDÜ

`feat/kul-ve-taht-development` dalı `origin`'e gönderildi.

| Test | Sonuç |
|---|---|
| `git push origin feat/kul-ve-taht-development` | ✅ `79b89ef..8aa20dd` |
| `git fetch`/okuma | ✅ HTTP 200 |

Belirteç yazma yetkisi kazanınca aşağıdaki tek adım yeterlidir:

```bash
cd /workspace/kul-ve-taht
git push -u origin feat/kul-ve-taht-development
```

Alternatif olarak `scripts/push-to-github.sh` betiği kullanılabilir (uzak
adresi belirteçle kurar, dalı gönderir ve başarısızlıkta net teşhis verir).

**Not:** Her aşama sonunda yerel commit'ler ve bundle yenilenir; bundle
`git bundle verify` ile doğrulanır ve doğru HEAD'i taşır.

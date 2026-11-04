#!/usr/bin/env bash
# Kül ve Taht - GitHub'a gönderim yardımcısı.
#
# Neden bu betik var: Bu ortamdaki GITHUB_TOKEN bir GitHub App kurulum
# belirtecidir ve `contents: write` içermez; doğrudan push 403 döner.
# Kullanıcı, yazma yetkili bir belirteç sağladığında bu betik gönderimi
# tek komutla tamamlar.
#
# Kullanım:
#   GITHUB_TOKEN=<yazma-yetkili-belirtec> scripts/push-to-github.sh
#   # veya mevcut GITHUB_TOKEN ile:
#   scripts/push-to-github.sh

set -u

REPO="${REPO:-mekayildiz/kul-ve-taht}"
BRANCH="${BRANCH:-feat/kul-ve-taht-development}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "HATA: GITHUB_TOKEN tanimli degil." >&2
  echo "Yazma yetkili bir belirtec saglayin: GITHUB_TOKEN=... scripts/push-to-github.sh" >&2
  exit 1
fi

echo "Uzak adres ayarlaniyor: ${REPO}"
git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git"

echo "Dal gonderiliyor: ${BRANCH}"
if git push -u origin "${BRANCH}"; then
  echo "BASARILI: ${BRANCH} -> ${REPO}"
  exit 0
fi

echo "" >&2
echo "GONDERIM BASARISIZ (403). Olasi neden: belirtec yazma yetkisi icermiyor." >&2
echo "Cozum: GitHub App kurulumuna 'Contents: Read and write' izni verin VEYA" >&2
echo "       'repo' / 'contents:write' yetkili bir kisisel erisim belirteci kullanin." >&2
echo "Ayrinti: docs/yedekleme-durumu.md" >&2
exit 1

/**
 * Aksiyon hatalarini okunabilir mesaja cevirir (tasarim belgesi 21.1).
 *
 * Neden: sunucu basarisizligin NEDENINI makine-okunur "reason" kodu olarak
 * gonderiyor (ornek: no_feed, level_too_low). Istemci bu kodu atarsa oyuncu
 * yalnizca "Bu aksiyon su anda yapilamaz." gorur ve neyi duzeltecegini
 * bilemez. Bu modul kodu aciklamaya cevirir; eslesme yoksa kodu da gosterir
 * ki hicbir hata sessizce "genel hata"ya donusmesin.
 *
 * Saf fonksiyon: ag/veritabani erisimi yok.
 */

import { ApiRequestError } from "../api/client";
import type { Dictionary } from "../i18n";

export interface ActionErrorText {
  message: string;
  /** Eslesme bulunamayan makine-okunur kod (teshis icin gosterilir). */
  unknownReason?: string;
}

export function actionErrorText(error: unknown, t: Dictionary): ActionErrorText {
  if (!(error instanceof ApiRequestError)) {
    return { message: t.auth.errorGeneric };
  }

  // Once "reason" (alt neden), sonra "code" (ust neden) eslenir.
  const reason = error.reason;
  if (reason) {
    const known = (t.play.reasons as Record<string, string>)[reason];
    if (known) return { message: known };
    return { message: t.play.errorInvalid, unknownReason: reason };
  }

  const byCode: Record<string, string> = {
    not_enough_gold: t.play.errorNoGold,
    invalid_action: t.play.errorInvalid,
    unknown_item: t.play.errorUnknownItem,
    dead: t.play.errorDead,
    forbidden: t.play.errorForbidden,
    not_found: t.play.errorNotFound,
  };
  return { message: byCode[error.code] ?? t.auth.errorGeneric, ...(byCode[error.code] ? {} : { unknownReason: error.code }) };
}

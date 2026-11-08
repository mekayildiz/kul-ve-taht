/**
 * Gelisim cubuklari (tasarim belgesi 5.5, 19).
 *
 * Neden: silah ustaligi, itibar ve yeralti serefi sessizce birikiyordu;
 * oyuncu "gelisiyor muyum?" sorusunun cevabini goremiyordu. Bu modul bu
 * sayaclari seviyeye ve "sonraki seviyeye ne kadar kaldi" oranina cevirir.
 *
 * Saf fonksiyon: girdi durum, cikti cubuklar; ag/veritabani erisimi yok.
 */

import type { PlayStateDto } from "../api/client";

export type ProgressKey = "mastery" | "reputation" | "underworld";

/** Her seviye icin gereken puan. Buyudukce seviye atlanir. */
export const TIER_SIZE: Record<ProgressKey, number> = {
  mastery: 5,
  reputation: 10,
  underworld: 10,
};

export interface ProgressBar {
  key: ProgressKey;
  /** Ham sayac degeri. */
  value: number;
  /** 1'den baslayan seviye. */
  level: number;
  /** Bu seviyede toplanan puan. */
  current: number;
  /** Bir sonraki seviye icin gereken puan. */
  next: number;
  /** 0..1 arasi ilerleme orani. */
  ratio: number;
}

export function progressFor(value: number, tierSize: number): Omit<ProgressBar, "key" | "value"> {
  const size = Math.max(1, Math.floor(tierSize));
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const level = Math.floor(safe / size) + 1;
  const current = safe % size;
  return { level, current, next: size, ratio: current / size };
}

export function progressionBars(play: PlayStateDto): ProgressBar[] {
  const specs: { key: ProgressKey; value: number }[] = [
    { key: "mastery", value: play.weaponMastery },
    { key: "reputation", value: play.reputation },
    { key: "underworld", value: play.underworldRep },
  ];
  return specs.map((s) => ({ key: s.key, value: s.value, ...progressFor(s.value, TIER_SIZE[s.key]) }));
}

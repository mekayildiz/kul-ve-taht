/**
 * "Siradaki hedef" onerisi (tasarim belgesi 19, "yasanan dunya").
 *
 * Neden: oyuncu oyuna girince ne yapacagini bilmiyor; 85 aksiyon arasinda
 * kayboluyor. Bu modul karakterin DURUMUNA bakip en anlamli tek oneriyi secer
 * (kritik once gelir: olum, yaralanma, aclik...). Boylece "bos bos tiklamak"
 * yerine yonlendirilmis bir hedef olur.
 *
 * Saf fonksiyon: girdi durum, cikti hedef; veritabani/ag erisimi yok.
 */

import type { PlayStateDto } from "../api/client";

export type GoalTone = "crit" | "warn" | "info" | "good";

/** Onerilen sekme; PlayPanel'deki PlayTab ile ayni degerler. */
export type GoalTab = "durum" | "hayat" | "dunya" | "ekonomi" | "guc" | "siyaset";

export interface Goal {
  /** Baslik anahtari (i18n `play.goals` altinda). */
  key: string;
  tone: GoalTone;
  /** Hedefe goturen sekme. */
  tab: GoalTab;
}

export interface GoalInput {
  play: PlayStateDto;
  /** Acik yara sayisi (durumdan). */
  untreatedInjuries: number;
  /** Aktif gorev sayisi. */
  activeQuests: number;
  /** Tamamlanmis, odulu alinmamis gorev sayisi. */
  claimableQuests: number;
  /** Elde tasinan yiyecek miktari. */
  foodCount: number;
}

/**
 * Oncelik sirasi (yuksek = once gelir). Kritik saglik once, sonra firsat.
 */
export function nextGoal(input: GoalInput): Goal {
  const { play, untreatedInjuries, activeQuests, claimableQuests, foodCount } = input;

  if (!play.health.alive) {
    return { key: "dead", tone: "crit", tab: "hayat" };
  }
  if (untreatedInjuries > 0) {
    return { key: "treatInjuries", tone: "crit", tab: "durum" };
  }
  if (play.health.hunger >= 80) {
    return { key: "eat", tone: "crit", tab: "hayat" };
  }
  if (play.health.health <= 30) {
    return { key: "rest", tone: "warn", tab: "hayat" };
  }
  if (claimableQuests > 0) {
    return { key: "claimQuest", tone: "good", tab: "hayat" };
  }
  if (activeQuests > 0) {
    return { key: "continueQuest", tone: "info", tab: "hayat" };
  }
  if (foodCount === 0) {
    return { key: "getFood", tone: "warn", tab: "hayat" };
  }
  if (play.debts > play.gold) {
    return { key: "payDebts", tone: "warn", tab: "ekonomi" };
  }
  if (play.gold < 30) {
    return { key: "earnGold", tone: "info", tab: "ekonomi" };
  }
  return { key: "explore", tone: "info", tab: "dunya" };
}

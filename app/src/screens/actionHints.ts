/**
 * Aksiyon on kosullarini oyuncuya gosterir (tasarim belgesi 13, 21.1).
 *
 * Neden: sunucu bir aksiyonu reddettiginde NEDENINI aciklar (bkz. actionError),
 * ama oyuncu denemeden once de kosullari gormelidir. Bu modul katalog ve
 * karakter durumundan anlasilir ipuclari uretir ve mumkunse butonu kapatir.
 *
 * Saf fonksiyon: ag/veritabani erisimi yok.
 */

import type { CatalogDto, PlayStateDto } from "../api/client";
import type { Dictionary } from "../i18n";

/** Evcillestirme icin gereken en az av ustaligi (sunucu kurali ile ayni). */
export const TAME_MIN_MASTERY = 20;

export interface Hint {
  /** Gosterilecek aciklama; yoksa aksiyon yapilabilir. */
  text: string | null;
  /** Kosullar saglanmiyorsa true; buton kapatilir. */
  blocked: boolean;
}

export function tameHint(animal: { tameable?: boolean }, play: PlayStateDto, t: Dictionary): Hint {
  if (animal.tameable === false) return { text: t.play.notTameable, blocked: true };
  const hasFeed = (play.inventory ?? []).some((e) => e.itemId === "bread" || e.itemId === "dried-meat");
  if (!hasFeed) return { text: t.play.needFeed, blocked: true };
  if ((play.weaponMastery ?? 0) < TAME_MIN_MASTERY) {
    return { text: `${t.play.needMastery}: ${TAME_MIN_MASTERY}`, blocked: true };
  }
  return { text: null, blocked: false };
}

export function learnHint(
  path: CatalogDto["magicPaths"][number],
  play: PlayStateDto,
  kingdomId: string,
  t: Dictionary,
  training?: CatalogDto["magicTraining"],
): Hint {
  if ((path.outlawedIn ?? []).includes(kingdomId)) return { text: t.play.outlawedHere, blocked: true };
  if ((play.magicPaths ?? []).includes(path.id)) return { text: t.play.alreadyKnown, blocked: true };
  const minLevel = path.minLevel ?? 0;
  if ((play.magicLevel ?? 0) < minLevel) {
    return { text: `${t.play.minLevel}: ${minLevel}`, blocked: true };
  }
  // Kaynak gereksinimi SUNUCUDA dogrulanir; oyuncuya hangi kaynagin
  // gerektigini ve (varsa) usta kralligini soyleriz.
  const masters = training?.masterKingdoms ?? [];
  const hasMasterHere = masters.includes(kingdomId);
  const book = training?.pathBooks?.[path.id];
  const bookItem = (play.inventory ?? []).find((e) => e.itemId === book);
  if (path.source === "rare_book" && !bookItem) {
    return { text: t.play.needSource_rare_book, blocked: false };
  }
  if (path.source === "training" && !hasMasterHere) {
    return { text: t.play.needSource_training, blocked: false };
  }
  if (path.source === "both" && !bookItem && !hasMasterHere) {
    return { text: t.play.needSource_both, blocked: false };
  }
  return { text: null, blocked: false };
}

export function castHint(
  spell: { level: number; cost?: number },
  play: PlayStateDto,
  t: Dictionary,
): Hint {
  if ((play.magicLevel ?? 0) < spell.level) {
    return { text: `${t.play.minLevel}: ${spell.level}`, blocked: true };
  }
  if (typeof spell.cost === "number" && (play.energy ?? 0) < spell.cost) {
    return { text: `${t.play.needEnergy}: ${spell.cost}`, blocked: true };
  }
  return { text: null, blocked: false };
}

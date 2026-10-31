/**
 * Karakter gorunumu kisilestirme (tasarim belgesi 20, 17.2).
 *
 * Belge 20: "Karakter gorunusu yalnizca hazir portre secimiyle sinirli
 * kalmaz; yuz, sac, sakal, ten, goz, vucut, yara izi, dovme, kiyafet ve
 * ekipman gorunusu icin kapsamli kisilestirme sunulur."
 *
 * Dogrulama SUNUCUDA: serbest metin yalnizca izin verilen seceneklerden
 * olabilir; boy sinirlidir. Boylece istemci otorite olamaz (belge 21.1).
 */

export const FACE_SHAPES = ["oval", "yuvarlak", "kare", "kalp", "uzun", "keskin"] as const;
export const SKIN_TONES = ["acik", "bugday", "zeytin", "esmer", "koyu"] as const;
export const EYE_COLORS = ["ela", "mavi", "yesil", "kahve", "gri", "siyah"] as const;
export const HAIR_COLORS = ["siyah", "kahve", "kumral", "sari", "kizil", "gri", "beyaz"] as const;
export const HAIR_STYLES = ["kisa", "orta", "uzun", "topuz", "orgu", "kel", "at_kuyrugu"] as const;
export const BEARD_STYLES = ["yok", "sakal", "biyik", "keci", "tam"] as const;
export const BUILDS = ["ince", "atletik", "kasli", "tombul", "kisa_boylu"] as const;
export const OUTFITS = ["yolcu", "ciftci", "zanaatkar", "tacir", "asker", "soylu", "rahip", "sucu"] as const;

export interface AppearanceChoices {
  faceShape: string | null;
  skinTone: string | null;
  eyeColor: string | null;
  hairColor: string | null;
  hairStyle: string | null;
  beardStyle: string | null;
  heightCm: number | null;
  build: string | null;
  scars: string | null;
  tattoos: string | null;
  outfit: string | null;
}

export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;

export interface AppearanceOptions {
  faceShapes: readonly string[];
  skinTones: readonly string[];
  eyeColors: readonly string[];
  hairColors: readonly string[];
  hairStyles: readonly string[];
  beardStyles: readonly string[];
  builds: readonly string[];
  outfits: readonly string[];
  heightMinCm: number;
  heightMaxCm: number;
}

export function appearanceOptions(): AppearanceOptions {
  return {
    faceShapes: FACE_SHAPES,
    skinTones: SKIN_TONES,
    eyeColors: EYE_COLORS,
    hairColors: HAIR_COLORS,
    hairStyles: HAIR_STYLES,
    beardStyles: BEARD_STYLES,
    builds: BUILDS,
    outfits: OUTFITS,
    heightMinCm: HEIGHT_MIN_CM,
    heightMaxCm: HEIGHT_MAX_CM,
  };
}

export type AppearanceProblem = "invalid_choice" | "invalid_height" | "invalid_text";

/**
 * Gorunum degisikligini dogrular ve mevcut degerlerle birlestirir. Verilmeyen
 * alanlar KORUNUR (kismi guncelleme). Yalnizca izin verilen secenekler ve
 * sinirli uzunlukta metin kabul edilir.
 */
export function applyAppearanceChange(
  current: AppearanceChoices,
  change: Partial<AppearanceChoices>,
): { ok: true; appearance: AppearanceChoices } | { ok: false; problem: AppearanceProblem; field: string } {
  const next: AppearanceChoices = { ...current };

  type ChoiceField =
    | "faceShape"
    | "skinTone"
    | "eyeColor"
    | "hairColor"
    | "hairStyle"
    | "beardStyle"
    | "build"
    | "outfit";
  const choice = (field: ChoiceField, value: string | null | undefined, allowed: readonly string[]) => {
    if (value === undefined) return true;
    if (value === null) {
      next[field] = null;
      return true;
    }
    if (!allowed.includes(value)) return false;
    next[field] = value;
    return true;
  };

  if (!choice("faceShape", change.faceShape, FACE_SHAPES)) return { ok: false, problem: "invalid_choice", field: "faceShape" };
  if (!choice("skinTone", change.skinTone, SKIN_TONES)) return { ok: false, problem: "invalid_choice", field: "skinTone" };
  if (!choice("eyeColor", change.eyeColor, EYE_COLORS)) return { ok: false, problem: "invalid_choice", field: "eyeColor" };
  if (!choice("hairColor", change.hairColor, HAIR_COLORS)) return { ok: false, problem: "invalid_choice", field: "hairColor" };
  if (!choice("hairStyle", change.hairStyle, HAIR_STYLES)) return { ok: false, problem: "invalid_choice", field: "hairStyle" };
  if (!choice("beardStyle", change.beardStyle, BEARD_STYLES)) return { ok: false, problem: "invalid_choice", field: "beardStyle" };
  if (!choice("build", change.build, BUILDS)) return { ok: false, problem: "invalid_choice", field: "build" };
  if (!choice("outfit", change.outfit, OUTFITS)) return { ok: false, problem: "invalid_choice", field: "outfit" };

  if (change.heightCm !== undefined && change.heightCm !== null) {
    const h = Math.round(change.heightCm);
    if (!Number.isFinite(h) || h < HEIGHT_MIN_CM || h > HEIGHT_MAX_CM) {
      return { ok: false, problem: "invalid_height", field: "heightCm" };
    }
    next.heightCm = h;
  }

  for (const field of ["scars", "tattoos"] as const) {
    const value = change[field];
    if (value === undefined) continue;
    if (value === null) {
      next[field] = null;
      continue;
    }
    const text = String(value).trim();
    if (text.length > 120) return { ok: false, problem: "invalid_text", field };
    next[field] = text.length > 0 ? text : null;
  }

  return { ok: true, appearance: next };
}

import type { AppearanceDto } from "../api/client";

/**
 * Karakter avatari: portre secimleri (yuz, sac, ten, goz, vucut, kiyafet) ile
 * CANLI cizilir. Secimler degistikce avatari aninda guncellenir; boylece
 * "sabit profil resmi" sorunu ortadan kalkar. Harici gorsel varlik gerekmez
 * (0 TL): yalnizca SVG ile cizilir ve veri tasarrufu dostudur.
 */

export interface CharacterAvatarProps {
  appearance: AppearanceDto | null;
  /** Deterministik varsayilanlar icin tohum (karakter kimligi). */
  seed?: string;
  size?: number;
  /** Cinsiyet yoksa sac/sakal varsayilani icin. */
  className?: string;
  title?: string;
}

const SKIN_TONES: Record<string, string> = {
  acik: "#f0d3b4",
  bugday: "#e0b98d",
  zeytin: "#c99a6b",
  esmer: "#a06f45",
  koyu: "#6f4a2c",
};

const HAIR_COLORS: Record<string, string> = {
  siyah: "#20140d",
  kahve: "#3d2717",
  kumral: "#6b4a2c",
  sari: "#c9a961",
  kizil: "#9c4426",
  gri: "#9a938a",
  beyaz: "#e6e2da",
};

const EYE_COLORS: Record<string, string> = {
  ela: "#7a5a34",
  mavi: "#4a6f9c",
  yesil: "#4f7a4a",
  kahve: "#4a3421",
  gri: "#8a8f94",
  siyah: "#1c1a18",
};

const FACE_RX: Record<string, number> = {
  oval: 44,
  yuvarlak: 48,
  kare: 46,
  kalp: 43,
  uzun: 41,
  keskin: 45,
};

const BUILD_WIDTH: Record<string, number> = {
  ince: 74,
  atletik: 84,
  kasli: 94,
  tombul: 100,
  kisa_boylu: 88,
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Ilk deger yoksa tohumdan deterministik bir secim yapar. */
function pick(value: string | null | undefined, options: string[], hash: number, shift: number): string {
  if (value) return value;
  return options[(hash >> shift) % options.length]!;
}

export function CharacterAvatar({ appearance, seed = "kvt", size = 96, className, title }: CharacterAvatarProps): JSX.Element {
  const hash = hashSeed(seed);
  const skin = SKIN_TONES[pick(appearance?.skinTone, Object.keys(SKIN_TONES), hash, 0)] ?? SKIN_TONES.bugday!;
  const hairColor = HAIR_COLORS[pick(appearance?.hairColor, Object.keys(HAIR_COLORS), hash, 3)] ?? HAIR_COLORS.kahve!;
  const eye = EYE_COLORS[pick(appearance?.eyeColor, Object.keys(EYE_COLORS), hash, 6)] ?? EYE_COLORS.kahve!;
  const face = appearance?.faceShape ?? "oval";
  const faceRx = FACE_RX[face] ?? 44;
  const hair = appearance?.hairStyle ?? "orta";
  const beard = appearance?.beardStyle ?? "yok";
  const bodyWidth = BUILD_WIDTH[appearance?.build ?? "atletik"] ?? 84;
  // Kiyafet daima standart pacavra; yalnizca bez tonu cizilir.
  const isBald = hair === "kel";

  return (
    <svg
      className={className ?? "kvt-avatar"}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title}
    >
      <rect width="200" height="200" fill="#1b1512" />
      {/* Govde / pacavra giysi */}
      <path
        d={`M100 118 Q${100 - bodyWidth / 2} 128 ${100 - bodyWidth / 2 - 4} 200 L${100 + bodyWidth / 2 + 4} 200 Q${100 + bodyWidth / 2} 128 100 118 Z`}
        fill="#5b5347"
      />
      {/* Yirtik bez dokusu */}
      <path d="M64 160 L84 150 M104 154 L128 162 M76 184 L100 176" stroke="#423b31" strokeWidth="3" fill="none" />
      {/* Boyun */}
      <rect x="90" y="104" width="20" height="20" fill={skin} />
      {/* Yuz */}
      <ellipse cx="100" cy="78" rx={faceRx} ry="52" fill={skin} />
      {/* Kulaklar */}
      <ellipse cx={100 - faceRx} cy="82" rx="7" ry="11" fill={skin} />
      <ellipse cx={100 + faceRx} cy="82" rx="7" ry="11" fill={skin} />
      {/* Gozler */}
      <ellipse cx="82" cy="76" rx="6.5" ry="7.5" fill="#f4efe6" />
      <ellipse cx="118" cy="76" rx="6.5" ry="7.5" fill="#f4efe6" />
      <circle cx="82" cy="77" r="3.4" fill={eye} />
      <circle cx="118" cy="77" r="3.4" fill={eye} />
      {/* Kaslar */}
      <path d="M74 64 Q82 60 90 64" stroke={hairColor} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M110 64 Q118 60 126 64" stroke={hairColor} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Burun */}
      <path d="M100 80 L96 92 L104 92" stroke="#00000022" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      {/* Agiz */}
      <path d="M88 102 Q100 110 112 102" stroke="#7a4a3a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Sac */}
      {!isBald && hair === "kisa" && (
        <path d="M56 66 Q60 26 100 26 Q140 26 144 66 Q136 44 100 44 Q64 44 56 66 Z" fill={hairColor} />
      )}
      {!isBald && hair === "orta" && (
        <path d="M54 70 Q56 22 100 22 Q144 22 146 70 Q150 96 140 104 Q146 60 118 50 Q60 50 60 104 Q50 96 54 70 Z" fill={hairColor} />
      )}
      {!isBald && hair === "uzun" && (
        <path d="M50 74 Q50 18 100 18 Q150 18 150 74 Q154 120 146 150 Q140 118 138 84 Q140 48 100 44 Q60 48 62 84 Q60 118 54 150 Q46 120 50 74 Z" fill={hairColor} />
      )}
      {!isBald && hair === "topuz" && (
        <>
          <circle cx="100" cy="18" r="16" fill={hairColor} />
          <path d="M56 66 Q60 30 100 30 Q140 30 144 66 Q136 46 100 46 Q64 46 56 66 Z" fill={hairColor} />
        </>
      )}
      {!isBald && hair === "orgu" && (
        <>
          <path d="M52 70 Q54 22 100 22 Q146 22 148 70 Q150 92 142 100 Q148 58 118 48 Q60 48 58 100 Q50 92 52 70 Z" fill={hairColor} />
          <path d="M56 96 Q44 130 52 168 M144 96 Q156 130 148 168" stroke={hairColor} strokeWidth="12" fill="none" strokeLinecap="round" />
        </>
      )}
      {!isBald && hair === "at_kuyrugu" && (
        <>
          <path d="M56 64 Q60 24 100 24 Q140 24 144 64 Q136 42 100 42 Q64 42 56 64 Z" fill={hairColor} />
          <path d="M144 60 Q176 92 166 150 Q160 176 148 184 Q156 140 140 104 Z" fill={hairColor} />
        </>
      )}
      {/* Sakal */}
      {beard !== "yok" && (
        <path
          d={
            beard === "biyik"
              ? "M84 98 Q100 92 116 98 Q108 102 100 100 Q92 102 84 98 Z"
              : beard === "keci"
                ? "M92 104 Q100 122 108 104 Q104 118 100 118 Q96 118 92 104 Z"
                : "M72 92 Q100 150 128 92 Q124 126 100 128 Q76 126 72 92 Z"
          }
          fill={hairColor}
        />
      )}
    </svg>
  );
}

/**
 * Gorsel varlik kutuphanesi (tasarim belgesi 17.4, 17.5).
 *
 * Kural: Oyun verisi gorselin KENDISINI degil, varlik kimligini tasir. Gorsel
 * dosyalari veritabanina BLOB olarak konmaz; dosyalar Worker'in statik varlik
 * sisteminden (`app/dist/assets/...`) sunulur ve ihtiyac halinde yuklenir.
 * Burada yalnizca kayit, kimlik ve goreli yol tutulur. Her varlik lisans +
 * kaynak + kullanim bilgisiyle kayitlidir.
 *
 * 0 TL sarti: yalnizca ucretsiz lisansli varliklar (CC0, CC-BY) kabul edilir.
 */

export type AssetCategory = "portrait" | "icon" | "map" | "crest" | "environment";

export interface AssetLicense {
  id: string;
  attributionRequired: boolean;
  attributionText?: string;
}

export interface AssetRecord {
  assetKey: string;
  category: AssetCategory;
  license: string;
  source: string;
  assetPath: string;
  /** Kucuk turev (mobil/veri tasarrufu icin, belge 17.5). */
  thumbnailPath?: string;
  tags: string[];
}

/** Yalnizca ucretsiz lisanslar (0 TL). Ucretli/ticari lisans kabul edilmez. */
export const LICENSES: Record<string, AssetLicense> = {
  CC0: { id: "CC0", attributionRequired: false },
  "CC-BY-3.0": {
    id: "CC-BY-3.0",
    attributionRequired: true,
    attributionText: "Icons by game-icons.net (CC BY 3.0)",
  },
};

/** Ortak NPC portre havuzu: 20 kadin + 20 erkek (belge 17.2). */
export const PORTRAIT_POOL_SIZE = 40;

export interface PortraitAssignment {
  assetKey: string;
  /** true ise bu portre ozel karakter icin ayrilmistir; havuza verilmez. */
  reserved: boolean;
}

/**
 * Portre secimi: onemli karakterler icin ozel portre, siradan NPC'ler icin
 * havuzdan deterministik dagitim (belge 17.2). Ayni portre bircok NPC'de
 * kullanilabilir.
 */
export function portraitForKey(key: string, reserved: boolean, poolSize = PORTRAIT_POOL_SIZE): PortraitAssignment {
  if (reserved) return { assetKey: `portrait/special/${key}`, reserved: true };
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const index = hash % poolSize;
  return { assetKey: `portrait/pool/${String(index).padStart(2, "0")}`, reserved: false };
}

/** Veri tasarrufu: buyuk gorseller yerine kucuk turevi istenir (belge 17.5). */
export function resolveAssetPath(record: AssetRecord, dataSaver: boolean): string {
  if (dataSaver && record.thumbnailPath) return record.thumbnailPath;
  return record.assetPath;
}

/** Lisans uyumu: atif zorunluysa atif metni bulunmalidir. */
export function licenseCompliant(record: AssetRecord): boolean {
  const license = LICENSES[record.license];
  if (!license) return false;
  if (license.attributionRequired && !license.attributionText) return false;
  return record.source.trim().length > 0 && record.assetPath.trim().length > 0;
}

/** Katalogdan istege uygun varliklari suzer (kategori/etiket). */
export function selectAssets(
  catalog: readonly AssetRecord[],
  filter: { category?: AssetCategory; tag?: string } = {},
): AssetRecord[] {
  return catalog.filter((record) => {
    if (filter.category && record.category !== filter.category) return false;
    if (filter.tag && !record.tags.includes(filter.tag)) return false;
    return licenseCompliant(record);
  });
}

/** Atif listesi: oyunda gosterilmesi gereken tum atiflari uretir (lisans uyumu). */
export function attributionList(catalog: readonly AssetRecord[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const record of catalog) {
    const license = LICENSES[record.license];
    if (license?.attributionRequired && license.attributionText && !seen.has(license.id)) {
      seen.add(license.id);
      out.push(license.attributionText);
    }
  }
  return out;
}

// Ikonlar da yerel uretilir (scripts/gen-assets.mjs); harici kaynak yok.
const ICON_SOURCE = "self";

/**
 * Baslangic katalogu: yalnizca ucretsiz lisansli varliklar. Tum dosyalar
 * yerel uretilir (scripts/gen-assets.mjs), bu nedenle lisans CC0/self olup
 * atif zorunlulugu yoktur. Dosyalar Worker'in statik varlik sistemi altinda
 * (`/assets/...`) tutulur; burada yalnizca kayit ve kimlik tutulur.
 */
export const ASSET_CATALOG: readonly AssetRecord[] = [
  { assetKey: "icon/sword", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/sword.webp", thumbnailPath: "icons/sword-64.webp", tags: ["combat", "item"] },
  { assetKey: "icon/shield", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/shield.webp", thumbnailPath: "icons/shield-64.webp", tags: ["combat", "defense"] },
  { assetKey: "icon/gold", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/gold.webp", thumbnailPath: "icons/gold-64.webp", tags: ["economy"] },
  { assetKey: "icon/crown", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/crown.webp", thumbnailPath: "icons/crown-64.webp", tags: ["kingdom", "politics"] },
  { assetKey: "icon/scroll", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/scroll.webp", thumbnailPath: "icons/scroll-64.webp", tags: ["quest"] },
  { assetKey: "icon/horse", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/horse.webp", thumbnailPath: "icons/horse-64.webp", tags: ["travel"] },
  { assetKey: "icon/heart", category: "icon", license: "CC0", source: ICON_SOURCE, assetPath: "icons/heart.webp", thumbnailPath: "icons/heart-64.webp", tags: ["health"] },
  { assetKey: "crest/neutral", category: "crest", license: "CC0", source: "self", assetPath: "crests/neutral.webp", thumbnailPath: "crests/neutral-96.webp", tags: ["kingdom"] },
];

/** Portre havuzu gorselleri: 40 ortak portre (belge 17.2). */
export function portraitPoolCatalog(poolSize = PORTRAIT_POOL_SIZE): AssetRecord[] {
  const out: AssetRecord[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    const key = String(i).padStart(2, "0");
    out.push({
      assetKey: `portrait/pool/${key}`,
      category: "portrait",
      license: "CC0",
      source: "self",
      assetPath: `portraits/pool-${key}.webp`,
      thumbnailPath: `portraits/pool-${key}-96.webp`,
      tags: ["npc"],
    });
  }
  return out;
}


/**
 * Aile, evlilik, cocuklar ve kusaklar (tasarim belgesi 7).
 *
 * Olum kalicidir; oyuncu varisiyle veya yeni karakterle devam eder. Miras
 * kurallari aile mulku, unvani ve borcunu kapsar. Cocuk gelisim asamalari
 * belgede onaylanmistir (gercek gun cinsinden).
 */

export type FamilyRole = "spouse" | "child" | "parent" | "sibling";

export interface FamilyMember {
  id: string;
  name: string;
  role: FamilyRole;
  isPlayer: boolean;
  alive: boolean;
  ageYears: number;
  /** Evlilikte karsilikli riza (belge 7.1). */
  consented?: boolean;
}

export interface Family {
  id: string;
  surname: string;
  crest: string;
  members: FamilyMember[];
  /** Aile itibari 0-100; kusaklar boyunca surer/duser (belge 7.6). */
  reputation: number;
  /** Birikmis servet. */
  wealth: number;
  /** Aile borcu. */
  debt: number;
  titles: string[];
  /** Aile gecmisi kayitlari (kusaklar arasi aktarim, belge 8.2). */
  chronicle: string[];
}

export const MARRIAGE_MIN_AGE = 16;
export const ADULT_AGE = 18;

export function canMarry(a: FamilyMember, b: FamilyMember, bothConsent: boolean): boolean {
  if (!a.alive || !b.alive) return false;
  if (a.ageYears < MARRIAGE_MIN_AGE || b.ageYears < MARRIAGE_MIN_AGE) return false;
  // Karsilikli riza esas (belge 7.1); oyuncu-NPC icin NPC rizasi gerekir.
  return bothConsent;
}

/** Cocuk gelisim asamalari (belge 7.3: onaylanmis gercek gun sureleri). */
export const CHILD_STAGES = [
  { name: "infancy", realDays: 9, label: "Bebeklik" },
  { name: "early_childhood", realDays: 18, label: "Erken çocukluk" },
  { name: "childhood", realDays: 27, label: "Çocukluk" },
  { name: "adolescence", realDays: 36, label: "Ergenlik" },
  { name: "transition", realDays: 90, label: "Yetişkinliğe geçiş" },
] as const;

/** Gercek gune gore cocuk gelisim asamasini dondurur. */
export function childStage(realDaysSinceBirth: number): (typeof CHILD_STAGES)[number] {
  let acc = 0;
  for (const stage of CHILD_STAGES) {
    acc += stage.realDays;
    if (realDaysSinceBirth < acc) return stage;
  }
  return CHILD_STAGES[CHILD_STAGES.length - 1]!;
}

/** Yetiskinlige gecis toplam gercek gunu. */
export const DAYS_TO_ADULTHOOD = CHILD_STAGES.reduce((s, st) => s + st.realDays, 0);

/** Sutanne ve ebeveyn ilgisi gelisimi etkiler (belge 7.3). */
export function childDevelopmentBonus(parentAttention: number, wetNurseQuality: number): number {
  return Math.round(parentAttention * 0.5 + wetNurseQuality * 0.5);
}

export interface InheritanceResult {
  heirs: { memberId: string; share: number; gold: number; propertyValue: number }[];
  /** Anlasmazlik cikti mi (belge 7.6). */
  dispute: boolean;
}

/**
 * Miras: varisler arasinda paylasim. Vasiyet yoksa esit bolunur; vasiyet
 * varsa oranlara gore. Birden fazla varis anlasmazlik dogurabilir.
 */
export function distributeInheritance(
  family: Family,
  will: Record<string, number> | null,
  deceasedId?: string,
): InheritanceResult {
  // Varisler: yasayan, yetiskin ve OLMUS kisinin kendisi olmayan uyeler.
  const heirs = family.members.filter((m) => m.alive && m.ageYears >= ADULT_AGE && m.id !== deceasedId);
  if (heirs.length === 0) return { heirs: [], dispute: false };

  const total = family.wealth + family.debt * -1;
  const heirsResult = heirs.map((h) => {
    const share = (will?.[h.id] ?? 1 / heirs.length) as number;
    return {
      memberId: h.id,
      share: Math.round(share * 1000) / 1000,
      gold: Math.round(Math.max(0, total) * share),
      propertyValue: Math.round((family.wealth * 0.5) * share),
    };
  });
  // Anlasmazlik: 2+ varis ve vasiyet yoksa olasi catisma.
  const dispute = heirs.length > 1 && will === null;
  return { heirs: heirsResult, dispute };
}

/** Aile itibari degisimi (belge 7.6: nesiller boyunca surer veya duser). */
export function adjustReputation(family: Family, delta: number): Family {
  return { ...family, reputation: Math.max(0, Math.min(100, family.reputation + delta)) };
}

export interface PropertyLike {
  id: string;
  value: number;
}

export interface PropertyAssignment {
  propertyId: string;
  heirId: string;
}

/**
 * Nesiller arasi mulk aktarimi (belge 7.6, E6.5): olen kisinin mulkleri
 * miras payina gore varislere dagitilir. En degerli mulk en buyuk payli
 * varise gider; boylece bolunme azalir. Mulkiyet ilkeli E4.5 ile aynidir.
 */
export function assignPropertyToHeirs(
  properties: readonly PropertyLike[],
  heirs: readonly { memberId: string; share: number }[],
): PropertyAssignment[] {
  if (heirs.length === 0) return [];
  const sortedHeirs = [...heirs].sort((a, b) => b.share - a.share);
  const sortedProperties = [...properties].sort((a, b) => b.value - a.value);
  return sortedProperties.map((property, index) => ({
    propertyId: property.id,
    heirId: sortedHeirs[index % sortedHeirs.length]!.memberId,
  }));
}

/** Olum sonrasi aile gecmisine kayit (kusaklar arasi aktarim). */
export function recordDeath(family: Family, memberId: string, note: string, gameDay: number): Family {
  const members = family.members.map((m) => (m.id === memberId ? { ...m, alive: false } : m));
  return {
    ...family,
    members,
    chronicle: [...family.chronicle, `Gün ${gameDay}: ${note}`].slice(-200),
  };
}

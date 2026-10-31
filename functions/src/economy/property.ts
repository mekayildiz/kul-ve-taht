/**
 * Mulkiyet, isletme, ortaklik ve sirket islemleri (tasarim belgesi 9, 6).
 *
 * Kural: Bir mulk/isletme sahiplik payi net olarak izlenir; kar paylasimi
 * paylara gore yapilir. Sirket birlesme/devralma cogunluk payina ve degere
 * baglidir. Nesiller arasi devir (belge 7.6) ayni transfer ilkelini kullanir.
 */

export type PropertyType = "house" | "business" | "farm" | "mine" | "ship" | "warehouse";
export type OwnerType = "character" | "npc" | "company";

export interface Property {
  id: string;
  settlementId: string;
  propertyType: PropertyType;
  ownerType: OwnerType;
  ownerId: string | null;
  value: number;
  taxRate: number;
}

export interface Partner {
  ownerType: OwnerType;
  ownerId: string;
  /** Yuzde pay (0-100). Tum paylarin toplami 100 olmalidir. */
  share: number;
}

export interface Company {
  id: string;
  name: string;
  /** Ortaklik paylari. */
  partners: Partner[];
  capital: number;
  propertyIds: string[];
}

/** Mulku bir sahipten digerine devreder (satis, miras, el koyma). */
export function transferProperty(property: Property, toType: OwnerType, toId: string): Property {
  return { ...property, ownerType: toType, ownerId: toId };
}

/** Mulku vergilendirilebilir deger uzerinden yillik vergi yuku (belge 9). */
export function propertyTax(property: Property): number {
  return Math.round(property.value * property.taxRate);
}

/**
 * Isletme geliri: sermaye, calisan ve mulkun konumu (pazar buyuklugu) etkiler.
 * Cok buyuk gelirde azalan verim uygulanir (tek isletme ekonomiyi domine etmez).
 */
export function businessIncome(capital: number, employees: number, marketFactor: number): number {
  const base = capital * 0.08 + employees * 3;
  const scaled = base * marketFactor;
  return Math.round(scaled <= 0 ? 0 : scaled / (1 + scaled / 5000));
}

/** Ortaklik kurma dogrulamasi: paylar pozitif ve toplam 100 olmalidir. */
export function validPartnership(partners: readonly Partner[]): boolean {
  if (partners.length < 2) return false;
  const total = partners.reduce((sum, p) => sum + p.share, 0);
  if (Math.abs(total - 100) > 0.001) return false;
  return partners.every((p) => p.share > 0 && p.ownerId.trim().length > 0);
}

/** Kar paylasimi: her ortak payi oraninda alir; yuvarlama artigi en buyuk paya eklenir. */
export function distributeProfit(partners: readonly Partner[], profit: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (profit <= 0 || !validPartnership(partners)) {
    for (const p of partners) out[p.ownerId] = 0;
    return out;
  }
  let allocated = 0;
  let largest = partners[0]!;
  for (const p of partners) {
    const amount = Math.floor((profit * p.share) / 100);
    out[p.ownerId] = amount;
    allocated += amount;
    if (p.share > largest.share) largest = p;
  }
  out[largest.ownerId] = (out[largest.ownerId] ?? 0) + (profit - allocated);
  return out;
}

/** Sirket degeri: sermaye + sahip oldugu mulklerin toplami. */
export function companyValuation(company: Company, properties: readonly Property[]): number {
  const owned = properties.filter((p) => company.propertyIds.includes(p.id));
  return company.capital + owned.reduce((sum, p) => sum + p.value, 0);
}

/** Kontrol esigi: oy hakki icin gereken pay (yuzde). */
export const CONTROL_THRESHOLD = 50;

export function controllingPartner(partners: readonly Partner[]): Partner | null {
  let best: Partner | null = null;
  for (const p of partners) {
    if (p.share >= CONTROL_THRESHOLD && (!best || p.share > best.share)) best = p;
  }
  return best;
}

/**
 * Sirket birlesme/devralma teklifi: alici, degeri karsilayabiliyor ve
 * hedefte kontrol payina sahip veya tum ortaklardan onay almissa gecerli.
 */
export function canAcquire(
  acquirerCapital: number,
  target: Company,
  properties: readonly Property[],
  allPartnersAgree: boolean,
): boolean {
  const valuation = companyValuation(target, properties);
  if (acquirerCapital < valuation) return false;
  return controllingPartner(target.partners) !== null || allPartnersAgree;
}

/** Birlesme sonucu: alici sermayeden oder, hedef paylari aliciya gecer. */
export function mergeCompanies(
  acquirer: Company,
  target: Company,
  properties: readonly Property[],
  acquirerOwnerId: string,
): Company {
  const valuation = companyValuation(target, properties);
  return {
    ...acquirer,
    capital: Math.max(0, acquirer.capital - valuation),
    propertyIds: [...new Set([...acquirer.propertyIds, ...target.propertyIds])],
    partners: acquirer.partners.map((p) =>
      p.ownerId === acquirerOwnerId ? { ...p } : p,
    ),
  };
}

// --- Isletme: calisanlar ve sube agi (belge 20) ---

export interface Employee {
  id: string;
  name: string;
  /** Gunluk ucret. */
  wage: number;
  /** 0-100 beceri; geliri etkiler. */
  skill: number;
}

/** Toplam gunluk ucret yuku. */
export function payroll(employees: readonly Employee[]): number {
  return employees.reduce((s, e) => s + Math.max(0, e.wage), 0);
}

/**
 * Calisan verimlilik carpani: beceri ortalamasi 1.0-1.5 arasi gelir carpani
 * verir (belge 20). Calisan yoksa notr 1.0.
 */
export function staffEfficiency(employees: readonly Employee[]): number {
  if (employees.length === 0) return 1;
  const avg = employees.reduce((s, e) => s + Math.max(0, Math.min(100, e.skill)), 0) / employees.length;
  return 1 + (avg / 100) * 0.5;
}

export interface Branch {
  id: string;
  companyId: string;
  settlementId: string;
  /** Aylik isletme gideri. */
  upkeep: number;
}

/**
 * Sube agi net getirisi: her subenin pazar buyuklugune gore geliri, sabit
 * gideri asarsa pozitif olur (belge 20). Azalan verim uygulanir.
 */
export function branchNetworkIncome(branches: readonly Branch[], marketFactor: number): number {
  if (branches.length === 0) return 0;
  let gross = 0;
  for (const b of branches) {
    const contribution = 120 * marketFactor - b.upkeep;
    gross += contribution;
  }
  // Azalan verim: cok sube ayni pazari paylasir.
  const dampened = gross / (1 + Math.max(0, branches.length - 1) * 0.08);
  return Math.round(dampened);
}

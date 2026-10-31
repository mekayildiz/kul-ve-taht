import { describe, expect, it } from "vitest";
import {
  businessIncome,
  canAcquire,
  companyValuation,
  controllingPartner,
  distributeProfit,
  mergeCompanies,
  propertyTax,
  transferProperty,
  validPartnership,
  type Company,
  type Partner,
  type Property,
} from "./property";

const partners: Partner[] = [
  { ownerType: "character", ownerId: "a", share: 60 },
  { ownerType: "character", ownerId: "b", share: 40 },
];

const property: Property = {
  id: "p1",
  settlementId: "varkhenn-drahkmar",
  propertyType: "business",
  ownerType: "character",
  ownerId: "a",
  value: 1000,
  taxRate: 0.1,
};

describe("Mulkiyet ve sirket (belge 9, E4.5)", () => {
  it("mulku yeni sahibe devreder (satis/miras)", () => {
    const moved = transferProperty(property, "character", "b");
    expect(moved.ownerId).toBe("b");
    expect(moved.ownerType).toBe("character");
  });

  it("mulkiyet vergisini hesaplar", () => {
    expect(propertyTax(property)).toBe(100);
  });

  it("isletme gelirinde azalan verim uygular", () => {
    const small = businessIncome(1000, 5, 1);
    const big = businessIncome(100000, 200, 1);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(100000 * 0.08 + 200 * 3);
  });

  it("ortaklik paylarinin toplami 100 olmalidir", () => {
    expect(validPartnership(partners)).toBe(true);
    expect(validPartnership([{ ownerType: "character", ownerId: "a", share: 60 }])).toBe(false);
    expect(validPartnership([...partners, { ownerType: "character", ownerId: "c", share: 10 }])).toBe(false);
  });

  it("kari paylara gore dagitir ve yuvarlama artigini korur", () => {
    const out = distributeProfit(partners, 101);
    expect(out.a! + out.b!).toBe(101);
    expect(out.a).toBe(61);
    expect(out.b).toBe(40);
  });

  it("zarar durumunda kimse kar almaz", () => {
    const out = distributeProfit(partners, -50);
    expect(out.a).toBe(0);
    expect(out.b).toBe(0);
  });

  it("kontrol payini bulur (%50 esigi)", () => {
    expect(controllingPartner(partners)?.ownerId).toBe("a");
    const split: Partner[] = [
      { ownerType: "character", ownerId: "a", share: 45 },
      { ownerType: "character", ownerId: "b", share: 55 },
    ];
    expect(controllingPartner(split)?.ownerId).toBe("b");
  });

  it("sirket degerini sermaye + mulk degeri olarak hesaplar", () => {
    const company: Company = { id: "c1", name: "Demir Han", partners, capital: 500, propertyIds: ["p1"] };
    expect(companyValuation(company, [property])).toBe(1500);
  });

  it("yetersiz sermaye ile devralma reddedilir", () => {
    const target: Company = { id: "c2", name: "Tuz Yolu", partners, capital: 100, propertyIds: ["p1"] };
    expect(canAcquire(500, target, [property], true)).toBe(false);
    expect(canAcquire(2000, target, [property], true)).toBe(true);
  });

  it("birlesme sermayeden oder ve mulkleri birlestirir", () => {
    const acquirer: Company = { id: "c1", name: "Demir Han", partners, capital: 2000, propertyIds: [] };
    const target: Company = { id: "c2", name: "Tuz Yolu", partners, capital: 100, propertyIds: ["p1"] };
    const merged = mergeCompanies(acquirer, target, [property], "a");
    expect(merged.capital).toBe(900);
    expect(merged.propertyIds).toEqual(["p1"]);
  });
});

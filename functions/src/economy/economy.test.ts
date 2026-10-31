import { describe, expect, it } from "vitest";
import { priceFor, buyPrice, sellPrice, applyTrade, regionalPrice, canIssueLoan, accrueInterest, taxDue, collectTax, type MarketState } from "./market";

const market: MarketState = { itemId: "iron-sword", settlementId: "x", supply: 10, demand: 10, baseValue: 40 };

describe("pazar ve fiyat (belge 9)", () => {
  it("talep arzdan fazlaysa fiyat yukselir", () => {
    const scarce = priceFor({ ...market, supply: 2, demand: 20 });
    const abundant = priceFor({ ...market, supply: 20, demand: 2 });
    expect(scarce).toBeGreaterThan(abundant);
  });

  it("alim fiyati satis fiyatindan yuksektir (komisyon)", () => {
    expect(buyPrice(market)).toBeGreaterThan(sellPrice(market));
  });

  it("alim arzi dusurur, satis arzi artirir", () => {
    expect(applyTrade(market, 3, "buy").supply).toBe(7);
    expect(applyTrade(market, 3, "sell").supply).toBe(13);
  });

  it("fiyat asiri dalgalanmaz (sinirlar)", () => {
    const extreme = priceFor({ ...market, supply: 1, demand: 1000 });
    expect(extreme).toBeLessThanOrEqual(market.baseValue * 4);
  });

  it("bolgesel faktor fiyati degistirir", () => {
    expect(regionalPrice(100, 1.5)).toBe(150);
  });
});

describe("bankacilik ve kredi (belge 9)", () => {
  it("teminat veya itibar ile kredi verilir", () => {
    expect(canIssueLoan(100, 60, 10, 1000)).toBe(true);
    expect(canIssueLoan(100, 0, 80, 1000)).toBe(true);
    expect(canIssueLoan(100, 0, 10, 1000)).toBe(false);
  });

  it("rezerv ustu kredi verilmez", () => {
    expect(canIssueLoan(900, 500, 100, 1000)).toBe(false);
  });

  it("faiz isler, asiri borc iflas bayragi", () => {
    const loan = { id: "l1", borrowerId: "c1", bankId: "b1", principal: 100, outstanding: 100, interestRate: 10, issuedGameDay: 1 };
    const oneYear = accrueInterest(loan, 360);
    expect(oneYear.outstanding).toBeGreaterThan(100);
    const manyYears = accrueInterest(loan, 360 * 20);
    expect(manyYears.insolvent).toBe(true);
  });
});

describe("vergi (belge 9)", () => {
  it("gelir ve mulk uzerinden vergi hesaplanir", () => {
    expect(taxDue(1000, 500, 0.1, 0.05)).toBe(125);
  });

  it("eksik tahsilat memnuniyetsizlik dogurur", () => {
    const full = collectTax(0, 1000, 1);
    const partial = collectTax(0, 1000, 0.5);
    expect(full.treasury).toBeGreaterThan(partial.treasury);
    expect(partial.unrest).toBeGreaterThan(full.unrest);
  });
});

import { describe, expect, it } from "vitest";
import {
  auditCorruption,
  decayDay,
  disruptionImpact,
  marketIntervention,
  marketShare,
  monopolyPriceFactor,
  monthlyRent,
  placeBid,
  rentAfterTax,
  runBudgetMonth,
  settleAuction,
  storageOverflow,
  storageUsed,
  type Auction,
  type StockEntry,
  type StorageDef,
} from "./extras";

const storage: StorageDef = { capacity: 100, preservationFactor: 1 };

describe("Ekonomi tamamlayicilari (E8, belge 9.3-9.9)", () => {
  it("depolama kapasitesi ve tasma hesaplanir", () => {
    const entries: StockEntry[] = [
      { itemId: "wheat", quantity: 60, perishability: "fresh", ageDays: 0 },
      { itemId: "iron", quantity: 60, perishability: "durable", ageDays: 0 },
    ];
    expect(storageUsed(entries)).toBe(120);
    expect(storageOverflow(entries, storage)).toBe(20);
  });

  it("taze mal dayaniklidan hizli bozulur", () => {
    const entries: StockEntry[] = [
      { itemId: "bread", quantity: 100, perishability: "fresh", ageDays: 0 },
      { itemId: "iron", quantity: 100, perishability: "durable", ageDays: 0 },
    ];
    const [fresh, durable] = decayDay(entries, storage, 1) as [StockEntry, StockEntry];
    expect(fresh.quantity).toBeLessThan(durable.quantity);
    expect(fresh.ageDays).toBe(1);
  });

  it("depo tasarsa bozulma hizlanir", () => {
    const small: StorageDef = { capacity: 10, preservationFactor: 1 };
    const entries: StockEntry[] = [{ itemId: "bread", quantity: 100, perishability: "fresh", ageDays: 0 }];
    const normal = decayDay(entries, storage, 1)[0]!.quantity;
    const over = decayDay(entries, small, 1)[0]!.quantity;
    expect(over).toBeLessThan(normal);
  });

  it("acik artirmada rezerv ve en yuksek teklif kurali uygulanir", () => {
    const auction: Auction = { id: "a1", itemId: "chainmail", quantity: 1, reservePrice: 100, currentBid: 120, currentBidderId: "p1", endsAtMs: 1000 };
    expect(placeBid(auction, "p2", 90, 500).reason).toBe("below_reserve");
    expect(placeBid(auction, "p2", 110, 500).reason).toBe("not_highest");
    expect(placeBid(auction, "p1", 200, 500).reason).toBe("self_bid");
    expect(placeBid(auction, "p2", 150, 2000).reason).toBe("auction_ended");
    const ok = placeBid(auction, "p2", 150, 500);
    expect(ok.ok).toBe(true);
    expect(ok.auction.currentBidderId).toBe("p2");
  });

  it("acik artirma bitince kazanana satilir", () => {
    const auction: Auction = { id: "a1", itemId: "chainmail", quantity: 1, reservePrice: 100, currentBid: 150, currentBidderId: "p2", endsAtMs: 1000 };
    expect(settleAuction(auction, 500).sold).toBe(false);
    const done = settleAuction(auction, 2000);
    expect(done.sold).toBe(true);
    expect(done.winnerId).toBe("p2");
    expect(done.price).toBe(150);
  });

  it("kira doluluk ve vergiye gore hesaplanir", () => {
    const rent = monthlyRent({ propertyValue: 1000, monthlyRate: 5 }, 1);
    expect(rent).toBe(50);
    expect(monthlyRent({ propertyValue: 1000, monthlyRate: 5 }, 0.5)).toBe(25);
    expect(rentAfterTax(50, 0.2)).toBe(40);
  });

  it("tekel esigi asildiginda fiyat carpani buyur", () => {
    expect(marketShare(50, 100)).toBe(0.5);
    expect(monopolyPriceFactor(0.5)).toBe(1);
    expect(monopolyPriceFactor(0.8)).toBeGreaterThan(1);
  });

  it("piyasa bozulmasi arzi dusurup fiyati yukseltir", () => {
    const famine = disruptionImpact("famine");
    expect(famine.supplyFactor).toBeLessThan(1);
    expect(famine.priceFactor).toBeGreaterThan(1);
  });

  it("butce ayi vergi toplar ve acik verirse borclanir", () => {
    const good = runBudgetMonth({ treasury: 100, debt: 0, monthlyRevenue: 500, monthlyExpense: 300, corruption: 0 });
    expect(good.treasury).toBe(300);
    expect(good.debtCrisis).toBe(false);

    const bad = runBudgetMonth({ treasury: 0, debt: 0, monthlyRevenue: 100, monthlyExpense: 500, corruption: 0 });
    expect(bad.debt).toBe(400);
    expect(bad.debtCrisis).toBe(true);
  });

  it("yolsuzluk vergi gelirini azaltir", () => {
    const honest = runBudgetMonth({ treasury: 0, debt: 0, monthlyRevenue: 1000, monthlyExpense: 0, corruption: 0 });
    const corrupt = runBudgetMonth({ treasury: 0, debt: 0, monthlyRevenue: 1000, monthlyExpense: 0, corruption: 0.5 });
    expect(corrupt.collected).toBe(500);
    expect(corrupt.collected).toBeLessThan(honest.collected);
  });

  it("denetim yolsuzlugun bir kismini ortaya cikarir", () => {
    const r = auditCorruption(1000, 700, 0.5);
    expect(r.detected).toBe(150);
    expect(r.newCorruption).toBe(150);
  });

  it("kamu mudahalesi hazine yeterliyse fiyati dusurur", () => {
    const ok = marketIntervention(1000, 500, 1);
    expect(ok.ok).toBe(true);
    expect(ok.priceRelief).toBeGreaterThan(0);
    expect(marketIntervention(10, 500, 1).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  UNDERWORLD_ACTIONS,
  adjustGangStanding,
  blackMarketCatchChance,
  blackMarketPrice,
  canJoinGang,
  commitUnderworldAct,
  protectionMoney,
  type CrimeGang,
} from "./gangs";

const win = (): number => 0;
const lose = (): number => 0.99;

describe("Yeralti ve suc orgutleri (E8, belge 13.4)", () => {
  it("yuksek beceri ve orgut bagi basariyi artirir", () => {
    const skilled = commitUnderworldAct("smuggling", 90, 20, true, win);
    expect(skilled.ok).toBe(true);
    expect(skilled.success).toBe(true);
    expect(skilled.reward).toBeGreaterThan(0);
  });

  it("yakalanma sonucu bildirilir ve suc derecesi doner", () => {
    const mid = (): number => 0.5;
    const r = commitUnderworldAct("theft", 0, 90, false, mid);
    expect(r.success).toBe(false);
    expect(r.caught).toBe(true);
    expect(r.crimeSeverity).toBe(3);
  });

  it("basarisiz eylem itibari daha cok dusurur", () => {
    const success = commitUnderworldAct("fraud", 50, 20, false, win);
    const fail = commitUnderworldAct("fraud", 50, 20, false, lose);
    expect(fail.reputationDelta).toBeLessThan(success.reputationDelta);
  });

  it("bilinmeyen eylem reddedilir", () => {
    // @ts-expect-error gecersiz eylem
    expect(commitUnderworldAct("hack", 50, 20, false, win).reason).toBe("unknown_action");
  });

  it("karaborsa fiyati resmi fiyattan yuksektir", () => {
    const price = blackMarketPrice(100, { itemId: "luxury", priceMultiplier: 2.5, legalRisk: 0.4 });
    expect(price).toBe(250);
  });

  it("karaborsa yakalanma riski guvenlikle artar", () => {
    expect(blackMarketCatchChance(0.5, 90)).toBeGreaterThan(blackMarketCatchChance(0.5, 10));
  });

  it("orgute katilma guven ister", () => {
    const gang: CrimeGang = { id: "g1", name: "Kara Pençe", power: 60, settlements: ["ravenport"], standing: 0 };
    expect(canJoinGang(gang, 30).ok).toBe(true);
    expect(canJoinGang(gang, 5).reason).toBe("not_trusted");
    expect(canJoinGang({ ...gang, standing: -10 }, 30).reason).toBe("hostile");
  });

  it("orgut iliskisi sinirlar icinde kalir", () => {
    const gang: CrimeGang = { id: "g1", name: "Kara Pençe", power: 60, settlements: [], standing: 90 };
    expect(adjustGangStanding(gang, 50).standing).toBe(100);
    expect(adjustGangStanding(gang, -500).standing).toBe(-100);
  });

  it("koruma parasi orgut gucuyle olceklenir", () => {
    const strong: CrimeGang = { id: "g1", name: "Kara Pençe", power: 100, settlements: [], standing: 0 };
    const weak: CrimeGang = { ...strong, power: 20 };
    expect(protectionMoney(strong, 1000)).toBeGreaterThan(protectionMoney(weak, 1000));
  });

  it("veri seti tutarli", () => {
    expect(UNDERWORLD_ACTIONS.length).toBe(5);
    expect(UNDERWORLD_ACTIONS.every((a) => a.crimeSeverity > 0)).toBe(true);
  });
});

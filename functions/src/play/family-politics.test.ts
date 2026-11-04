import { describe, it, expect } from "vitest";
import { childStage, childDevelopmentBonus, DAYS_TO_ADULTHOOD } from "../family/dynasty";
import { councilVote } from "../politics/government";
import { isDuelRequestValid } from "../social/social";
import { marketShare } from "../economy/extras";
import { duelRequestUsable } from "./family-politics";

describe("family-politics baglantilari (belge 7.3, 9.4, 11, 16)", () => {
  it("cocuk gelisim asamalari gercek gune gore ilerler", () => {
    expect(childStage(0).name).toBe("infancy");
    expect(childStage(DAYS_TO_ADULTHOOD).name).toBe("transition");
    expect(childStage(10).name).toBe("early_childhood");
  });

  it("ebeveyn ilgisi ve sutanne kalitesi gelisim bonusu verir", () => {
    expect(childDevelopmentBonus(80, 60)).toBe(70);
    expect(childDevelopmentBonus(0, 100)).toBe(50);
  });

  it("konsey oyu yetersayim ve agirlik ile gecer", () => {
    const members = [
      { holderId: "a", authority: "lord", weight: 2, support: 60 },
      { holderId: "b", authority: "lord", weight: 1, support: 40 },
    ];
    const passed = councilVote(members, { a: "yes", b: "no" }, 1);
    expect(passed.passed).toBe(true);
    const noQuorum = councilVote(members, {}, 5);
    expect(noQuorum.quorumMet).toBe(false);
  });

  it("duello istegi 5 dakika icinde gecerli, sonra degil", () => {
    const req = { challengerId: "a", defenderId: "b", createdAtMs: 1_000_000, accepted: false };
    expect(duelRequestUsable(req, 1_000_000 + 60_000)).toBe(true);
    expect(duelRequestUsable(req, 1_000_000 + 10 * 60_000)).toBe(false);
    expect(duelRequestUsable({ ...req, accepted: true }, 1_000_000 + 1000)).toBe(false);
    // Saf fonksiyon ile ayni sonuc.
    expect(isDuelRequestValid({ id: "x", ...req }, 1_000_000 + 60_000)).toBe(true);
  });

  it("pazar payi orani hesaplanir", () => {
    expect(marketShare(60, 100)).toBe(0.6);
    expect(marketShare(0, 0)).toBe(0);
  });
});

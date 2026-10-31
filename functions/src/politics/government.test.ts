import { describe, expect, it } from "vitest";
import {
  appoint,
  councilVote,
  demote,
  dismiss,
  isVacant,
  promote,
  resolvePowerStruggle,
  type CouncilMember,
  type Position,
} from "./government";

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: "pos-1",
    kingdomId: "aurelith",
    title: "Hazine Naziri",
    authority: "tax",
    holderType: null,
    holderId: null,
    appointedAt: null,
    ...overrides,
  };
}

describe("Siyasi sistem (E5.5, belge 10/11)", () => {
  it("bos makam dogru bildirilir", () => {
    expect(isVacant(position())).toBe(true);
    expect(isVacant(position({ holderId: "npc-1", holderType: "npc" }))).toBe(false);
  });

  it("mutlak monarşide konsey onayi gerekmez", () => {
    const out = appoint(position(), "character", "ch-1", 1000, false, "absolute_monarchy");
    expect(out.ok).toBe(true);
    expect(out.position.holderId).toBe("ch-1");
  });

  it("konsey monarşisinde onay olmadan atama reddedilir", () => {
    const out = appoint(position(), "character", "ch-1", 1000, false, "council_monarchy");
    expect(out.ok).toBe(false);
    expect(out.position.holderId).toBeNull();
  });

  it("konsey onayiyla atama yapilir", () => {
    const out = appoint(position(), "npc", "npc-9", 2000, true, "council_monarchy");
    expect(out.ok).toBe(true);
    expect(out.position.appointedAt).toBe(2000);
  });

  it("azil makami bosaltir", () => {
    const dismissed = dismiss(position({ holderId: "ch-1", holderType: "character", appointedAt: 5 }));
    expect(isVacant(dismissed)).toBe(true);
    expect(dismissed.appointedAt).toBeNull();
  });

  it("rutbe yalnizca yetki ve yeterli hizmetle yukselir", () => {
    expect(promote("soldier", 100, false)).toBe("soldier");
    expect(promote("soldier", 10, true)).toBe("soldier");
    expect(promote("soldier", 100, true)).toBe("sergeant");
    expect(promote("general", 9999, true)).toBe("general");
  });

  it("rutbe dusurme bir basamak iner, tabanda kalir", () => {
    expect(demote("knight")).toBe("captain");
    expect(demote("recruit")).toBe("recruit");
  });

  it("konsey karari yetersayim olmadan gecmez", () => {
    const members: CouncilMember[] = [
      { holderId: "a", authority: "army", weight: 10, support: 50 },
      { holderId: "b", authority: "tax", weight: 10, support: 50 },
    ];
    const noQuorum = councilVote(members, { a: "yes" }, 25);
    expect(noQuorum.quorumMet).toBe(false);
    expect(noQuorum.passed).toBe(false);
  });

  it("konsey karari cogunluk ve yetersayimla gecer", () => {
    const members: CouncilMember[] = [
      { holderId: "a", authority: "army", weight: 10, support: 50 },
      { holderId: "b", authority: "tax", weight: 10, support: 50 },
      { holderId: "c", authority: "justice", weight: 10, support: 50 },
    ];
    const decision = councilVote(members, { a: "yes", b: "yes", c: "no" }, 20);
    expect(decision.quorumMet).toBe(true);
    expect(decision.passed).toBe(true);
  });

  it("siyasi mucadelede destek+itibar yuksek olan kazanir", () => {
    expect(
      resolvePowerStruggle({ challengerSupport: 60, incumbentSupport: 40, challengerReputation: 20, incumbentReputation: 10 }),
    ).toBe("challenger");
    expect(
      resolvePowerStruggle({ challengerSupport: 30, incumbentSupport: 70, challengerReputation: 0, incumbentReputation: 0 }),
    ).toBe("incumbent");
  });

  it("esitlikte mevcut makam sahibi kazanir", () => {
    expect(
      resolvePowerStruggle({ challengerSupport: 50, incumbentSupport: 50, challengerReputation: 0, incumbentReputation: 0 }),
    ).toBe("incumbent");
  });
});

import { describe, expect, it } from "vitest";
import { arrestChance, rollArrest, sentence, escapeChance, attemptEscape, bribe, CRIME_SEVERITY, type Crime, type LegalProfile } from "./system";

const profile: LegalProfile = { standing: 50, bribeCapacity: 100, connections: 10 };
const theft: Crime = { id: "c1", type: "theft", settlementId: "varkhenn-drahkmar", committedGameDay: 1, evidence: 40, witnessed: true };
const murder: Crime = { id: "c2", type: "assassination", settlementId: "varkhenn-drahkmar", committedGameDay: 1, evidence: 80, witnessed: true };

describe("suc ve yargi (belge 13.4, 13.5)", () => {
  it("delil ve tanik yakalanma olasiligini artirir", () => {
    const weak = arrestChance({ ...theft, evidence: 10, witnessed: false }, 50, profile);
    const strong = arrestChance({ ...theft, evidence: 90, witnessed: true }, 50, profile);
    expect(strong).toBeGreaterThan(weak);
  });

  it("siyasi baglanti yakalanma riskini azaltir", () => {
    const low = arrestChance(theft, 50, { ...profile, connections: 0 });
    const high = arrestChance(theft, 50, { ...profile, connections: 90 });
    expect(high).toBeLessThan(low);
  });

  it("zayif delilde beraat (sebepsiz ceza yok)", () => {
    const result = sentence({ ...theft, evidence: 5, witnessed: false }, profile, 100, 0.9);
    expect(result.type).toBe("acquitted");
  });

  it("agir sucta surgun, orta sucta hapis, hafif sucta para cezasi", () => {
    expect(sentence(murder, profile, 100, 0.0).type).toBe("exile");
    expect(sentence({ ...theft, type: "banditry", evidence: 90 }, profile, 100, 0.0).type).toBe("imprisonment");
    expect(sentence({ ...theft, evidence: 90 }, profile, 100, 0.0).type).toBe("fine");
  });

  it("ceza agirligi suç turune gore artar", () => {
    expect(CRIME_SEVERITY.assassination).toBeGreaterThan(CRIME_SEVERITY.theft);
  });

  it("yakalanma karari deterministik", () => {
    expect(rollArrest(50, 0.4).arrested).toBe(true);
    expect(rollArrest(50, 0.6).arrested).toBe(false);
  });
});

describe("hapis ve kacis (belge 13.5)", () => {
  it("ceviklik ve zeka kacis sansini artirir", () => {
    expect(escapeChance(18, 18, 0, 20)).toBeGreaterThan(escapeChance(5, 5, 0, 20));
  });

  it("rusvet kacis sansini artirir", () => {
    expect(escapeChance(10, 10, 100, 50)).toBeGreaterThan(escapeChance(10, 10, 0, 50));
  });

  it("basarisiz kacis cezayi uzatir", () => {
    const prison = { characterId: "ch1", settlementId: "x", daysRemaining: 5, escapeAttempts: 0 };
    const fail = attemptEscape(prison, 50, 0.9);
    expect(fail.escaped).toBe(false);
    expect(fail.prison.daysRemaining).toBe(7);
    const success = attemptEscape(prison, 50, 0.1);
    expect(success.escaped).toBe(true);
    expect(success.prison.daysRemaining).toBe(0);
  });

  it("rusvet yeterliyse kabul edilir", () => {
    expect(bribe(profile, 200, 50).accepted).toBe(true);
    expect(bribe(profile, 10, 50).accepted).toBe(false);
  });
});

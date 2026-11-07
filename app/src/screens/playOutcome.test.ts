import { describe, expect, it } from "vitest";
import { describeOutcome, outcomeSummary } from "./playOutcome";
import { getDictionary } from "../i18n";
import type { PlayStateDto } from "../api/client";

const t = getDictionary();

function state(overrides: Partial<PlayStateDto> = {}): PlayStateDto {
  return {
    characterId: "ch-1",
    health: { health: 100, hunger: 10, fatigue: 0, alive: true, injuries: [], diseases: [] },
    inventory: [],
    gold: 20,
    debts: 0,
    reputation: 0,
    weapon: "unarmed",
    weaponMastery: 0,
    strength: 8,
    magicLevel: 0,
    energy: 50,
    magicPaths: [],
    underworldRep: 0,
    ...overrides,
  };
}

describe("describeOutcome", () => {
  it("altin kazancini gosterir", () => {
    const lines = describeOutcome(t, state({ gold: 20 }), state({ gold: 67 }), { income: 47, guildBonus: 0 });
    expect(lines).toContainEqual({ label: t.play.outcome.goldGain, value: "+47", tone: "gain" });
    expect(outcomeSummary(t, lines)).toContain("+47");
  });

  it("harcamayi negatif ve loss tonuyla gosterir", () => {
    const lines = describeOutcome(t, state({ gold: 100 }), state({ gold: 40 }), { cost: 60 });
    expect(lines).toContainEqual({ label: t.play.outcome.goldLoss, value: "-60", tone: "loss" });
  });

  it("saglik dususu ve aclik artisini bad tonuyla isaretler", () => {
    const before = state({ health: { health: 100, hunger: 10, fatigue: 0, alive: true, injuries: [], diseases: [] } });
    const after = state({ health: { health: 88, hunger: 34, fatigue: 0, alive: true, injuries: [], diseases: [] } });
    const lines = describeOutcome(t, before, after, undefined);
    expect(lines).toContainEqual({ label: t.play.outcome.health, value: "-12", tone: "bad" });
    expect(lines).toContainEqual({ label: t.play.outcome.hunger, value: "+24", tone: "bad" });
  });

  it("sifir degisimi gostermez", () => {
    const lines = describeOutcome(t, state(), state(), undefined);
    expect(lines).toHaveLength(0);
  });

  it("ganimeti okunabilir listeye cevirir", () => {
    const lines = describeOutcome(t, state(), state(), { loot: [{ itemId: "hide", quantity: 2 }] });
    expect(lines).toContainEqual({ label: t.play.outcome.loot, value: "hide ×2", tone: "gain" });
  });

  it("savas zaferini ve tur sayisini gosterir", () => {
    const lines = describeOutcome(t, state(), state(), { winner: "attacker", rounds: 3 });
    expect(lines).toContainEqual({ label: t.play.outcome.victory, value: "", tone: "crit" });
    expect(lines).toContainEqual({ label: t.play.outcome.rounds, value: "3", tone: "neutral" });
  });

  it("olumu bad tonuyla bildirir", () => {
    const before = state();
    const after = state({ health: { health: 0, hunger: 100, fatigue: 0, alive: false, injuries: [], diseases: [] } });
    const lines = describeOutcome(t, before, after, undefined);
    expect(lines).toContainEqual({ label: t.play.deadBanner, value: "", tone: "bad" });
  });

  it("yeni yarayi sayar", () => {
    const injury = { id: "inj-1", kind: "cut", severity: 2, bleeding: 1, infection: 0, treated: false };
    const before = state();
    const after = state({
      health: { health: 100, hunger: 10, fatigue: 0, alive: true, injuries: [injury], diseases: [] },
    });
    const lines = describeOutcome(t, before, after, undefined);
    expect(lines).toContainEqual({ label: t.play.outcome.injury, value: "1", tone: "bad" });
  });
});

describe("outcomeSummary", () => {
  it("bos satirlar icin bos metin doner", () => {
    expect(outcomeSummary(t, [])).toBe("");
  });
});

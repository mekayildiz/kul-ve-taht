import { describe, expect, it } from "vitest";
import { TAME_MIN_MASTERY, castHint, learnHint, tameHint } from "./actionHints";
import { getDictionary } from "../i18n";
import type { PlayStateDto } from "../api/client";

const t = getDictionary();

function play(over: Partial<PlayStateDto> = {}): PlayStateDto {
  return {
    characterId: "c1",
    health: { health: 90, hunger: 10, fatigue: 5, alive: true, injuries: [], diseases: [] },
    inventory: [],
    gold: 100,
    debts: 0,
    reputation: 0,
    weapon: "unarmed",
    weaponMastery: 0,
    strength: 8,
    magicLevel: 0,
    energy: 100,
    magicPaths: [],
    underworldRep: 0,
    ...over,
  };
}

describe("tameHint", () => {
  it("evcilleştirilemez hayvani kapatir", () => {
    expect(tameHint({ tameable: false }, play(), t).blocked).toBe(true);
  });

  it("yem yoksa anlasilir neden verir", () => {
    const hint = tameHint({ tameable: true }, play({ inventory: [] }), t);
    expect(hint.blocked).toBe(true);
    expect(hint.text).toBe(t.play.needFeed);
  });

  it("yeterli ustalik ve yem varsa acar", () => {
    const hint = tameHint(
      { tameable: true },
      play({ inventory: [{ itemId: "bread", quantity: 1, condition: 1 }], weaponMastery: TAME_MIN_MASTERY }),
      t,
    );
    expect(hint.blocked).toBe(false);
    expect(hint.text).toBeNull();
  });
});

describe("learnHint", () => {
  it("yasak krallikta kapatir", () => {
    expect(learnHint({ id: "spirit_caller", name: "x", minLevel: 0, source: "rare_book", outlawedIn: ["varkhenn"] }, play(), "varkhenn", t).blocked).toBe(true);
  });

  it("seviye yetersizse gereken seviyeyi gosterir", () => {
    const hint = learnHint({ id: "spirit_caller", name: "x", minLevel: 20, source: "rare_book", outlawedIn: [] }, play({ magicLevel: 3 }), "aurelith", t);
    expect(hint.blocked).toBe(true);
    expect(hint.text).toContain("20");
  });

  it("kaynak gereksinimini aciklar ama kapatmaz (usta/kitap sunucuda dogrulanir)", () => {
    const hint = learnHint({ id: "elemental", name: "x", minLevel: 0, source: "both", outlawedIn: [] }, play(), "aurelith", t);
    expect(hint.blocked).toBe(false);
    expect(hint.text).toBe(t.play.needSource_both);
  });

  it("zaten bilinen yolu kapatir", () => {
    expect(learnHint({ id: "elemental", name: "x", minLevel: 0, source: "both", outlawedIn: [] }, play({ magicPaths: ["elemental"] }), "aurelith", t).blocked).toBe(true);
  });
});

describe("castHint", () => {
  it("seviye yetersizse kapatir", () => {
    expect(castHint({ level: 5 }, play({ magicLevel: 1 }), t).blocked).toBe(true);
  });

  it("enerji yetersizse kapatir", () => {
    const hint = castHint({ level: 1, cost: 20 }, play({ magicLevel: 1, energy: 5 }), t);
    expect(hint.blocked).toBe(true);
    expect(hint.text).toContain("20");
  });

  it("kosullar uygunsa acar", () => {
    expect(castHint({ level: 1, cost: 8 }, play({ magicLevel: 1, energy: 100 }), t).blocked).toBe(false);
  });
});

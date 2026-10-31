import { describe, expect, it } from "vitest";
import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { SETTLEMENTS, countByKind, settlementsByKingdom } from "./settlements";
import { HIERARCHY, SETTLEMENTS_PER_KINGDOM, TOTAL_SETTLEMENTS_TARGET } from "./types";
import { worldSummary } from "./index";

describe("Valedorn dunyasi", () => {
  it("5 krallik, 3 bagimsiz sehir, 2 tarafsiz bolge icerir", () => {
    expect(KINGDOMS).toHaveLength(5);
    expect(FREE_CITIES).toHaveLength(3);
    expect(NEUTRAL_ZONES).toHaveLength(2);
  });

  it("toplam 130 yerlesim icerir", () => {
    expect(SETTLEMENTS).toHaveLength(TOTAL_SETTLEMENTS_TARGET);
    expect(worldSummary().settlements).toBe(130);
  });

  it("her krallikta tam hiyerarsi vardir (1/3/5/12/5)", () => {
    for (const k of KINGDOMS) {
      const counts = countByKind(k.id);
      expect(counts).toEqual(HIERARCHY);
      expect(settlementsByKingdom(k.id)).toHaveLength(SETTLEMENTS_PER_KINGDOM);
    }
  });

  it("baskent adlari tasarim belgesiyle uyusur", () => {
    const capitals = KINGDOMS.map((k) => k.capital).sort();
    expect(capitals).toEqual(["Amsyra", "Caerthas", "Drahkmar", "Itheryn", "Velmora"]);
  });

  it("yerlesim kimlikleri benzersizdir", () => {
    const ids = new Set(SETTLEMENTS.map((s) => s.id));
    expect(ids.size).toBe(SETTLEMENTS.length);
  });

  it("hicbir yerlesim dekoratif degildir (uretim/rol etiketi zorunlu)", () => {
    for (const s of SETTLEMENTS) {
      expect(s.primaryOutput.length).toBeGreaterThan(0);
    }
  });

  it("harita koordinatlari 0-100 araligindadir", () => {
    for (const s of SETTLEMENTS) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(100);
    }
  });
});

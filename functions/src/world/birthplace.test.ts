import { describe, expect, it } from "vitest";
import { birthplacePanel, allBirthplacePanels, mapData } from "./birthplace";
import { SETTLEMENTS } from "./settlements";

describe("dogum yeri bilgi paneli (belge 5.1)", () => {
  it("130 yerlesimin TAMAMI icin panel uretir", () => {
    expect(SETTLEMENTS).toHaveLength(130);
    expect(allBirthplacePanels()).toHaveLength(130);
  });

  it("her panelde karsilastirilabilir tum alanlar dolu", () => {
    for (const panel of allBirthplacePanels()) {
      expect(panel.geography.length, `${panel.name} cografya`).toBeGreaterThan(0);
      expect(panel.climate.length, `${panel.name} iklim`).toBeGreaterThan(0);
      expect(panel.economy.length, `${panel.name} ekonomi`).toBeGreaterThan(0);
      expect(panel.politicalSituation.length, `${panel.name} siyaset`).toBeGreaterThan(0);
      expect(panel.militarySituation.length, `${panel.name} askeri`).toBeGreaterThan(0);
      expect(panel.socialStructure.length, `${panel.name} toplum`).toBeGreaterThan(0);
      expect(panel.opportunities.length, `${panel.name} firsat`).toBeGreaterThan(0);
      expect(panel.advantages.length, `${panel.name} arti`).toBeGreaterThan(0);
      expect(panel.disadvantages.length, `${panel.name} eksi`).toBeGreaterThan(0);
    }
  });

  it("bilinmeyen yerlesim icin null doner", () => {
    expect(birthplacePanel("yok")).toBeNull();
  });

  it("kuzey krallik iklimi ile guney krallik iklimi farklidir", () => {
    const north = birthplacePanel("varkhenn-drahkmar");
    const south = birthplacePanel("solmerya-amsyra");
    expect(north?.climate).not.toBe(south?.climate);
  });

  it("harita verisi 130 yerlesim + 3 bagimsiz sehir + 2 tarafsiz bolge icerir", () => {
    const map = mapData();
    expect(map.settlements).toHaveLength(130);
    expect(map.freeCities).toHaveLength(3);
    expect(map.neutralZones).toHaveLength(2);
    expect(map.kingdoms).toHaveLength(5);
  });
});

import { describe, expect, it } from "vitest";
import { SETTLEMENTS } from "./settlements";
import { FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { allSettlementProfiles, settlementProfile, totalWorldPopulation } from "./settlement-profile";

describe("Yerlesim profilleri (belge 4 ve 20)", () => {
  it("130 yerlesimin TAMAMI icin tam profil uretir", () => {
    const profiles = allSettlementProfiles();
    expect(SETTLEMENTS).toHaveLength(130);
    expect(profiles).toHaveLength(130 + FREE_CITIES.length + NEUTRAL_ZONES.length);
  });

  it("her profil belge 20'nin istedigi butun alanlari doldurur", () => {
    for (const p of allSettlementProfiles()) {
      expect(p.population, `${p.settlementId} nufus`).toBeGreaterThan(0);
      expect(p.economy.primaryProduction.length, `${p.settlementId} uretim`).toBeGreaterThan(0);
      expect(p.economy.primaryConsumption.length, `${p.settlementId} tuketim`).toBeGreaterThan(0);
      expect(p.economy.marketSize, `${p.settlementId} pazar`).toBeGreaterThan(0);
      expect(p.governance.length, `${p.settlementId} yonetim`).toBeGreaterThan(0);
      expect(p.security, `${p.settlementId} guvenlik`).toBeGreaterThan(0);
      expect(p.notableFamilies, `${p.settlementId} aile`).toBeGreaterThan(0);
      expect(p.npcCount, `${p.settlementId} npc`).toBeGreaterThan(0);
      expect(p.transport.roadLinks, `${p.settlementId} ulasim`).toBeGreaterThan(0);
      expect(p.dominantSeason.length, `${p.settlementId} mevsim`).toBeGreaterThan(0);
      expect(p.politicalAllegiance.length, `${p.settlementId} baglilik`).toBeGreaterThan(0);
    }
  });

  it("baslangic yerlesimi (varkhenn-drahkmar) basken profilidir", () => {
    const p = settlementProfile("varkhenn-drahkmar");
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("capital");
    expect(p!.governance).toBe("royal_governor");
    expect(p!.security).toBeGreaterThanOrEqual(80);
  });

  it("profil turetme deterministiktir (ayni kimlik -> ayni profil)", () => {
    const a = settlementProfile("solmerya-amsyra");
    const b = settlementProfile("solmerya-amsyra");
    expect(a).toEqual(b);
  });

  it("bagimsiz sehirler ve tarafsiz bolgeler de profillidir", () => {
    const ravenport = settlementProfile("ravenport");
    expect(ravenport?.politicalAllegiance).toBe("free_city");
    const pass = settlementProfile("greywatch-pass");
    expect(pass?.politicalAllegiance).toBe("neutral");
  });

  it("dunya nufusu tum yerlesimlerin toplamidir", () => {
    const total = totalWorldPopulation();
    expect(total).toBeGreaterThan(130 * 900);
  });

  it("bilinmeyen yerlesim null doner", () => {
    expect(settlementProfile("yok-boyle-yer")).toBeNull();
  });
});

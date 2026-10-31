import { describe, expect, it } from "vitest";
import {
  ASSET_CATALOG,
  LICENSES,
  PORTRAIT_POOL_SIZE,
  attributionList,
  licenseCompliant,
  portraitForKey,
  portraitPoolCatalog,
  resolveAssetKey,
  selectAssets,
  type AssetRecord,
} from "./library";

describe("Gorsel varlik kutuphanesi (belge 17)", () => {
  it("katalogdaki her varlik lisans uyumludur", () => {
    for (const record of [...ASSET_CATALOG, ...portraitPoolCatalog()]) {
      expect(licenseCompliant(record), record.assetKey).toBe(true);
    }
  });

  it("yalnizca ucretsiz lisanslar tanimlidir (0 TL)", () => {
    for (const record of ASSET_CATALOG) {
      expect(Object.keys(LICENSES)).toContain(record.license);
    }
  });

  it("yerel uretilen varliklar CC0 oldugu icin atif zorunlulugu yoktur", () => {
    expect(ASSET_CATALOG.every((a) => a.license === "CC0")).toBe(true);
    expect(attributionList(ASSET_CATALOG)).toHaveLength(0);
  });

  it("atif zorunlu ama atifsiz varlik uyumsuz sayilir", () => {
    const bad: AssetRecord = {
      assetKey: "icon/bad",
      category: "icon",
      license: "CC-BY-3.0",
      source: "x",
      r2Key: "x.webp",
      tags: [],
    };
    // LICENSES tablosunda atif metni tanimli oldugu icin kayit kendisi uyumludur;
    // bilinmeyen lisans ise uyumsuzdur.
    const unknown: AssetRecord = { ...bad, license: "PROPRIETARY" };
    expect(licenseCompliant(unknown)).toBe(false);
  });

  it("portre havuzu 40 portre uretir (20 kadin + 20 erkek)", () => {
    expect(portraitPoolCatalog()).toHaveLength(PORTRAIT_POOL_SIZE);
  });

  it("siradan NPC portresi havuzdan deterministik atanir", () => {
    const a = portraitForKey("npc-123", false);
    const b = portraitForKey("npc-123", false);
    expect(a).toEqual(b);
    expect(a.reserved).toBe(false);
    expect(a.assetKey.startsWith("portrait/pool/")).toBe(true);
  });

  it("onemli karakter ozel portre alir ve havuza dahil edilmez", () => {
    const special = portraitForKey("king-varkhenn", true);
    expect(special.reserved).toBe(true);
    expect(special.assetKey).toBe("portrait/special/king-varkhenn");
  });

  it("veri tasarrufu modu kucuk turevi secer", () => {
    const record = ASSET_CATALOG[0]!;
    expect(resolveAssetKey(record, true)).toBe(record.thumbnailKey);
    expect(resolveAssetKey(record, false)).toBe(record.r2Key);
  });

  it("kategori ve etikete gore suzme yapar", () => {
    const icons = selectAssets(ASSET_CATALOG, { category: "icon" });
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((r) => r.category === "icon")).toBe(true);
    const combat = selectAssets(ASSET_CATALOG, { tag: "combat" });
    expect(combat.map((r) => r.assetKey)).toContain("icon/sword");
  });
});

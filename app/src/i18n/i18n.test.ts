import { describe, expect, it } from "vitest";
import { tr } from "./tr";
import { en } from "./en";
import { DEFAULT_LOCALE, getDictionary } from "./index";

/** Anahtar kumesini duz (noktali) yola cevirir. */
function flatten(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof val === "object" && val !== null ? flatten(val as object, path) : [path];
  });
}

describe("i18n", () => {
  it("varsayilan dil Turkce'dir", () => {
    expect(DEFAULT_LOCALE).toBe("tr");
    expect(getDictionary("tr").appTitle).toBe("Kül ve Taht");
  });

  it("TR ve EN ayni anahtar kumesine sahiptir (eksik ceviri yok)", () => {
    expect(flatten(en).sort()).toEqual(flatten(tr).sort());
  });

  it("hicbir ceviri bos degildir", () => {
    for (const value of Object.values(flatten(en))) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("mevsim ve yerlesim turleri cevrilmistir", () => {
    expect(getDictionary("en").seasons.winter).toBe("Winter");
    expect(getDictionary("en").kinds.castle).toBe("Castle");
    expect(getDictionary("tr").kinds.castle).toBe("Kale");
  });
});

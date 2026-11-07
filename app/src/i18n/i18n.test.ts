import { describe, expect, it } from "vitest";
import { tr } from "./tr";
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
    expect(getDictionary().appTitle).toBe("Kül ve Taht");
  });

  it("hicbir ceviri bos degildir", () => {
    for (const value of Object.values(flatten(tr))) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("mevsim ve yerlesim turleri cevrilmistir", () => {
    expect(getDictionary().seasons.winter).toBe("Kış");
    expect(getDictionary().kinds.castle).toBe("Kale");
  });
});

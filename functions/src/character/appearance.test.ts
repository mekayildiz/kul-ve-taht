import { describe, expect, it } from "vitest";
import {
  applyAppearanceChange,
  appearanceOptions,
  FACE_SHAPES,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  type AppearanceChoices,
} from "./appearance";

const empty: AppearanceChoices = {
  faceShape: null,
  skinTone: null,
  eyeColor: null,
  hairColor: null,
  hairStyle: null,
  beardStyle: null,
  heightCm: null,
  build: null,
  scars: null,
  tattoos: null,
  outfit: null,
};

describe("Karakter gorunumu kisilestirme (belge 20)", () => {
  it("gecerli secenekleri uygular ve verilmeyen alanlari korur", () => {
    const first = applyAppearanceChange(empty, { faceShape: FACE_SHAPES[0], hairColor: "siyah", heightCm: 180 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyAppearanceChange(first.appearance, { hairStyle: "orgu" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.appearance.hairStyle).toBe("orgu");
    expect(second.appearance.faceShape).toBe(FACE_SHAPES[0]);
    expect(second.appearance.heightCm).toBe(180);
  });

  it("gecersiz secenegi reddeder", () => {
    const result = applyAppearanceChange(empty, { faceShape: "ucgen" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toBe("invalid_choice");
    expect(result.field).toBe("faceShape");
  });

  it("sinir disi boyu reddeder, sinir ici boyu kabul eder", () => {
    expect(applyAppearanceChange(empty, { heightCm: HEIGHT_MIN_CM - 1 }).ok).toBe(false);
    expect(applyAppearanceChange(empty, { heightCm: HEIGHT_MAX_CM + 1 }).ok).toBe(false);
    expect(applyAppearanceChange(empty, { heightCm: HEIGHT_MIN_CM }).ok).toBe(true);
  });

  it("asiri uzun yara izi/dovme metnini reddeder, bos metni null yapar", () => {
    expect(applyAppearanceChange(empty, { scars: "x".repeat(121) }).ok).toBe(false);
    const cleared = applyAppearanceChange({ ...empty, scars: "yuz izi" }, { scars: "   " });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.appearance.scars).toBeNull();
  });

  it("secenek listelerini eksiksiz sunar", () => {
    const options = appearanceOptions();
    expect(options.faceShapes.length).toBeGreaterThan(0);
    expect(options.outfits).toContain("yolcu");
    expect(options.heightMinCm).toBe(HEIGHT_MIN_CM);
  });
});

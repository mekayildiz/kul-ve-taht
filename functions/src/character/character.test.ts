import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-support/sqlite-harness";
import { queryOne } from "../db/client";
import { registerAccount } from "../auth/service";
import { seedWorld } from "../world/seed";
import { FREE_CITIES, NEUTRAL_ZONES } from "../world/kingdoms";
import { createCharacter, MAX_STARTING_EXPERTISE } from "./service";
import { validateAttributes, emptyAttributes, STARTING_POINT_POOL } from "./attributes";
import { applyPersonalityShift, neutralPersonality } from "./personality";
import { gainExpertiseXp, canLearnPath, RESTRICTED_PATHS } from "./expertise";

async function setup() {
  const db = createTestDb();
  await seedWorld(db);
  const reg = await registerAccount(db, { email: "k@valedorn.tr", password: "cok-guclu-parola-1" });
  if (!reg.ok) throw new Error("kayit basarisiz");
  return { db, accountId: reg.accountId };
}

const attrs = emptyAttributes();

describe("nitelikler (belge 5.5)", () => {
  it("yedi nitelik toplami tam olmali", () => {
    expect(validateAttributes(attrs).valid).toBe(true);
    const bad = { ...attrs, strength: 9 };
    const check = validateAttributes(bad);
    expect(check.valid).toBe(false);
    expect(check.problems.some((p) => p.includes(String(STARTING_POINT_POOL)))).toBe(true);
  });

  it("sinir disi niteligi reddeder", () => {
    const check = validateAttributes({ ...attrs, agility: 99 });
    expect(check.valid).toBe(false);
  });
});

describe("kisilik (belge 5.6)", () => {
  it("secimlerle degisir ve 0-100 araliginda kalir", () => {
    const start = neutralPersonality();
    const braver = applyPersonalityShift(start, { key: "courage", delta: 15 });
    expect(braver.courage).toBe(65);
    const clamped = applyPersonalityShift({ ...start, courage: 95 }, { key: "courage", delta: 20 });
    expect(clamped.courage).toBe(100);
  });
});

describe("uzmanlik (belge 5.7)", () => {
  it("sinif kilidi yok: birden fazla yol ogrenilebilir", () => {
    expect(canLearnPath(["knight"], "archer")).toBe(true);
    expect(canLearnPath(["knight"], "knight")).toBe(false);
  });

  it("tecrube ile seviye artar", () => {
    const progress = gainExpertiseXp({ path: "knight", level: 0, xp: 0 }, 250);
    expect(progress.level).toBeGreaterThan(0);
  });

  it("karanlik sanatlar kisitli yol olarak isaretli", () => {
    expect(RESTRICTED_PATHS).toContain("spirit_caller");
  });
});

describe("karakter olusturma servisi", () => {
  it("gecerli karakteri tum katmanlariyla olusturur", async () => {
    const { db, accountId } = await setup();
    const result = await createCharacter(db, {
      accountId,
      givenName: "Kael",
      surname: "Veyr",
      birthSettlement: "varkhenn-drahkmar",
      attributes: attrs,
      expertisePaths: ["knight"],
      professions: ["blacksmith"],
      appearance: { eyeColor: "ela", heightCm: 180, build: "atletik" },
      background: { familyWealth: "modest", familyProfession: "blacksmith" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const char = await queryOne<{ given_name: string; current_settlement: string }>(
      db,
      "SELECT given_name, current_settlement FROM characters WHERE id = ?",
      result.characterId,
    );
    expect(char?.given_name).toBe("Kael");
    expect(char?.current_settlement).toBe("varkhenn-drahkmar");

    const attrRow = await queryOne<{ leadership: number }>(
      db,
      "SELECT leadership FROM character_attributes WHERE character_id = ?",
      result.characterId,
    );
    expect(attrRow?.leadership).toBe(8);

    const reputationCount = await queryOne<{ c: number }>(
      db,
      "SELECT COUNT(*) AS c FROM character_reputation WHERE character_id = ?",
      result.characterId,
    );
    expect(reputationCount?.c).toBe(4);

    const appearance = await queryOne<{ eye_color: string }>(
      db,
      "SELECT eye_color FROM character_appearance WHERE character_id = ?",
      result.characterId,
    );
    expect(appearance?.eye_color).toBe("ela");
  });

  it("olmayan dogum yerini reddeder", async () => {
    const { db, accountId } = await setup();
    const result = await createCharacter(db, {
      accountId,
      givenName: "Kael",
      surname: "Veyr",
      birthSettlement: "yok-boyle-yer",
      attributes: attrs,
    });
    expect(result).toEqual({ ok: false, error: "invalid_birth_settlement" });
  });

  it("gecersiz nitelik dagitimini reddeder (istemci otorite degil)", async () => {
    const { db, accountId } = await setup();
    const result = await createCharacter(db, {
      accountId,
      givenName: "Kael",
      surname: "Veyr",
      birthSettlement: "varkhenn-drahkmar",
      attributes: { ...attrs, strength: 20 },
    });
    expect(result.ok).toBe(false);
  });

  it("cok fazla uzmanlik yolunu reddeder", async () => {
    const { db, accountId } = await setup();
    const result = await createCharacter(db, {
      accountId,
      givenName: "Kael",
      surname: "Veyr",
      birthSettlement: "varkhenn-drahkmar",
      attributes: attrs,
      expertisePaths: ["knight", "archer", "shaman"].slice(0, MAX_STARTING_EXPERTISE + 1) as never,
    });
    expect(result).toEqual({ ok: false, error: "too_many_expertise" });
  });

  it("kisa ismi reddeder", async () => {
    const { db, accountId } = await setup();
    const result = await createCharacter(db, {
      accountId,
      givenName: "K",
      surname: "Veyr",
      birthSettlement: "varkhenn-drahkmar",
      attributes: attrs,
    });
    expect(result).toEqual({
      ok: false,
      error: "invalid_name",
      problems: ["Ad ve soyad en az 2 karakter olmalidir"],
    });
  });
});

describe("dunya tohumlama", () => {
  it("idempotenttir: iki kez calistirilabilir, veriyi cogaltmaz", async () => {
    const db = createTestDb();
    const first = await seedWorld(db);
    const second = await seedWorld(db);
    // 130 krallik yerlesimi + bagimsiz sehirler + tarafsiz bolgeler.
    const expected = 130 + FREE_CITIES.length + NEUTRAL_ZONES.length;
    expect(first.settlements).toBe(expected);
    expect(second.settlements).toBe(expected);
    const count = await queryOne<{ c: number }>(db, "SELECT COUNT(*) AS c FROM settlements");
    expect(count?.c).toBe(expected);
    const kingdoms = await queryOne<{ c: number }>(db, "SELECT COUNT(*) AS c FROM kingdoms");
    expect(kingdoms?.c).toBe(5);
  });
});

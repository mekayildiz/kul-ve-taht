/**
 * Dunya verisini D1'e tohumlar (idempotent).
 *
 * Idempotentlik: `INSERT OR IGNORE` kullanilir; ayni tohumlama birden fazla
 * kez calistirilabilir ve mevcut oyuncu verisini EZMEZ (krallik/yereysim
 * tanimlari sabit veridir; hazine gibi oyuncu etkili alanlar korunur).
 */

import type { SqlDatabase } from "../db/client";
import { execute, queryAll, queryOne } from "../db/client";
import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";
import { allSettlementProfiles } from "./settlement-profile";

export interface SeedResult {
  kingdoms: number;
  settlements: number;
  npcs: number;
}

/**
 * NPC katmanlari (belge 8.8): her yerlesime onemli/yerel/arka plan NPC uretir.
 * Sayilar Free plan yazma kotasi icin sinirlidir: yerlesim basina 1 onemli,
 * 2 yerel ve 4 arka plan = 7 NPC; 130+ yerlesimde ~950 NPC.
 */
const NPC_TIERS_PER_SETTLEMENT: { importance: "critical" | "notable" | "background"; count: number }[] = [
  { importance: "critical", count: 1 },
  { importance: "notable", count: 2 },
  { importance: "background", count: 4 },
];

export async function seedWorld(db: SqlDatabase, nowMs: number = Date.now()): Promise<SeedResult> {
  let kingdomCount = 0;
  for (const kingdom of KINGDOMS) {
    await execute(
      db,
      `INSERT OR IGNORE INTO kingdoms (id, name, capital, government, treasury, debt)
       VALUES (?,?,?,?,?,?)`,
      kingdom.id,
      kingdom.name,
      kingdom.capital,
      kingdom.government,
      0,
      0,
    );
    kingdomCount += 1;
  }

  // Nufus ve guvenlik, belge 20'de istenen yerlesim profilinden gelir.
  const profiles = new Map(allSettlementProfiles().map((p) => [p.settlementId, p]));

  let settlementCount = 0;
  for (const settlement of SETTLEMENTS) {
    const profile = profiles.get(settlement.id);
    await execute(
      db,
      `INSERT OR IGNORE INTO settlements (id, name, kind, kingdom_id, x, y, population, security, primary_output)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      settlement.id,
      settlement.name,
      settlement.kind,
      settlement.kingdomId,
      settlement.x,
      settlement.y,
      profile?.population ?? 0,
      profile?.security ?? 50,
      settlement.primaryOutput,
    );
    settlementCount += 1;
  }

  // Bagimsiz sehirler ve tarafsiz bolgeler de yerlesim kaydina sahiptir (belge 20).
  for (const city of FREE_CITIES) {
    const profile = profiles.get(city.id);
    await execute(
      db,
      `INSERT OR IGNORE INTO settlements (id, name, kind, kingdom_id, x, y, population, security, primary_output)
       VALUES (?,?,?,NULL,?,?,?,?,?)`,
      city.id,
      city.name,
      "city",
      city.x,
      city.y,
      profile?.population ?? 0,
      profile?.security ?? 50,
      profile?.economy.primaryProduction ?? "Ticaret",
    );
    settlementCount += 1;
  }
  for (const zone of NEUTRAL_ZONES) {
    const profile = profiles.get(zone.id);
    await execute(
      db,
      `INSERT OR IGNORE INTO settlements (id, name, kind, kingdom_id, x, y, population, security, primary_output)
       VALUES (?,?,?,NULL,?,?,?,?,?)`,
      zone.id,
      zone.name,
      "town",
      zone.x,
      zone.y,
      profile?.population ?? 0,
      profile?.security ?? 50,
      profile?.economy.primaryProduction ?? "Gecis ticareti",
    );
    settlementCount += 1;
  }

  // Dunya saati tek satirdir (id = 1). Sema baslangicta last_tick_real_ms = 0
  // ile ekler; "baslatilmamis" demektir. Tohumlama bunu simdiye ayarlar ki
  // oyun gunu 1'den baslasin. Mevcut (ilerlemis) saat KORUNUR.
  await execute(
    db,
    "UPDATE world_clock SET last_tick_real_ms = ? WHERE id = 1 AND last_tick_real_ms <= 0",
    nowMs,
  );

  const npcs = await seedNpcs(db, nowMs);
  await seedCourtOffices(db, nowMs);
  return { kingdoms: kingdomCount, settlements: settlementCount, npcs };
}

/**
 * Saray makamlarini NPC'lerle doldurur (belge 8.7). Oyun basladiginda
 * kral/kraliceden en alt memura kadar butun makamlar doludur; oyuncular
 * otomatik makam sahibi olmaz, bu makamlar icin rekabet eder (belge 8.6).
 */
export async function seedCourtOffices(db: SqlDatabase, nowMs: number = Date.now()): Promise<number> {
  const before = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM offices");
  for (const kingdom of KINGDOMS) {
    // `capital` alani yerlesim ADIDIR (kimlik degil); once kimlige cevrilir.
    const capital = await queryOne<{ id: string }>(
      db,
      "SELECT id FROM settlements WHERE name = ? AND kingdom_id = ? LIMIT 1",
      kingdom.capital,
      kingdom.id,
    );
    const capitalId = capital?.id ?? kingdom.capital;
    // Saray gorevlileri baska NPC'ler olsun; her makama sirayla atanir.
    const courtiers = await queryAll<{ id: string }>(
      db,
      "SELECT id FROM npcs WHERE settlement_id = ? AND alive = 1 ORDER BY importance, gold DESC LIMIT ?",
      capitalId,
      COURT_TITLES.length,
    );
    for (const [index, title] of COURT_TITLES.entries()) {
      await execute(
        db,
        `INSERT OR IGNORE INTO offices (id, kingdom_id, settlement_id, title, holder_type, holder_id, rank, service_points, appointed_day)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        `office-${kingdom.id}-${title.key}`,
        kingdom.id,
        capitalId,
        title.label,
        "npc",
        courtiers[index]?.id ?? courtiers[0]?.id ?? null,
        title.rank,
        title.points,
        nowMs,
      );
    }
  }
  const after = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM offices");
  return (after?.n ?? 0) - (before?.n ?? 0);
}

/** Saray makam zinciri: hükümdardan alt memura (belge 8.7, 10). */
const COURT_TITLES: { key: string; label: string; rank: string; points: number }[] = [
  { key: "ruler", label: "Hukumdar", rank: "general", points: 200 },
  { key: "chancellor", label: "Bas Vezir", rank: "marshal", points: 150 },
  { key: "treasurer", label: "Hazine Bakani", rank: "knight", points: 110 },
  { key: "marshal", label: "Ordu Komutani", rank: "marshal", points: 150 },
  { key: "spymaster", label: "Istihbarat Basi", rank: "captain", points: 90 },
  { key: "diplomat", label: "Bas Diplomat", rank: "captain", points: 80 },
  { key: "clerk", label: "Katip", rank: "recruit", points: 10 },
];

/** Yerlesimlere katmanli NPC tohumlar (belge 8.8). Idempotent. */
export async function seedNpcs(db: SqlDatabase, nowMs: number = Date.now()): Promise<number> {
  const settlements = await queryAll<{ id: string; name: string }>(
    db,
    "SELECT id, name FROM settlements ORDER BY id",
  );
  const before = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM npcs");
  let counter = 0;
  for (const settlement of settlements) {
    for (const tier of NPC_TIERS_PER_SETTLEMENT) {
      for (let i = 0; i < tier.count; i += 1) {
        const id = `npc-${settlement.id}-${tier.importance}-${i}`;
        const name = `${settlement.name} ${tier.importance === "critical" ? "Beyi" : tier.importance === "notable" ? "Esnafi" : "Sakini"} ${i + 1}`;
        await execute(
          db,
          `INSERT OR IGNORE INTO npcs (id, name, role, settlement_id, age_years, alive, importance, created_at, needs_json, goals_json, gold, debts, profession, last_simulated_day)
           VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,0)`,
          id,
          name,
          tier.importance === "critical" ? "lord" : tier.importance === "notable" ? "merchant" : "farmer",
          settlement.id,
          20 + ((counter + i) % 40),
          tier.importance,
          nowMs,
          JSON.stringify({ food: 50, shelter: 50, safety: 50, social: 50 }),
          JSON.stringify([]),
          50 + ((counter * 7) % 200),
          0,
          tier.importance === "background" ? "ciftci" : "tuccar",
        );
        counter += 1;
      }
    }
  }
  const after = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM npcs");
  return (after?.n ?? 0) - (before?.n ?? 0);
}

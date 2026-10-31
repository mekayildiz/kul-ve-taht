/**
 * Dunya verisini D1'e tohumlar (idempotent).
 *
 * Idempotentlik: `INSERT OR IGNORE` kullanilir; ayni tohumlama birden fazla
 * kez calistirilabilir ve mevcut oyuncu verisini EZMEZ (krallik/yereysim
 * tanimlari sabit veridir; hazine gibi oyuncu etkili alanlar korunur).
 */

import type { SqlDatabase } from "../db/client";
import { execute } from "../db/client";
import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";
import { allSettlementProfiles } from "./settlement-profile";

export interface SeedResult {
  kingdoms: number;
  settlements: number;
}

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

  return { kingdoms: kingdomCount, settlements: settlementCount };
}

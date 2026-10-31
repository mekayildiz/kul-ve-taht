/**
 * Dunya verisini D1'e tohumlar (idempotent).
 *
 * Idempotentlik: `INSERT OR IGNORE` kullanilir; ayni tohumlama birden fazla
 * kez calistirilabilir ve mevcut oyuncu verisini EZMEZ (krallik/yereysim
 * tanimlari sabit veridir; hazine gibi oyuncu etkili alanlar korunur).
 */

import type { SqlDatabase } from "../db/client";
import { execute } from "../db/client";
import { KINGDOMS } from "./kingdoms";
import { SETTLEMENTS } from "./settlements";

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

  let settlementCount = 0;
  for (const settlement of SETTLEMENTS) {
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
      0,
      50,
      settlement.primaryOutput,
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

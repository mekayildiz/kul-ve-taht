/**
 * D1 referans verisi ureticisi.
 *
 * Dunya tanimlari (kralliklar + 130 yerlesim) TypeScript'te TEK KAYNAKTIR.
 * Bu betik onlari idempotent bir migration'a cevirir; boylece referans veri
 * D1'de oyuncu islemlerinden ONCE var olur ve karakter olusturma dogum yeri
 * kontrolu her zaman gecer.
 *
 * Kullanim: npx vite-node scripts/gen-world-seed.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { KINGDOMS, FREE_CITIES, NEUTRAL_ZONES } from "../functions/src/world/kingdoms";
import { SETTLEMENTS } from "../functions/src/world/settlements";
import { allSettlementProfiles } from "../functions/src/world/settlement-profile";

function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildWorldSeedSql(): string {
  const lines: string[] = [
    "-- 0003: Dunya referans verisi (kralliklar + yerlesimler)",
    "--",
    "-- UYARI: Bu dosya OTOMATIK uretilir. Elle duzenlemeyin.",
    "-- Kaynak: functions/src/world/{kingdoms,settlements,settlement-profile}.ts",
    "-- Yeniden uret: npx vite-node scripts/gen-world-seed.ts",
    "--",
    "-- Idempotenttir: INSERT OR IGNORE mevcut oyuncu verisini ezmez.",
    "",
  ];

  for (const k of KINGDOMS) {
    lines.push(
      `INSERT OR IGNORE INTO kingdoms (id, name, capital, government, treasury, debt) VALUES (${q(k.id)}, ${q(k.name)}, ${q(k.capital)}, ${q(k.government)}, 0, 0);`,
    );
  }
  lines.push("");

  // Nufus ve guvenlik, belge 20'de istenen yerlesim profilinden gelir.
  const profiles = new Map(allSettlementProfiles().map((p) => [p.settlementId, p]));
  for (const s of SETTLEMENTS) {
    const p = profiles.get(s.id);
    const population = p?.population ?? 0;
    const security = p?.security ?? 50;
    lines.push(
      `INSERT OR IGNORE INTO settlements (id, name, kind, kingdom_id, x, y, population, security, primary_output) VALUES (${q(s.id)}, ${q(s.name)}, ${q(s.kind)}, ${q(s.kingdomId)}, ${s.x}, ${s.y}, ${population}, ${security}, ${q(s.primaryOutput)});`,
    );
  }

  // Bagimsiz sehirler ve tarafsiz bolgeler de kendi kayitlarina sahiptir (belge 20).
  lines.push("");
  for (const c of FREE_CITIES) {
    const p = profiles.get(c.id);
    lines.push(
      `INSERT OR IGNORE INTO settlements (id, name, kind, kingdom_id, x, y, population, security, primary_output) VALUES (${q(c.id)}, ${q(c.name)}, 'city', NULL, ${c.x}, ${c.y}, ${p?.population ?? 0}, ${p?.security ?? 50}, ${q(p?.economy.primaryProduction ?? "Ticaret")});`,
    );
  }
  for (const z of NEUTRAL_ZONES) {
    const p = profiles.get(z.id);
    lines.push(
      `INSERT OR IGNORE INTO settlements (id, name, kind, kingdom_id, x, y, population, security, primary_output) VALUES (${q(z.id)}, ${q(z.name)}, 'town', NULL, ${z.x}, ${z.y}, ${p?.population ?? 0}, ${p?.security ?? 50}, ${q(p?.economy.primaryProduction ?? "Gecis ticareti")});`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

const target = join(process.cwd(), "db", "migrations", "0003_world_reference.sql");
writeFileSync(target, buildWorldSeedSql(), "utf8");
console.log(`Yazildi: ${target}`);

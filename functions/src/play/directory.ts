/**
 * Oyuncu rehberi (tasarim belgesi 16): takas teklifi, karsilikli kredi,
 * emanet, evlilik ve arkadaslik gibi hedefli islemler icin diger canli
 * karakterlerin kisa listesi.
 *
 * Gizlilik: yalnizca herkese acik alanlar doner (kimlik, ad, guncel yerlesim,
 * kuşak). E-posta/hesap bilgisi asla paylasilmaz.
 */

import type { SqlDatabase } from "../db/client";
import { queryAll } from "../db/client";

export interface PlayerSummary {
  characterId: string;
  givenName: string;
  surname: string;
  currentSettlement: string | null;
  ageYears: number;
  generation: number;
}

/** Canli karakterleri listeler; isteyen karakterin kendisi disarida birakilir. */
export async function playerDirectory(
  db: SqlDatabase,
  excludeCharacterId: string,
  limit = 50,
): Promise<PlayerSummary[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 50;
  const rows = await queryAll<{
    id: string;
    given_name: string;
    surname: string;
    current_settlement: string | null;
    age_years: number;
    generation: number;
  }>(
    db,
    "SELECT id, given_name, surname, current_settlement, age_years, generation FROM characters WHERE alive = 1 AND id != ? ORDER BY created_at DESC LIMIT ?",
    excludeCharacterId,
    safeLimit,
  );
  return rows.map((r) => ({
    characterId: r.id,
    givenName: r.given_name,
    surname: r.surname,
    currentSettlement: r.current_settlement,
    ageYears: r.age_years,
    generation: r.generation,
  }));
}

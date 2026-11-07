/**
 * Dunya gunlugu (tasarim belgesi 8.8, 12.5, 19.4).
 *
 * Dunya simulasyonu `world_event_log` tablosuna savas, kitlik, veba, haydut
 * baskini, isyan gibi olaylari yazar; ancak bu kayitlar HICBIR YERDE okunmaz.
 * Oyuncu icin dunya bu yuzden "cansiz" hisseder: olaylar olur ama gorunmez.
 *
 * Bu modul olay gunlugunu okunabilir bicime cevirir: yerlesim adi cozulur,
 * olay tipi ve agirlik Turkce etikete donusur, yeni olaylar onem sirasina
 * gore dizilir. Boylece istemci tek istekle dunyada olup biteni gosterir.
 */

import type { SqlDatabase } from "../db/client";
import { queryAll } from "../db/client";

export interface WorldEventRow {
  id: string;
  event_type: string;
  settlement_id: string | null;
  severity: number;
  payload_json: string;
  game_day: number;
}

export interface WorldEventDto {
  id: string;
  type: string;
  settlementId: string | null;
  settlementName: string | null;
  severity: number;
  gameDay: number;
  /** Oyuncuya gosterilecek Turkce baslik. */
  title: string;
  /** Olayin yonu: kotu (kriz) / iyi (baris) / notr. */
  tone: "bad" | "good" | "neutral";
}

/** Olay turu -> Turkce baslik (belge 12.5 olay listesi). */
const EVENT_TITLE: Record<string, { title: string; tone: WorldEventDto["tone"] }> = {
  war: { title: "Savaş çıktı", tone: "bad" },
  peace: { title: "Barış ilan edildi", tone: "good" },
  epidemic: { title: "Salgın görüldü", tone: "bad" },
  famine: { title: "Kıtlık baş gösterdi", tone: "bad" },
  trade_crisis: { title: "Ticaret yolu krizi", tone: "bad" },
  bandit_raid: { title: "Haydut baskını", tone: "bad" },
  rebellion: { title: "İsyan patlak verdi", tone: "bad" },
  assassination: { title: "Suikast işlendi", tone: "bad" },
  dynasty_crisis: { title: "Hanedan krizi", tone: "bad" },
  tournament: { title: "Turnuva düzenlendi", tone: "good" },
  natural_disaster: { title: "Doğal afet", tone: "bad" },
  crime: { title: "Suç işlendi", tone: "bad" },
};

function titleFor(type: string): { title: string; tone: WorldEventDto["tone"] } {
  return EVENT_TITLE[type] ?? { title: type, tone: "neutral" };
}

export async function readWorldEvents(
  db: SqlDatabase,
  options: { limit?: number; sinceGameDay?: number; settlementId?: string } = {},
): Promise<WorldEventDto[]> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 30));
  const params: unknown[] = [];
  const where: string[] = [];
  if (typeof options.sinceGameDay === "number") {
    where.push("game_day > ?");
    params.push(options.sinceGameDay);
  }
  if (options.settlementId) {
    where.push("settlement_id = ?");
    params.push(options.settlementId);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await queryAll<WorldEventRow>(
    db,
    `SELECT id, event_type, settlement_id, severity, payload_json, game_day
     FROM world_event_log ${clause}
     ORDER BY game_day DESC, created_at DESC LIMIT ?`,
    ...params,
    limit,
  );
  if (rows.length === 0) return [];

  const settlementIds = [...new Set(rows.map((r) => r.settlement_id).filter((x): x is string => x !== null))];
  const names = new Map<string, string>();
  if (settlementIds.length > 0) {
    const placeholders = settlementIds.map(() => "?").join(",");
    const found = await queryAll<{ id: string; name: string }>(
      db,
      `SELECT id, name FROM settlements WHERE id IN (${placeholders})`,
      ...settlementIds,
    );
    for (const s of found) names.set(s.id, s.name);
  }

  return rows.map((row) => {
    const meta = titleFor(row.event_type);
    return {
      id: row.id,
      type: row.event_type,
      settlementId: row.settlement_id,
      settlementName: row.settlement_id ? (names.get(row.settlement_id) ?? null) : null,
      severity: row.severity,
      gameDay: row.game_day,
      title: meta.title,
      tone: meta.tone,
    };
  });
}

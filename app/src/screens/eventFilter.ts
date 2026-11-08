/**
 * Dunya gunlugu suzgeci (belge 19).
 *
 * Neden ayri modul: arama + ton suzgeci kurallari saf ve test edilebilir
 * olsun; bilesen yalnizca cagirsin.
 */

import type { WorldEventDto } from "../api/client";

export type EventToneFilter = "all" | "bad" | "good" | "neutral";

export interface EventFilterInput {
  events: WorldEventDto[];
  query: string;
  tone: EventToneFilter;
}

export function filterEvents({ events, query, tone }: EventFilterInput): WorldEventDto[] {
  const needle = query.trim().toLocaleLowerCase("tr");
  return events.filter((e) => {
    if (tone !== "all" && e.tone !== tone) return false;
    if (!needle) return true;
    return (
      e.title.toLocaleLowerCase("tr").includes(needle) ||
      (e.settlementName ?? "").toLocaleLowerCase("tr").includes(needle)
    );
  });
}

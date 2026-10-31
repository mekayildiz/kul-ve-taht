/**
 * Tibbi tedavi (tasarim belgesi 6, 13.2, 20).
 *
 * Ayrintili tip sistemi: yaralanma turleri, kanama, enfeksiyon, hastalik ve
 * kalici sakatlik. Tedavi hazirligi ve kalitesi sonucu belirler; boylece
 * olum "sebepsiz/rastgele" olmaz (belge 6).
 */

import { itemDef, type InventoryEntry } from "../inventory/items";
import type { HealthState, Injury } from "./state";

export interface TreatmentPlan {
  injuryId: string;
  method: "bandage" | "herb" | "surgery" | "rest";
  /** Tedavi kalitesi 0-100 (hekim niteligi + malzeme). */
  quality: number;
}

export interface TreatmentResult {
  ok: boolean;
  error?: "missing_item" | "unknown_injury";
  state?: HealthState;
  entries?: InventoryEntry[];
  /** Iyilesen yara mi yoksa kalici sakatlik mi. */
  permanent?: boolean;
}

/**
 * Yara tedavisi. Sargi/ot gerektirir; kalite yuksekse enfeksiyon riski
 * dusuk, kanama hizli durur. Kalitesiz tedavi enfeksiyona yol acabilir.
 */
export function treatInjury(
  state: HealthState,
  entries: InventoryEntry[],
  plan: TreatmentPlan,
): TreatmentResult {
  const injury = state.injuries.find((i) => i.id === plan.injuryId);
  if (!injury) return { ok: false, error: "unknown_injury" };

  let nextEntries = entries.map((e) => ({ ...e }));
  const requiredItem = plan.method === "herb" ? "healing-herb" : plan.method === "bandage" ? "bandage" : null;

  if (requiredItem) {
    const have = nextEntries.filter((e) => e.itemId === requiredItem).reduce((s, e) => s + e.quantity, 0);
    if (have < 1) return { ok: false, error: "missing_item" };
    let remaining = 1;
    nextEntries = nextEntries
      .map((e) => {
        if (e.itemId !== requiredItem || remaining <= 0) return e;
        remaining -= 1;
        return { ...e, quantity: e.quantity - 1 };
      })
      .filter((e) => e.quantity > 0);
  }

  const def = requiredItem ? itemDef(requiredItem) : null;
  const baseHeal = def?.healing ?? 0;
  const healAmount = Math.round((baseHeal + plan.quality * 0.2) * 10) / 10;

  // Kaliteli tedavi enfeksiyonu dusurur; kalitesiz tedavi artirabilir.
  const infectionDelta = plan.quality >= 60 ? -10 : plan.quality >= 40 ? -3 : +5;
  const injuries: Injury[] = state.injuries.map((i) =>
    i.id === injury.id
      ? {
          ...i,
          severity: Math.max(0, Math.round((i.severity - healAmount) * 10) / 10),
          bleeding: Math.max(0, i.bleeding - (plan.quality >= 40 ? 15 : 5)),
          infection: Math.max(0, Math.min(100, i.infection + infectionDelta)),
          treated: true,
        }
      : i,
  );

  // Agir ve kalitesiz tedavi edilen kirik: kalici sakatlik riski.
  let permanent = false;
  let permanentConditions = state.permanentConditions;
  if (injury.kind === "fracture" && plan.quality < 40) {
    permanent = true;
    permanentConditions = [...permanentConditions, `kalıcı kırık izi (${injury.id})`];
  }

  return {
    ok: true,
    state: { ...state, injuries: injuries.filter((i) => i.severity > 0 || i.bleeding > 0), permanentConditions },
    entries: nextEntries,
    permanent,
  };
}

/** Hastalik tedavisi: ot veya dinlenme; kalite iyilesme hizini belirler. */
export function treatDisease(
  state: HealthState,
  entries: InventoryEntry[],
  diseaseId: string,
  quality: number,
): TreatmentResult {
  const disease = state.diseases.find((d) => d.id === diseaseId);
  if (!disease) return { ok: false, error: "unknown_injury" };

  let nextEntries = entries.map((e) => ({ ...e }));
  const have = nextEntries.filter((e) => e.itemId === "healing-herb").reduce((s, e) => s + e.quantity, 0);
  if (have >= 1) {
    let remaining = 1;
    nextEntries = nextEntries
      .map((e) => {
        if (e.itemId !== "healing-herb" || remaining <= 0) return e;
        remaining -= 1;
        return { ...e, quantity: e.quantity - 1 };
      })
      .filter((e) => e.quantity > 0);
  }

  const reduction = 10 + Math.round(quality * 0.3) + (have >= 1 ? 15 : 0);
  const diseases = state.diseases.map((d) =>
    d.id === diseaseId ? { ...d, severity: Math.max(0, d.severity - reduction), treated: true } : d,
  );
  return { ok: true, state: { ...state, diseases: diseases.filter((d) => d.severity > 0) }, entries: nextEntries };
}

/** Hekim/npc niteligine gore tedavi kalitesi. */
export function treatmentQuality(healerSkill: number, supplies: boolean, cleanEnvironment: boolean): number {
  let quality = healerSkill;
  if (supplies) quality += 15;
  if (cleanEnvironment) quality += 10;
  return Math.max(0, Math.min(100, quality));
}

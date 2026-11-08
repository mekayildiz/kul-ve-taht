/**
 * Aksiyon sonucu bicimlendirici (tasarim belgesi 19, "yasanan dunya").
 *
 * Neden: sunucu her aksiyonda yeni tam durumu (`state`) ve ek ayrinti
 * (`detail`) donduruyor; istemci bunlari atip sabit bir mesaj gosteriyordu.
 * Oyuncu "tiklama" hissinden kurtulmaz cunku hicbir geri bildirim yok.
 *
 * Cozum: aksiyon ONCESI durum ile SONRASI durum karsilastirilir; altin,
 * saglik, aclik, bitkinlik, itibar, ustalik, enerji gibi alanlarin FARKI
 * gosterilir. Boylece 85 aksiyonun tamami icin ayri kod yazmadan gercek
 * sayisal geri bildirim uretilir. Ayrica bilinen `detail` alanlari (gelir,
 * ganimet, hasar, yara, zafer) anlatisal satirlara cevrilir.
 */

import type { Dictionary } from "../i18n";
import type { PlayStateDto } from "../api/client";

export type OutcomeTone = "gain" | "loss" | "neutral" | "crit" | "bad";

export interface OutcomeLine {
  label: string;
  value: string;
  tone: OutcomeTone;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function toneFor(n: number): OutcomeTone {
  if (n > 0) return "gain";
  if (n < 0) return "loss";
  return "neutral";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function itemList(value: unknown): string | null {
  const entries = asArray(value);
  if (entries.length === 0) return null;
  return entries
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const rec = e as Record<string, unknown>;
      const id = typeof rec.itemId === "string" ? rec.itemId : typeof rec.id === "string" ? rec.id : null;
      const qty = asNumber(rec.quantity) ?? asNumber(rec.count) ?? 1;
      return id ? `${id} ×${qty}` : null;
    })
    .filter((x): x is string => x !== null)
    .join(", ");
}

/**
 * Onceki ve sonraki durumu karsilastirip gosterilecek satirlari uretir.
 * Yalnizca DEGISEN alanlar gosterilir; boylece gurultu olmaz.
 */
export function describeOutcome(
  t: Dictionary,
  before: PlayStateDto,
  after: PlayStateDto,
  detail: Record<string, unknown> | undefined,
): OutcomeLine[] {
  const o = t.play.outcome;
  const lines: OutcomeLine[] = [];

  const goldDelta = after.gold - before.gold;
  if (goldDelta !== 0) {
    lines.push({
      label: goldDelta > 0 ? o.goldGain : o.goldLoss,
      value: signed(goldDelta),
      tone: toneFor(goldDelta),
    });
  }

  const healthDelta = after.health.health - before.health.health;
  if (healthDelta !== 0) {
    lines.push({ label: o.health, value: signed(healthDelta), tone: healthDelta > 0 ? "gain" : "bad" });
  }

  const hungerDelta = after.health.hunger - before.health.hunger;
  if (hungerDelta !== 0) {
    lines.push({ label: o.hunger, value: signed(hungerDelta), tone: hungerDelta > 0 ? "bad" : "gain" });
  }

  const fatigueDelta = after.health.fatigue - before.health.fatigue;
  if (fatigueDelta !== 0) {
    lines.push({ label: o.fatigue, value: signed(fatigueDelta), tone: fatigueDelta > 0 ? "bad" : "gain" });
  }

  const repDelta = after.reputation - before.reputation;
  if (repDelta !== 0) {
    lines.push({ label: o.reputation, value: signed(repDelta), tone: toneFor(repDelta) });
  }

  const masteryDelta = after.weaponMastery - before.weaponMastery;
  if (masteryDelta !== 0) {
    lines.push({ label: o.mastery, value: signed(masteryDelta), tone: toneFor(masteryDelta) });
  }

  const magicDelta = after.magicLevel - before.magicLevel;
  if (magicDelta !== 0) {
    lines.push({ label: o.magic, value: signed(magicDelta), tone: toneFor(magicDelta) });
  }

  const energyDelta = after.energy - before.energy;
  if (energyDelta !== 0) {
    lines.push({ label: o.energy, value: signed(energyDelta), tone: energyDelta > 0 ? "gain" : "bad" });
  }

  // Yara/olum: durum degisiminden okunur (detail'e bagimli degil).
  const wasAlive = before.health.alive;
  if (wasAlive && !after.health.alive) {
    lines.push({ label: t.play.deadBanner, value: "", tone: "bad" });
  }
  const newInjuries = after.health.injuries.length - before.health.injuries.length;
  if (newInjuries > 0) {
    lines.push({ label: o.injury, value: `${newInjuries}`, tone: "bad" });
  }

  if (detail) {
    // Gelir / uretim / hasat gibi sayisal alanlar.
    const income = asNumber(detail.income);
    if (income !== null) lines.push({ label: o.income, value: signed(income), tone: toneFor(income) });

    const produced = asNumber(detail.produced);
    if (produced !== null) lines.push({ label: o.produced, value: `${produced}`, tone: toneFor(produced) });

    const yieldAmount = asNumber(detail.yield);
    if (yieldAmount !== null) lines.push({ label: o.produced, value: `${yieldAmount}`, tone: "gain" });

    // Ganimet (av, kesif, savas).
    const loot = itemList(detail.loot) ?? itemList(detail.items);
    if (loot) lines.push({ label: o.loot, value: loot, tone: "gain" });

    // Yara (av, kesif, savas).
    if (typeof detail.injury === "string" && detail.injury) {
      lines.push({ label: o.injury, value: detail.injury, tone: "bad" });
    }

    // Savas sonucu.
    const winner = typeof detail.winner === "string" ? detail.winner : null;
    if (winner) {
      lines.push({ label: winner === "attacker" ? o.victory : o.defeat, value: "", tone: winner === "attacker" ? "crit" : "bad" });
    }
    const rounds = asNumber(detail.rounds);
    if (rounds !== null) lines.push({ label: o.rounds, value: `${rounds}`, tone: "neutral" });

    const crit = detail.critical === true || detail.crit === true;
    if (crit) lines.push({ label: o.crit, value: "", tone: "crit" });

    const goldGain = asNumber(detail.gold);
    if (goldGain !== null && income === null && goldDelta === 0) {
      lines.push({ label: o.goldGain, value: signed(goldGain), tone: toneFor(goldGain) });
    }
  }

  return lines;
}

/** Satirlari tek satirlik ozet metne cevirir (toast icin). */
export function outcomeSummary(t: Dictionary, lines: OutcomeLine[]): string {
  if (lines.length === 0) return "";
  const parts = lines
    .map((l) => (l.value ? `${l.label} ${l.value}` : l.label))
    .filter((s) => s.length > 0);
  return parts.join(" · ");
}

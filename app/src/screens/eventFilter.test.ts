/**
 * Dunya gunlugu suzgeci testleri (belge 19).
 */

import { describe, expect, it } from "vitest";
import { filterEvents } from "./eventFilter";
import type { WorldEventDto } from "../api/client";

const event = (over: Partial<WorldEventDto>): WorldEventDto => ({
  id: over.id ?? "e1",
  type: "event",
  settlementId: null,
  settlementName: null,
  severity: 1,
  gameDay: 1,
  title: "olay",
  tone: "neutral",
  ...over,
});

const events: WorldEventDto[] = [
  event({ id: "e1", title: "Kuraklık vurdu", tone: "bad", settlementName: "Varkhenn" }),
  event({ id: "e2", title: "Festival başladı", tone: "good", settlementName: "Aurelith" }),
  event({ id: "e3", title: "Sessiz gün", tone: "neutral", settlementName: "Solmerya" }),
];

describe("filterEvents", () => {
  it("suzgecsiz tumunu dondurur", () => {
    expect(filterEvents({ events, query: "", tone: "all" })).toHaveLength(3);
  });

  it("basligi buyuk/kucuk harf duyarsiz arar", () => {
    const found = filterEvents({ events, query: "FESTİVAL", tone: "all" });
    expect(found.map((e) => e.id)).toEqual(["e2"]);
  });

  it("yerlesim adinda da arar", () => {
    const found = filterEvents({ events, query: "solmerya", tone: "all" });
    expect(found.map((e) => e.id)).toEqual(["e3"]);
  });

  it("ton suzgeci tek basina calisir", () => {
    const found = filterEvents({ events, query: "", tone: "bad" });
    expect(found.map((e) => e.id)).toEqual(["e1"]);
  });

  it("metin ve ton birlikte uygulanir", () => {
    expect(filterEvents({ events, query: "a", tone: "bad" }).map((e) => e.id)).toEqual(["e1"]);
    expect(filterEvents({ events, query: "a", tone: "good" }).map((e) => e.id)).toEqual(["e2"]);
  });

  it("eslesme yoksa bos liste doner", () => {
    expect(filterEvents({ events, query: "zzz", tone: "all" })).toEqual([]);
  });

  it("bosluk kirpilir", () => {
    expect(filterEvents({ events, query: "   ", tone: "all" })).toHaveLength(3);
  });
});

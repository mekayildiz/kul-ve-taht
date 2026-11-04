import { describe, expect, it } from "vitest";
import {
  advanceWorldTime,
  seasonFor,
  GAME_DAYS_PER_GAME_YEAR,
  REAL_HOURS_PER_GAME_DAY,
} from "./world-clock";

const HOUR = 60 * 60 * 1000;

describe("dunya zamani", () => {
  it("baslatilmamis saati simdiye ayarlar ve ilerletmez", () => {
    const result = advanceWorldTime({ gameDay: 1, gameYear: 1, lastTickRealMs: 0 }, 1_700_000_000_000);
    expect(result.advancedDays).toBe(0);
    expect(result.gameDay).toBe(1);
    expect(result.lastTickRealMs).toBe(1_700_000_000_000);
  });

  it("6 gercek saatten az surede ilerlemez", () => {
    const result = advanceWorldTime({ gameDay: 1, gameYear: 1, lastTickRealMs: 1_000_000 }, 1_000_000 + 5 * HOUR);
    expect(result.advancedDays).toBe(0);
    expect(result.gameDay).toBe(1);
  });

  it("6 gercek saatte 1 oyun gunu ilerler", () => {
    const result = advanceWorldTime({ gameDay: 1, gameYear: 1, lastTickRealMs: 1_000_000 }, 1_000_000 + 6 * HOUR);
    expect(result.advancedDays).toBe(1);
    expect(result.gameDay).toBe(2);
  });

  it("uzun aradan sonra cok gunu tek seferde hesaplar", () => {
    const result = advanceWorldTime({ gameDay: 1, gameYear: 1, lastTickRealMs: 1_000_000 }, 1_000_000 + 6 * HOUR * 10);
    expect(result.advancedDays).toBe(10);
    expect(result.gameDay).toBe(11);
  });

  it("yil devrini dogru isler", () => {
    const result = advanceWorldTime(
      { gameDay: GAME_DAYS_PER_GAME_YEAR, gameYear: 1, lastTickRealMs: 1_000_000 },
      1_000_000 + REAL_HOURS_PER_GAME_DAY * HOUR,
    );
    expect(result.gameYear).toBe(2);
    expect(result.gameDay).toBe(1);
  });

  it("mevsimleri hesaplar", () => {
    expect(seasonFor(1)).toBe("spring");
    expect(seasonFor(100)).toBe("summer");
    expect(seasonFor(200)).toBe("autumn");
    expect(seasonFor(300)).toBe("winter");
  });
});

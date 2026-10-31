/**
 * Dunya zamani servisi (tasarim belgesi bolum 6).
 *
 * 1 oyun gunu = 6 gercek saat; 1 oyun yili = 360 oyun gunu (90 gercek gun).
 * Olay tabanlidir: her istekte gercek zaman farkina gore ilerletilir; ayri
 * bir "tik" dongusune gerek yoktur (Free plan cron sinirlari icin uygun).
 */

export const REAL_HOURS_PER_GAME_DAY = 6;
export const GAME_DAYS_PER_GAME_YEAR = 360;

export interface WorldTimeState {
  gameDay: number;
  gameYear: number;
  lastTickRealMs: number;
}

export interface WorldTimeResult extends WorldTimeState {
  /** Bu ilerlemede gecen oyun gunu sayisi. */
  advancedDays: number;
}

export function advanceWorldTime(state: WorldTimeState, nowRealMs: number): WorldTimeResult {
  // lastTickRealMs <= 0: saat hic baslatilmamis demektir (epoch/0 degeri).
  // Bu durumda ilerletme YAPILMAZ; referans noktasi simdiye ayarlanir.
  if (state.lastTickRealMs <= 0) {
    return {
      gameDay: state.gameDay,
      gameYear: state.gameYear,
      lastTickRealMs: nowRealMs,
      advancedDays: 0,
    };
  }

  const msPerGameDay = REAL_HOURS_PER_GAME_DAY * 60 * 60 * 1000;
  const elapsed = nowRealMs - state.lastTickRealMs;

  if (elapsed < msPerGameDay) {
    return { ...state, advancedDays: 0 };
  }

  const advancedDays = Math.floor(elapsed / msPerGameDay);
  let gameDay = state.gameDay + advancedDays;
  let gameYear = state.gameYear;

  while (gameDay > GAME_DAYS_PER_GAME_YEAR) {
    gameDay -= GAME_DAYS_PER_GAME_YEAR;
    gameYear += 1;
  }

  return {
    gameDay,
    gameYear,
    lastTickRealMs: state.lastTickRealMs + advancedDays * msPerGameDay,
    advancedDays,
  };
}

export function seasonFor(gameDay: number): "spring" | "summer" | "autumn" | "winter" {
  const perSeason = GAME_DAYS_PER_GAME_YEAR / 4;
  if (gameDay <= perSeason) return "spring";
  if (gameDay <= perSeason * 2) return "summer";
  if (gameDay <= perSeason * 3) return "autumn";
  return "winter";
}

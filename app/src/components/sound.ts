/**
 * Ses efektleri (tasarim belgesi 19, "yasanan dunya").
 *
 * Neden: her aksiyon sessizdi; "tiklama" hissini kirmanin bir yolu da kulag
 * hitap etmektir. Ancak harici ses dosyasi indirmek hem kota hem telif
 * yuku getirir. Cozum: Web Audio osilatoru ile yerinde uretilen kisa tonlar.
 * Sifir dosya, sifir ag istegi, 0 TL.
 *
 * Tarayici politikasi geregi ses ancak kullanici etkilesiminden SONRA
 * calisabilir; bu yuzden baglam tembel (lazy) kurulur ve hata durumunda
 * sessizce devre disi kalir.
 */

export type SoundName = "success" | "gain" | "loss" | "error" | "levelup";

const STORAGE_KEY = "kvt.sound";

/** Ton tanimlari: frekans (Hz), sure (ms), dalga tipi. */
const TONES: Record<SoundName, { freq: number; ms: number; type: OscillatorType }[]> = {
  // Kisa, parlak iki nota: islem basarili.
  success: [
    { freq: 660, ms: 90, type: "sine" },
    { freq: 880, ms: 120, type: "sine" },
  ],
  // Yukari dogru uc nota: kazanc.
  gain: [
    { freq: 587, ms: 80, type: "triangle" },
    { freq: 740, ms: 80, type: "triangle" },
    { freq: 880, ms: 130, type: "triangle" },
  ],
  // Asagi dogru iki nota: kayip.
  loss: [
    { freq: 440, ms: 110, type: "sine" },
    { freq: 294, ms: 160, type: "sine" },
  ],
  // Kisa, tok bir vurus: hata.
  error: [{ freq: 180, ms: 200, type: "square" }],
  // Dort notali tirmanis: seviye atlama.
  levelup: [
    { freq: 523, ms: 90, type: "triangle" },
    { freq: 659, ms: 90, type: "triangle" },
    { freq: 784, ms: 90, type: "triangle" },
    { freq: 1046, ms: 180, type: "triangle" },
  ],
};

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = typeof window !== "undefined" ? window.AudioContext : undefined;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Depolama kapaliysa tercih kalici olmaz; oyun yine calisir.
  }
}

/** Tek bir tonu calar. `at` baglam zaman cinsindendir (saniye). */
function playTone(context: AudioContext, freq: number, ms: number, type: OscillatorType, at: number): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Ani baslamayip kisaca yumusat: tik sesini onler.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.08, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(gain).connect(context.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.02);
}

/**
 * Sesi calar. Hata durumunda sessizce gecer: ses asla oyunu bozmamali.
 * @returns calinip calinmadigi
 */
export function playSound(name: SoundName): boolean {
  if (!soundEnabled()) return false;
  const context = audioContext();
  if (!context) return false;
  try {
    // Bazi tarayicilar baglami "suspended" baslatir; ilk etkilesimde acilir.
    if (context.state === "suspended") void context.resume();
    let at = context.currentTime;
    for (const tone of TONES[name]) {
      playTone(context, tone.freq, tone.ms, tone.type, at);
      at += tone.ms / 1000;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sonuc satirlarinin tonlarindan hangi sesin calinacagini secer.
 * Kayip/zafer gibi kritik satirlar kazanci bastirir.
 */
export function soundForOutcome(tones: string[]): SoundName {
  if (tones.includes("bad")) return "loss";
  if (tones.includes("loss")) return "loss";
  if (tones.includes("crit") || tones.includes("gain")) return "gain";
  return "success";
}

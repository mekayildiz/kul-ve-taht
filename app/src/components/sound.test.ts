/**
 * Ses modulu testleri (belge 19).
 *
 * Not: gercek ses calinmaz. Testler tercih kaliciligi, secim mantigi ve
 * "ses kapaliyken hicbir sey denenmez" davranisini dogrular.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSoundEnabled, soundEnabled, soundForOutcome } from "./sound";

describe("tercih kaliciligi", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("varsayilan olarak aciktir", () => {
    expect(soundEnabled()).toBe(true);
  });

  it("kapatinca hatirlanir", () => {
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
    expect(localStorage.getItem("kvt.sound")).toBe("off");
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
  });

  it("depolama hata verse bile cokmez", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("kapali");
    });
    expect(soundEnabled()).toBe(true);
    spy.mockRestore();
  });
});

describe("soundForOutcome", () => {
  it("kayip satiri varsa kayip sesi secer", () => {
    expect(soundForOutcome(["gain", "bad"])).toBe("loss");
  });

  it("kritik/kazanc varsa kazanc sesi secer", () => {
    expect(soundForOutcome(["gain"])).toBe("gain");
    expect(soundForOutcome(["crit"])).toBe("gain");
  });

  it("notr sonucta basari sesi secer", () => {
    expect(soundForOutcome(["neutral"])).toBe("success");
    expect(soundForOutcome([])).toBe("success");
  });
});

describe("playSound", () => {
  beforeEach(() => {
    localStorage.clear();
    // Modul baglami onbellekler; her test taze modul alsin.
    vi.resetModules();
  });

  it("ses kapaliyken baglam kurmaz ve calinmaz", async () => {
    const { playSound: play, setSoundEnabled: setEnabled } = await import("./sound");
    setEnabled(false);
    const ctor = vi.fn();
    (window as unknown as { AudioContext: unknown }).AudioContext = ctor;
    expect(play("success")).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("ses acikken baglam kurup ton calar", async () => {
    const { playSound: play, setSoundEnabled: setEnabled } = await import("./sound");
    setEnabled(true);
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn(() => ({ connect: vi.fn() }));
    class FakeCtx {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator() {
        return { type: "", frequency: { value: 0 }, connect, start, stop };
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect,
        };
      }
      resume() {}
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
    expect(play("gain")).toBe(true);
    expect(start).toHaveBeenCalledTimes(3); // gain: uc nota
    expect(stop).toHaveBeenCalledTimes(3);
  });

  it("baglam kurulamazsa sessizce false doner", async () => {
    const { playSound: play, setSoundEnabled: setEnabled } = await import("./sound");
    setEnabled(true);
    (window as unknown as { AudioContext: unknown }).AudioContext = function () {
      throw new Error("desteklenmiyor");
    };
    expect(play("error")).toBe(false);
  });

  it("baglam yoksa (eski tarayici) sessizce false doner", async () => {
    const { playSound: play, setSoundEnabled: setEnabled } = await import("./sound");
    setEnabled(true);
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(play("success")).toBe(false);
  });
});

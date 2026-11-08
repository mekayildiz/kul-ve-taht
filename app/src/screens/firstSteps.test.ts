/**
 * Ilk adimlar rehberi testleri (belge 19).
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEVELOP_THRESHOLD,
  STEP_ORDER,
  firstSteps,
  firstStepsComplete,
  loadStepProgress,
  saveStepProgress,
  stepSignalForAction,
} from "./firstSteps";

const empty = {
  hasActed: false,
  hasEarnedGold: false,
  hasTravelled: false,
  hasExplored: false,
  hasQuest: false,
  progressionPoints: 0,
};

describe("firstSteps", () => {
  it("yeni karakterde sirasiyla ilerler", () => {
    const steps = firstSteps({ ...empty, hasActed: true });
    expect(steps.map((s) => s.id)).toEqual(STEP_ORDER);
    expect(steps.find((s) => s.id === "firstAction")?.done).toBe(true);
    expect(steps.find((s) => s.id === "work")?.current).toBe(true);
  });

  it("tek bir 'su an' adimi isaretler", () => {
    const steps = firstSteps({ ...empty, hasActed: true, hasEarnedGold: true, hasTravelled: true });
    expect(steps.filter((s) => s.current).length).toBe(1);
    expect(steps.find((s) => s.current)?.id).toBe("explore");
  });

  it("tum kosullar saglaninca rehber tamamlanir", () => {
    const steps = firstSteps({
      hasActed: true,
      hasEarnedGold: true,
      hasTravelled: true,
      hasExplored: true,
      hasQuest: true,
      progressionPoints: DEVELOP_THRESHOLD,
    });
    expect(firstStepsComplete(steps)).toBe(true);
    expect(steps.some((s) => s.current)).toBe(false);
  });

  it("gelisim adimi esik altinda tamamlanmaz", () => {
    const steps = firstSteps({
      ...empty,
      hasActed: true,
      hasEarnedGold: true,
      hasTravelled: true,
      hasExplored: true,
      hasQuest: true,
      progressionPoints: DEVELOP_THRESHOLD - 1,
    });
    expect(firstStepsComplete(steps)).toBe(false);
    expect(steps.find((s) => s.id === "develop")?.current).toBe(true);
  });
});

describe("ilerleme kaliciligi", () => {
  beforeEach(() => localStorage.clear());

  it("kaydedip geri okur", () => {
    saveStepProgress("ch-1", { acted: true, explored: false });
    expect(loadStepProgress("ch-1")).toEqual({ acted: true, explored: false });
  });

  it("karakterler arasinda karismaz", () => {
    saveStepProgress("ch-1", { acted: true, explored: true });
    expect(loadStepProgress("ch-2")).toEqual({ acted: false, explored: false });
  });

  it("bozuk veride guvenli varsayilana doner", () => {
    localStorage.setItem("kvt.steps.ch-1", "{bozuk");
    expect(loadStepProgress("ch-1")).toEqual({ acted: false, explored: false });
  });

  it("kesif/av aksiyonunu isaretler", () => {
    expect(stepSignalForAction("explore")).toBe("explored");
    expect(stepSignalForAction("hunt")).toBe("explored");
    expect(stepSignalForAction("work")).toBeNull();
  });
});

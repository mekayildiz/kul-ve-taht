import { describe, expect, it } from "vitest";
import { actionErrorText } from "./actionError";
import { ApiRequestError } from "../api/client";
import { getDictionary } from "../i18n";

const t = getDictionary();

describe("actionErrorText", () => {
  it("reason kodunu Turkce aciklamaya cevirir", () => {
    const err = new ApiRequestError(400, "invalid_action", "Aksiyon tamamlanamadi.", "no_feed");
    expect(actionErrorText(err, t).message).toBe(t.play.reasons.no_feed);
    expect(actionErrorText(err, t).unknownReason).toBeUndefined();
  });

  it("bilinmeyen reason icin genel mesaj + kodu gosterir", () => {
    const err = new ApiRequestError(400, "invalid_action", "x", "gelecek_yeni_kod");
    const text = actionErrorText(err, t);
    expect(text.message).toBe(t.play.errorInvalid);
    expect(text.unknownReason).toBe("gelecek_yeni_kod");
  });

  it("reason yoksa kodu mesaja cevirir", () => {
    const err = new ApiRequestError(400, "not_enough_gold", "x");
    expect(actionErrorText(err, t).message).toBe(t.play.errorNoGold);
  });

  it("bilinmeyen kod icin kodu teshis olarak dondurur", () => {
    const err = new ApiRequestError(400, "weird_code", "x");
    const text = actionErrorText(err, t);
    expect(text.message).toBe(t.auth.errorGeneric);
    expect(text.unknownReason).toBe("weird_code");
  });

  it("ApiRequestError olmayan hatada genel mesaj", () => {
    expect(actionErrorText(new Error("boom"), t).message).toBe(t.auth.errorGeneric);
  });
});

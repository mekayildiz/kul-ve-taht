import { tr } from "./tr";
import { en } from "./en";

export type Locale = "tr" | "en";

export const dictionaries = { tr, en };
export type Dictionary = typeof tr;

export const DEFAULT_LOCALE: Locale = "tr";

export function getDictionary(locale: Locale): Dictionary {
  return locale === "en" ? en : tr;
}

export { tr, en };

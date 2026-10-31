import { tr } from "./tr";
import { en } from "./en";

export type Locale = "tr" | "en";

export const dictionaries = { tr, en } as const;
export type Dictionary = typeof tr;

export const DEFAULT_LOCALE: Locale = "tr";

export function getDictionary(locale: Locale): Dictionary {
  // en ve tr ayni anahtar kumesine sahiptir; tip guvenligi icin tr taban alinir.
  return (locale === "en" ? (en as unknown as Dictionary) : tr);
}

export { tr, en };

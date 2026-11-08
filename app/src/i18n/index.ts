import { tr } from "./tr";

export type Dictionary = typeof tr;

/** Arayuz dili yalnizca Turkce'dir; tek sozluk yeterlidir. */
export const DEFAULT_LOCALE = "tr" as const;

export function getDictionary(): Dictionary {
  return tr;
}

export { tr };


#!/usr/bin/env node
/**
 * Statik gorsel varliklari web uygulamasinin public dizinine kopyalar (belge 17.4).
 *
 * Tek kaynak: `assets/` (surum kontrolunde tutulur). Kopya `app/public/assets`
 * .gitignore'dadir; boylece ikili dosyalar depoda iki kez saklanmaz. Bu adim
 * hem yerel `npm run build` hem de Cloudflare Pages derlemesinde calisir.
 *
 * Kullanim: node scripts/sync-assets.mjs
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "assets");
const DEST = join(ROOT, "app", "public", "assets");

if (!existsSync(SRC)) {
  console.error("HATA: assets/ bulunamadi. Once `npm run gen:assets` calistirin.");
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
for (const sub of ["portraits", "icons", "crests", "maps"]) {
  const from = join(SRC, sub);
  if (existsSync(from)) cpSync(from, join(DEST, sub), { recursive: true });
}
console.log("Varliklar kopyalandi: assets/ -> app/public/assets/");

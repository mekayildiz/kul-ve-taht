#!/usr/bin/env node
/**
 * Uretim dagitimi (0 TL). Idempotent: birden cok kez calistirilabilir.
 *
 * Adimlar:
 *   1) Yetki kontrolu (wrangler whoami) - yoksa acikca uyarir ve durur.
 *   2) Arayuz derlemesi (app/dist).
 *   3) D1 veritabani olusturma (varsa atlanir) + database_id'yi wrangler.toml'a yazma.
 *   4) SESSION_SECRET: yoksa rastgele uretip `secret put` ile ekler (varsa atlanir).
 *   5) Migration'lari uzak D1'e uygulama.
 *   6) Worker'i (arayuz + API) dagitma.
 *   7) Canli adres ve saglik kontrolu.
 *
 * Yedekleme R2 gerektirmez: D1 Time Travel (ucretsiz, 30 gun) kullanilir.
 * Gorsel varliklar Worker [assets] statik sistemiyle sunulur.
 *
 * Kullanim:
 *   npx wrangler login                # (veya CLOUDFLARE_API_TOKEN + ACCOUNT_ID)
 *   node scripts/deploy-production.mjs
 *
 * Hicbir adim ucretli plan/kredi gerektirmez. Ucretli plana gecis tetikleyen
 * ayar uretilmez.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_TOML = join(ROOT, "functions", "wrangler.toml");
const DB_NAME = "kul-ve-taht-db";

function run(args, { allowFail = false, input } = {}) {
  try {
    const out = execFileSync("npx", ["wrangler", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      ...(input ? { input } : {}),
    });
    return { ok: true, out: out ?? "" };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (allowFail) return { ok: false, out };
    throw new Error(`wrangler ${args.join(" ")} basarisiz:\n${out}`);
  }
}

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

step("1/7 Yetki kontrolu");
const who = run(["whoami"], { allowFail: true });
if (!who.ok || /not authenticated|You are not authenticated/i.test(who.out)) {
  console.error(
    [
      "Cloudflare yetkilendirmesi YOK.",
      "",
      "Su iki yoldan birini secin (ikisi de UCRETSIZ):",
      "  A) npx wrangler login                       # tarayicida hesap onayi",
      "  B) CLOUDFLARE_API_TOKEN ve CLOUDFLARE_ACCOUNT_ID ortam degiskenlerini",
      "     tanimlayin (D1/Workers duzenleme + hesap okuma yetkili token).",
      "",
      "Yetkilendirdikten sonra: node scripts/deploy-production.mjs",
    ].join("\n"),
  );
  process.exit(2);
}
console.log(who.out.trim().split("\n").slice(-4).join("\n"));

step("2/7 Arayuz derlemesi (app/dist)");
execFileSync("npm", ["run", "build", "-w", "@kvt/app"], { cwd: ROOT, stdio: "inherit" });

step("3/7 D1 veritabani");
let createOut = run(["d1", "create", DB_NAME, "--config", "functions/wrangler.toml"], { allowFail: true });
if (!createOut.ok && /already exists|already has a database/i.test(createOut.out)) {
  console.log(`D1 '${DB_NAME}' zaten var; mevcut kimlik kullanilacak.`);
  createOut = run(["d1", "list", "--json", "--config", "functions/wrangler.toml"], { allowFail: true });
} else if (createOut.ok) {
  console.log(`D1 '${DB_NAME}' olusturuldu.`);
} else {
  throw new Error(`D1 olusturma/listeleme basarisiz:\n${createOut.out}`);
}

// database_id'yi ciktidan cikar (create cikti JSON ya da metin olabilir).
let databaseId = null;
try {
  const parsed = JSON.parse(createOut.out);
  const list = Array.isArray(parsed) ? parsed : parsed.result ?? [];
  databaseId = list.find((d) => d.name === DB_NAME)?.uuid ?? null;
} catch {
  databaseId = createOut.out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
}
if (!databaseId) throw new Error("D1 database_id okunamadi.");

const toml = readFileSync(WRANGLER_TOML, "utf8");
const updated = toml.replace(
  /(\[\[d1_databases\]\][\s\S]*?database_id\s*=\s*)"[^"]*"/,
  `$1"${databaseId}"`,
);
if (updated === toml) {
  console.log("wrangler.toml database_id zaten guncel.");
} else {
  writeFileSync(WRANGLER_TOML, updated);
  console.log(`wrangler.toml database_id = ${databaseId} olarak yazildi.`);
}

step("4/7 SESSION_SECRET");
const secrets = run(["secret", "list", "--config", "functions/wrangler.toml"], { allowFail: true });
if (/SESSION_SECRET/.test(secrets.out)) {
  console.log("SESSION_SECRET zaten tanimli; korunuyor.");
} else {
  const secret = randomBytes(48).toString("base64url");
  const put = run(["secret", "put", "SESSION_SECRET", "--config", "functions/wrangler.toml"], {
    allowFail: true,
    input: `${secret}\n`,
  });
  if (!put.ok) throw new Error(`SESSION_SECRET yazilamadi:\n${put.out}`);
  console.log("SESSION_SECRET rastgele uretildi ve yazildi.");
}

step("5/7 Migration'lar (uzak D1)");
execFileSync(
  "npx",
  ["wrangler", "d1", "migrations", "apply", DB_NAME, "--remote", "--config", "functions/wrangler.toml"],
  { cwd: ROOT, stdio: "inherit" },
);

step("6/7 Dagitim (Workers + D1 + DO + assets)");
const deploy = run(["deploy", "--config", "functions/wrangler.toml"]);
const url = deploy.out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i)?.[0] ?? null;
console.log(deploy.out.trim().split("\n").slice(-6).join("\n"));

step("7/7 Canli saglik kontrolu");
if (url) {
  console.log(`Oyun adresi: ${url}`);
  try {
    const res = await fetch(`${url}/api/health`);
    console.log(`GET ${url}/api/health -> ${res.status}`);
  } catch (err) {
    console.log(`Saglik kontrolu yapilamadi (ag): ${err.message}`);
  }
  console.log(
    [
      "",
      "Yayin tamam. Dunya tohumlama (idempotent) icin yonetici oturumu ile:",
      `  curl -X POST ${url}/api/admin/seed-world -H "authorization: Bearer <ADMIN_TOKEN>"`,
      "veya ilk yonetici hesabini olusturup panelden calistirin.",
      "",
      "Yedekleme (ucretsiz): D1 Time Travel 30 gunluk geri donus noktasi tutar.",
      "  npx wrangler d1 time-travel info kul-ve-taht-db --config functions/wrangler.toml",
      "  npx wrangler d1 time-travel restore kul-ve-taht-db --bookmark=<BOOKMARK> --config functions/wrangler.toml",
    ].join("\n"),
  );
} else {
  console.log("Dagitim ciktisindan adres okunamadi; 'wrangler deployments list' ile kontrol edin.");
}

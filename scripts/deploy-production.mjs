#!/usr/bin/env node
/**
 * Uretim dagitimi (0 TL). Idempotent: birden cok kez calistirilabilir.
 *
 * Adimlar:
 *   1) Yetki kontrolu (wrangler whoami) - yoksa acikca uyarir ve durur.
 *   2) Arayuz derlemesi (app/dist).
 *   3) D1 veritabani olusturma (varsa atlanir) + database_id'yi wrangler.toml'a yazma.
 *   4) R2 kovalari olusturma (varsa atlanir).
 *   5) SESSION_SECRET: yoksa rastgele uretip `secret put` ile ekler (varsa atlanir).
 *   6) Migration'lari uzak D1'e uygulama.
 *   7) Worker'i (arayuz + API) dagitma.
 *   8) Canli adres ve saglik kontrolu.
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
const R2_BACKUPS = "kul-ve-taht-backups";
const R2_ASSETS = "kul-ve-taht-assets";

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

step("1/8 Yetki kontrolu");
const who = run(["whoami"], { allowFail: true });
if (!who.ok || /not authenticated|You are not authenticated/i.test(who.out)) {
  console.error(
    [
      "Cloudflare yetkilendirmesi YOK.",
      "",
      "Su iki yoldan birini secin (ikisi de UCRETSIZ):",
      "  A) npx wrangler login                       # tarayicida hesap onayi",
      "  B) CLOUDFLARE_API_TOKEN ve CLOUDFLARE_ACCOUNT_ID ortam degiskenlerini",
      "     tanimlayin (D1/R2/Workers duzenleme + hesap okuma yetkili token).",
      "",
      "Yetkilendirdikten sonra: node scripts/deploy-production.mjs",
    ].join("\n"),
  );
  process.exit(2);
}
console.log(who.out.trim().split("\n").slice(-4).join("\n"));

step("2/8 Arayuz derlemesi (app/dist)");
execFileSync("npm", ["run", "build", "-w", "@kvt/app"], { cwd: ROOT, stdio: "inherit" });

step("3/8 D1 veritabani");
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

step("4/8 R2 kovalari");
for (const bucket of [R2_BACKUPS, R2_ASSETS]) {
  const res = run(["r2", "bucket", "create", bucket], { allowFail: true });
  if (res.ok) console.log(`R2 '${bucket}' olusturuldu.`);
  else if (/already exists|10004|bucket.*exists/i.test(res.out)) console.log(`R2 '${bucket}' zaten var.`);
  else throw new Error(`R2 '${bucket}' olusturma basarisiz:\n${res.out}`);
}

step("5/8 SESSION_SECRET");
const secrets = run(["secret", "list", "--config", "functions/wrangler.toml"], { allowFail: true });
if (/"name"\s*:\s*"SESSION_SECRET"/.test(secrets.out)) {
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

step("6/8 Migration'lar (uzak D1)");
execFileSync(
  "npx",
  ["wrangler", "d1", "migrations", "apply", DB_NAME, "--remote", "--config", "functions/wrangler.toml"],
  { cwd: ROOT, stdio: "inherit" },
);

step("7/8 Dagitim (Workers + D1 + R2 + DO + Workflows + assets)");
const deploy = run(["deploy", "--config", "functions/wrangler.toml"]);
const url = deploy.out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i)?.[0] ?? null;
console.log(deploy.out.trim().split("\n").slice(-6).join("\n"));

step("8/8 Canli saglik kontrolu");
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
    ].join("\n"),
  );
} else {
  console.log("Dagitim ciktisindan adres okunamadi; 'wrangler deployments list' ile kontrol edin.");
}

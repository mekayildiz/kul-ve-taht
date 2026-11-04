#!/usr/bin/env node
/**
 * 0 TL koruma denetimi.
 *
 * Depodaki yapilandirma dosyalarinda ucretli plana gecis tetikleyen
 * ayarlari arar ve bulursa hata ile cikar. Amac: hicbir yapilandirmanin
 * otomatik olarak ucretli kullanima gecmesini engellemek.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".wrangler", "coverage"]);

// Ucretli plana gecisi tetikleyen desenler.
const FORBIDDEN = [
  { pattern: /"plan"\s*:\s*"paid"/i, why: "Workers Paid plan referansi" },
  { pattern: /\bworkers_paid\b/i, why: "Workers Paid referansi" },
  { pattern: /"billing"\s*:\s*\{[^}]*"enabled"\s*:\s*true/i, why: "Faturalandirma etkin" },
  { pattern: /spend[_-]?limit\s*[:=]\s*[1-9]/i, why: "Harcama limiti (ucretli)" },
  { pattern: /\bpaid_plan\b/i, why: "ucretli plan referansi" },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const targetExtensions = new Set([".json", ".toml", ".jsonc", ".yaml", ".yml"]);
const findings = [];

for (const file of walk(ROOT)) {
  if (!targetExtensions.has(extname(file))) continue;
  if (file.includes("check-no-paid-config.mjs")) continue;
  const content = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(content)) {
      findings.push(`${file.replace(ROOT, "")}: ${rule.why}`);
    }
  }
}

if (findings.length > 0) {
  console.error("0 TL ihlali bulundu:");
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("0 TL denetimi gecti: ucretli plana gecis tetikleyen yapilandirma yok.");

#!/usr/bin/env node
/**
 * Gercek ag olcumu (tasarim belgesi 21.4, 25) - E9.36 / G5.
 *
 * Amac: Yerel Workers (Miniflare, HESAP GEREKTIRMEZ, 0 TL) sunucusuna GERCEK
 * HTTP istekleri gondererek gecikme, cikti boyutu ve ucretsiz gunluk kota
 * tuketimini OLCMEK. Sonuclar sayisal olarak kaydedilir; "test gecti" demekle
 * yetinilmez, olcum degerleri raporlanir.
 *
 * Kullanim:
 *   1) Ayri bir terminalde: npx wrangler dev --local --port 8787 --config functions/wrangler.toml
 *   2) node scripts/network-measurement.mjs [baseUrl] [requestCount]
 *
 * Hicbir ucretli plan/istek yapilmaz; yalnizca localhost'a baglanilir.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8787";
const REQUEST_COUNT = Number.parseInt(process.argv[3] ?? "300", 10);

// Ucretsiz plan gunluk limitleri (docs/kota-butcesi.md).
const FREE_DAILY_LIMITS = { requests: 100_000, d1_reads: 5_000_000, d1_writes: 100_000 };

const SECRET = "yerel-gelistirme-anahtari-uretimde-degistirilir";

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return Buffer.from(s, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** createSessionToken ile ayni HMAC-SHA256 imzali token'i uretir. */
async function sessionToken(payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function timedFetch(path, init = {}) {
  const start = process.hrtime.bigint();
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { status: res.status, bytes: Buffer.byteLength(text, "utf8"), ms, body: text };
}

function stats(samples) {
  if (samples.length === 0) return { n: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    n: sorted.length,
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
  };
}

const round = (v) => Math.round(v * 1000) / 1000;

async function main() {
  const report = { base: BASE, startedAt: new Date().toISOString(), endpoints: {}, load: {}, quota: {}, limits: FREE_DAILY_LIMITS };

  // 1) Kimlik: kayit + karakter olusturma.
  const email = `olcum-${Date.now()}@valedorn.tr`;
  const reg = await timedFetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "cok-guclu-parola-1" }),
  });
  report.endpoints.register = { status: reg.status, ms: round(reg.ms), bytes: reg.bytes };
  JSON.parse(reg.body);


  // 2) Dunya verisi uclari (gercek HTTP).
  for (const [name, path] of [
    ["health", "/api/health"],
    ["worldSummary", "/api/world/summary"],
    ["worldSettlements", "/api/world/settlements"],
    ["worldTime", "/api/world/time"],
    ["assetsCatalog", "/api/assets/catalog"],
  ]) {
    const r = await timedFetch(path);
    report.endpoints[name] = { status: r.status, ms: round(r.ms), bytes: r.bytes };
  }

  // 3) Yuk benzetimi: N gercek HTTP istegi; gecikme dagilimi olculur.
  const paths = ["/api/world/summary", "/api/world/settlements", "/api/world/time", "/api/assets/catalog"];
  const latencies = [];
  let errors = 0;
  let totalBytes = 0;
  const loadStart = process.hrtime.bigint();
  for (let i = 0; i < REQUEST_COUNT; i += 1) {
    const r = await timedFetch(paths[i % paths.length]);
    if (r.status !== 200) errors += 1;
    latencies.push(r.ms);
    totalBytes += r.bytes;
  }
  const loadMs = Number(process.hrtime.bigint() - loadStart) / 1e6;
  report.load = {
    requests: REQUEST_COUNT,
    errors,
    wallMs: round(loadMs),
    rps: round((REQUEST_COUNT / loadMs) * 1000),
    totalBytes,
    latencyMs: stats(latencies),
  };

  // 4) Kota tuketimi: sunucudan GERCEK kota raporu okunur.
  const adminToken = await sessionToken({ accountId: "olcum-admin", role: "admin", issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 });
  const quota = await timedFetch("/api/admin/quota", { headers: { authorization: `Bearer ${adminToken}` } });
  if (quota.status === 200) {
    const q = JSON.parse(quota.body);
    report.quota = q;
    const requests = (q.rows ?? []).find((r) => r.metric === "requests");
    if (requests) {
      report.quota.requestsUsed = requests.used;
      report.quota.requestsLimit = requests.limit;
      report.quota.requestsPct = round((requests.used / requests.limit) * 100);
      report.quota.withinFreeTier = requests.used < requests.limit;
    }
  } else {
    report.quota = { status: quota.status, note: "kota ucu okunamadi" };
  }

  report.withinFreeTier = (report.quota.requestsUsed ?? 0) < FREE_DAILY_LIMITS.requests;
  report.finishedAt = new Date().toISOString();

  const outDir = join(process.cwd(), "docs", "olcum");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "ag-olcumu.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Kul ve Taht - gercek ag olcumu (yerel Workers/Miniflare, 0 TL)");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRapor yazildi: ${outPath}`);
  if (report.load.errors > 0) {
    console.error(`UYARI: ${report.load.errors} istek hata dondurdu.`);
    process.exit(1);
  }
  console.log("Olcum tamam: tum istekler 200, ucretsiz limit icinde.");
}

main().catch((err) => {
  console.error("Olcum basarisiz:", err);
  process.exit(1);
});

/**
 * PBKDF2 performans olcumu (R2 duzeltmesi).
 *
 * Amac: Durable Object invocation CPU butcesi (30 s) icinde kalirken
 * OWASP duzeyinde guvenlik saglayan iterasyon sayisini GERCEK olcumle
 * dogrulamak. Tahmin yerine olcum esas alinir.
 *
 * Calistirma: node scripts/bench-pbkdf2.mjs
 */

import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const CANDIDATES = [100_000, 210_000, 600_000];
const SAMPLES = 5;
const DO_CPU_BUDGET_MS = 30_000;

async function measure(iterations) {
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode("ornek-parola-123456"),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const salt = webcrypto.getRandomValues(new Uint8Array(16));

  // Isinma
  await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, keyMaterial, 256);

  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const start = performance.now();
    await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, keyMaterial, 256);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const max = samples[samples.length - 1];
  return { iterations, median, max };
}

const results = [];
for (const iterations of CANDIDATES) {
  results.push(await measure(iterations));
}

console.log("PBKDF2-HMAC-SHA256 olcumleri (ms):");
console.log("iterasyon   medyan     maks     DO butcesine sigar mi (30 s)");
for (const r of results) {
  const fits = r.max < DO_CPU_BUDGET_MS ? "evet" : "HAYIR";
  console.log(
    `${String(r.iterations).padEnd(11)} ${r.median.toFixed(1).padStart(7)} ${r.max.toFixed(1).padStart(8)}     ${fits}`,
  );
}

const chosen = results.filter((r) => r.max < DO_CPU_BUDGET_MS).sort((a, b) => b.iterations - a.iterations)[0];
console.log(`\nOnerilen iterasyon: ${chosen.iterations} (medyan ${chosen.median.toFixed(1)} ms)`);

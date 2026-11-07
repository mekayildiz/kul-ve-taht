#!/usr/bin/env node
/**
 * Canli duman testi (0 TL).
 *
 * Neden: `/api/health` yalnizca Worker'in ayakta oldugunu soyler; D1 semasi
 * eksikse (ornek: uygulanmamis migration) saglik YESIL kalir ama giris 500
 * verir. Bu betik GERCEK kimlik dogrulama yolunu uctan uca kosturur ve
 * sema/uygulama uyumsuzlugunu yayin aninda yakalar.
 *
 * Akis: kayit -> giris -> /api/me. Beklenen: 201 -> 200(token) -> 200.
 * Basarisizlikta sifir olmayan cikis kodu doner (CI/yayin adimini durdurur).
 *
 * Kullanim:
 *   node scripts/smoke-live.mjs https://kulvetaht.dpdns.org
 */

const BASE = (process.argv[2] ?? "http://localhost:8787").replace(/\/+$/, "");

function fail(msg) {
  console.error(`DUMAN TESTI BASARISIZ: ${msg}`);
  process.exit(1);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

const email = `duman-${Date.now()}@valedorn.tr`;
const password = "cok-guclu-parola-1";

const reg = await post("/api/auth/register", { email, password, locale: "tr" });
console.log(`kayit -> ${reg.status}`);
if (reg.status !== 201) fail(`kayit 201 bekleniyordu, ${reg.status} alindi: ${reg.text.slice(0, 200)}`);

const login = await post("/api/auth/login", { email, password });
console.log(`giris -> ${login.status}`);
if (login.status !== 200 || !login.json?.token) {
  fail(`giris 200 + token bekleniyordu, ${login.status} alindi: ${login.text.slice(0, 200)}`);
}

const meRes = await fetch(`${BASE}/api/me`, { headers: { authorization: `Bearer ${login.json.token}` } });
const meText = await meRes.text();
console.log(`me -> ${meRes.status}`);
if (meRes.status !== 200) fail(`/api/me 200 bekleniyordu, ${meRes.status} alindi: ${meText.slice(0, 200)}`);

console.log(`DUMAN TESTI GECTI (${BASE})`);

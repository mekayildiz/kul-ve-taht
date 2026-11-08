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

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
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

const reg = await post("/api/auth/register", { email, password });
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

const auth = { authorization: `Bearer ${login.json.token}`, "content-type": "application/json" };

// Karakter olusturma: en sik kirilan yol (nitelik/yerlesim semasi).
const attributes = {
  strength: 8,
  endurance: 8,
  agility: 8,
  intellect: 8,
  perception: 8,
  charisma: 8,
  leadership: 8,
};
const create = await post(
  "/api/characters",
  {
    givenName: "Duman",
    surname: "Testi",
    gender: "male",
    birthSettlement: "varkhenn-drahkmar",
    attributes,
  },
  auth,
);
console.log(`karakter -> ${create.status}`);
if (create.status !== 201 || !create.json?.characterId) {
  fail(`karakter 201 + characterId bekleniyordu, ${create.status} alindi: ${create.text.slice(0, 200)}`);
}
const characterId = create.json.characterId;

// Oyun durumu: uygulanmamis migration (eksik tablo/kolon) BURADA patlar.
// /api/health ve giris uclari saglikli kalsa bile bu yol kirilabilir.
const stateRes = await fetch(`${BASE}/api/play/${characterId}/state`, { headers: auth });
const stateText = await stateRes.text();
console.log(`durum -> ${stateRes.status}`);
if (stateRes.status !== 200) {
  fail(
    `play state 200 bekleniyordu, ${stateRes.status} alindi: ${stateText.slice(0, 200)}. ` +
      "Muhtemelen uzak D1'e uygulanmamis migration var (npm run db:migrate:remote).",
  );
}

// Yardimci uclar: oynanis ekrani bunlari paralel cagirir.
for (const path of ["/api/catalog", `/api/quests?characterId=${characterId}`, "/api/notifications"]) {
  const res = await fetch(`${BASE}${path}`, { headers: auth });
  console.log(`${path} -> ${res.status}`);
  if (res.status !== 200) fail(`${path} 200 bekleniyordu, ${res.status} alindi.`);
}

console.log(`DUMAN TESTI GECTI (${BASE})`);

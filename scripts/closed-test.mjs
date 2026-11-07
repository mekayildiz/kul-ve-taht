#!/usr/bin/env node
/**
 * Kapali uctan uca test (tasarim belgesi 20, 25) - E9.37 / G5.
 *
 * Amac: Yerel Workers (Miniflare, 0 TL) sunucusuna GERCEK HTTP istekleri
 * gondererek tam bir oyuncu akisini uctan uca CALISTIRMAK ve sonuclari
 * OLCMEK: kayit -> karakter -> oynanis aksiyonlari -> durum -> bildirim ->
 * yonetici uclari. Her adimin gercek HTTP durumu ve gecikmesi kaydedilir.
 *
 * Kullanim:
 *   1) Ayri terminal: npx wrangler dev --local --port 8787 --config functions/wrangler.toml
 *   2) node scripts/closed-test.mjs [baseUrl]
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8787";
const SECRET = "yerel-gelistirme-anahtari-uretimde-degistirilir";

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return Buffer.from(s, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sessionToken(payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

const round = (v) => Math.round(v * 1000) / 1000;

async function main() {
  const steps = [];
  const record = async (name, path, init = {}, okStatuses = []) => {
    const start = process.hrtime.bigint();
    const res = await fetch(`${BASE}${path}`, init);
    const text = await res.text();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    steps.push({ name, path, status: res.status, ms: round(ms), ok: res.ok || okStatuses.includes(res.status) });
    return { status: res.status, json, text };
  };

  const email = `kapali-${Date.now()}@valedorn.tr`;
  const reg = await record("register", "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "cok-guclu-parola-1" }),
  });
  const accountId = reg.json?.accountId ?? "kapali-hesap";
  const token = await sessionToken({ accountId, role: "player", issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 });
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  // Yonetici oturumu: sentetik belirtec YETMEZ, cunku yonetim uclari rolu
  // DB'den tazeler (yetki sizmasi onlenir). Bu yuzden gercek akis izlenir:
  // kayit -> bootstrap-admin -> giris. Sabit e-posta/parola sayesinde tekrar
  // calistirmalar da calisir (bootstrap 409, kayit email_taken donse de giris
  // basarili olur).
  const adminEmail = "kapali-admin@valedorn.tr";
  await record(
    "adminRegister",
    "/api/auth/register",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: "cok-guclu-parola-1" }),
    },
    [409], // tekrar calistirmada hesap zaten var; beklenen durum
  );
  const bootstrapToken = process.env.BOOTSTRAP_ADMIN_TOKEN ?? "kapali-yerel-bootstrap";
  await record(
    "bootstrapAdmin",
    "/api/auth/bootstrap-admin",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-bootstrap-token": bootstrapToken },
      body: JSON.stringify({ email: adminEmail }),
    },
    [409], // tekrar calistirmada zaten yonetici var; beklenen durum
  );
  const adminLogin = await record("adminLogin", "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: "cok-guclu-parola-1" }),
  });
  const adminToken = adminLogin.json?.token ?? "";
  const adminAuth = { authorization: `Bearer ${adminToken}`, "content-type": "application/json" };

  await record("seedWorld", "/api/admin/seed-world", { method: "POST", headers: adminAuth });

  const create = await record("createCharacter", "/api/characters", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      givenName: "Kapali",
      surname: "Test",
      birthSettlement: "varkhenn-drahkmar",
      attributes: { strength: 8, endurance: 8, agility: 8, intellect: 8, perception: 8, charisma: 8, leadership: 8 },
    }),
  });
  const characterId = create.json?.characterId;

  // Oynanis aksiyonlari (gercek HTTP; SUNUCUDA dogrulanir).
  const actions = [
    { action: "work", profession: "blacksmith", hours: 8 },
    { action: "rest", hours: 6 },
    { action: "explore", site: "forest", preparedness: 50 },
    { action: "trade", itemId: "bread", quantity: 2, side: "buy" },
    { action: "setRelationship", targetId: "npc-1", kind: "friend" },
  ];
  for (const body of actions) {
    await record(`action:${body.action}`, `/api/play/${characterId}/action`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });
  }

  const state = await record("playState", `/api/play/${characterId}/state`, { headers: auth });
  const notifications = await record("notifications", "/api/notifications", { headers: auth });

  // Yonetici uclari: butce, yolsuzluk denetimi, genel bakis, kota.
  await record("adminOverview", "/api/admin/overview", { headers: adminAuth });
  await record("adminBudget", "/api/admin/budget/run", { method: "POST", headers: adminAuth, body: JSON.stringify({ kingdomId: "varkhenn" }) });
  const audit = await record("adminCorruptionAudit", "/api/admin/corruption/audit", {
    method: "POST",
    headers: adminAuth,
    body: JSON.stringify({ kingdomId: "varkhenn", auditStrength: 1, actualRevenue: 0 }),
  });
  const quota = await record("adminQuota", "/api/admin/quota", { headers: adminAuth });

  const failed = steps.filter((s) => !s.ok);
  const report = {
    base: BASE,
    startedAt: new Date().toISOString(),
    characterId,
    steps,
    summary: {
      total: steps.length,
      passed: steps.length - failed.length,
      failed: failed.length,
      failedSteps: failed.map((f) => `${f.name} (${f.status})`),
    },
    assertions: {
      characterCreated: Boolean(characterId),
      playStateRead: state.status === 200 && Boolean(state.json?.state?.characterId),
      socialListed: Array.isArray(state.json?.social) && state.json.social.length > 0,
      notificationsOk: notifications.status === 200,
      corruptionDetected: (audit.json?.detected ?? 0) > 0,
      quotaWithinFreeTier: (quota.json?.rows ?? []).every((r) => r.state === "ok"),
    },
    finishedAt: new Date().toISOString(),
  };

  const outDir = join(process.cwd(), "docs", "olcum");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "kapali-test.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Kul ve Taht - kapali uctan uca test (yerel Workers/Miniflare, 0 TL)");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRapor yazildi: ${outPath}`);

  const allAssertions = Object.values(report.assertions).every(Boolean);
  if (report.summary.failed > 0 || !allAssertions) {
    console.error("\nKAPALI TEST BASARISIZ.");
    process.exit(1);
  }
  console.log("\nKapali test gecti: tum adimlar ve dogrulamalar basarili.");
}

main().catch((err) => {
  console.error("Kapali test basarisiz:", err);
  process.exit(1);
});

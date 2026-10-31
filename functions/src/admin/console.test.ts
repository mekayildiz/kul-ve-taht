/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../index";
import { createTestDb } from "../test-support/sqlite-harness";
import { createSessionToken } from "../auth/session";
import { registerAccount } from "../auth/service";
import { seedWorld } from "../world/seed";
import { emptyAttributes } from "../character/attributes";
import { adminOverview, adminCharacters, adminSetCharacterStatus, adminEconomy } from "./console";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: createTestDb(), SESSION_SECRET: "test-secret-degistir", ...overrides };
}

async function call(path: string, env: Env, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://kulvetah.local${path}`, init), env, {} as ExecutionContext);
}

async function setupPlayer(env: Env, role: "player" | "admin" = "player") {
  const reg = await registerAccount(env.DB, { email: `a${Date.now()}${Math.random()}@valedorn.tr`, password: "cok-guclu-parola-1" });
  if (!reg.ok) throw new Error("kayit basarisiz");
  await seedWorld(env.DB);
  const token = await createSessionToken(
    { accountId: reg.accountId, role, issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
    env.SESSION_SECRET,
  );
  const create = await call("/api/characters", env, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ givenName: "Kael", surname: "Veyr", birthSettlement: "varkhenn-drahkmar", attributes: emptyAttributes() }),
  });
  const { characterId } = (await create.json()) as { characterId: string };
  return { token, characterId, accountId: reg.accountId };
}

describe("Yonetici konsolu (belge 20)", () => {
  it("ozet sayilari dondurur", async () => {
    const env = makeEnv();
    await setupPlayer(env);
    const overview = await adminOverview(env.DB);
    expect(overview.characters).toBeGreaterThanOrEqual(1);
    expect(overview.settlements).toBeGreaterThanOrEqual(130);
    expect(overview.kingdoms).toBeGreaterThanOrEqual(1);
    expect(overview.gameDay).toBeGreaterThanOrEqual(1);
  });

  it("karakter listesi ve durum degisikligi", async () => {
    const env = makeEnv();
    const { characterId } = await setupPlayer(env);
    const list = await adminCharacters(env.DB);
    expect(list.some((c) => c.id === characterId)).toBe(true);
    const dead = await adminSetCharacterStatus(env.DB, characterId, "dead");
    expect(dead.ok).toBe(true);
    const after = await adminCharacters(env.DB);
    expect(after.find((c) => c.id === characterId)?.alive).toBe(false);
    const missing = await adminSetCharacterStatus(env.DB, "yok-boyle-karakter", "dead");
    expect(missing.ok).toBe(false);
  });

  it("ekonomi izleme calisir", async () => {
    const env = makeEnv();
    await setupPlayer(env);
    const economy = await adminEconomy(env.DB);
    expect(Array.isArray(economy)).toBe(true);
  });

  it("yonetici olmayan oyuncu admin uclarina erisemez (403)", async () => {
    const env = makeEnv();
    const { token } = await setupPlayer(env, "player");
    const res = await call("/api/admin/overview", env, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
  });

  it("yonetici admin uclarindan ozet alir", async () => {
    const env = makeEnv();
    const { token } = await setupPlayer(env, "admin");
    const res = await call("/api/admin/overview", env, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.accounts).toBeGreaterThanOrEqual(1);
    const chars = await call("/api/admin/characters", env, { headers: { authorization: `Bearer ${token}` } });
    expect(chars.status).toBe(200);
    const economy = await call("/api/admin/economy", env, { headers: { authorization: `Bearer ${token}` } });
    expect(economy.status).toBe(200);
  });
});

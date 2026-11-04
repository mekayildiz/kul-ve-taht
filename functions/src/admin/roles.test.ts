/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import worker, { type Env } from "../index";
import { createTestDb } from "../test-support/sqlite-harness";
import { createSessionToken } from "../auth/session";
import { registerAccount } from "../auth/service";
import { adminAccounts, adminSetAccountRole, adminSetAccountStatus } from "./roles";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: createTestDb(), SESSION_SECRET: "test-secret-degistir", ...overrides };
}

async function call(path: string, env: Env, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://kulvetah.local${path}`, init), env, {} as ExecutionContext);
}

async function account(env: Env, role: "player" | "moderator" | "admin" = "player") {
  const email = `u${Date.now()}${Math.random()}@valedorn.tr`;
  const reg = await registerAccount(env.DB, { email, password: "cok-guclu-parola-1" });
  if (!reg.ok) throw new Error("kayit basarisiz");
  if (role !== "player") await adminSetAccountRole(env.DB, reg.accountId, role);
  const token = await createSessionToken(
    { accountId: reg.accountId, role, issuedAt: Date.now(), expiresAt: Date.now() + 60_000 },
    env.SESSION_SECRET,
  );
  return { token, accountId: reg.accountId, email };
}

const auth = (token: string, body?: unknown): RequestInit => ({
  method: body ? "POST" : "GET",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("Rol yonetimi (belge 20)", () => {
  it("hesaplari ve rollerini listeler", async () => {
    const env = makeEnv();
    const a = await account(env, "moderator");
    const list = await adminAccounts(env.DB);
    expect(list.some((x) => x.id === a.accountId && x.role === "moderator")).toBe(true);
  });

  it("rol atar ve audit_log'a yazar", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    const target = await account(env, "player");
    const res = await adminSetAccountRole(env.DB, target.accountId, "moderator", admin.accountId);
    expect(res.ok).toBe(true);
    const row = await env.DB.prepare("SELECT role FROM accounts WHERE id = ?").bind(target.accountId).first<{ role: string }>();
    expect(row?.role).toBe("moderator");
  });

  it("SON adminin dusurulmesini engeller (panel kilitlenmesin)", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    const res = await adminSetAccountRole(env.DB, admin.accountId, "player", admin.accountId);
    expect(res).toEqual({ ok: false, reason: "last_admin" });
  });

  it("gecersiz rolu reddeder", async () => {
    const env = makeEnv();
    const target = await account(env, "player");
    const res = await adminSetAccountRole(env.DB, target.accountId, "patron" as any);
    expect(res).toEqual({ ok: false, reason: "invalid_role" });
  });
});

describe("Korumali (kurucu) hesap (ban ve rol korumasi)", () => {
  /** Korumali hesap olusturur (bootstrap akisinin yaptigi gibi). */
  async function protect(env: Env, accountId: string, role: "admin" = "admin") {
    await env.DB.prepare("UPDATE accounts SET role = ?, protected = 1 WHERE id = ?").bind(role, accountId).run();
  }

  it("korumali hesabin rolu dusurulemez", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    await protect(env, admin.accountId);
    const res = await adminSetAccountRole(env.DB, admin.accountId, "player", admin.accountId);
    expect(res).toEqual({ ok: false, reason: "protected" });
    const row = await env.DB.prepare("SELECT role FROM accounts WHERE id = ?").bind(admin.accountId).first<{ role: string }>();
    expect(row?.role).toBe("admin");
  });

  it("korumali hesap BANLANAMAZ", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    await protect(env, admin.accountId);
    const res = await adminSetAccountStatus(env.DB, admin.accountId, "banned", admin.accountId);
    expect(res).toEqual({ ok: false, reason: "protected" });
    const row = await env.DB.prepare("SELECT status FROM accounts WHERE id = ?").bind(admin.accountId).first<{ status: string }>();
    expect(row?.status).toBe("active");
  });

  it("korumali hesap ASKIYA da alinamaz", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    await protect(env, admin.accountId);
    expect(await adminSetAccountStatus(env.DB, admin.accountId, "suspended")).toEqual({ ok: false, reason: "protected" });
  });

  it("korumali hesap aktif tutulabilir (idempotent)", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    await protect(env, admin.accountId);
    expect(await adminSetAccountStatus(env.DB, admin.accountId, "active")).toMatchObject({ ok: true, status: "active" });
  });

  it("korumasiz hesap banlanabilir ve geri alinabilir", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    const target = await account(env, "player");
    expect(await adminSetAccountStatus(env.DB, target.accountId, "banned", admin.accountId)).toMatchObject({ ok: true, status: "banned" });
    const banned = await env.DB.prepare("SELECT status FROM accounts WHERE id = ?").bind(target.accountId).first<{ status: string }>();
    expect(banned?.status).toBe("banned");
    expect(await adminSetAccountStatus(env.DB, target.accountId, "active", admin.accountId)).toMatchObject({ ok: true, status: "active" });
  });

  it("SON aktif admin banlanamaz (yonetim kilitlenmesin)", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    const res = await adminSetAccountStatus(env.DB, admin.accountId, "banned", admin.accountId);
    expect(res).toEqual({ ok: false, reason: "last_admin" });
    const row = await env.DB.prepare("SELECT status FROM accounts WHERE id = ?").bind(admin.accountId).first<{ status: string }>();
    expect(row?.status).toBe("active");
  });

  it("baska bir admin varken admin banlanabilir", async () => {
    const env = makeEnv();
    const admin1 = await account(env, "admin");
    const admin2 = await account(env, "admin");
    const res = await adminSetAccountStatus(env.DB, admin2.accountId, "banned", admin1.accountId);
    expect(res).toMatchObject({ ok: true, status: "banned" });
  });

  it("banli hesap giris yapamaz", async () => {
    const env = makeEnv();
    const target = await account(env, "player");
    await adminSetAccountStatus(env.DB, target.accountId, "banned");
    const res = await call("/api/auth/login", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: target.email, password: "cok-guclu-parola-1" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("Rol yonetimi uclari", () => {
  it("oyuncu hesap listesini goremez (403)", async () => {
    const env = makeEnv();
    const player = await account(env, "player");
    const res = await call("/api/admin/accounts", env, auth(player.token));
    expect(res.status).toBe(403);
  });

  it("moderator ozeti gorebilir ama rol atayamaz", async () => {
    const env = makeEnv();
    const mod = await account(env, "moderator");
    const target = await account(env, "player");
    expect((await call("/api/admin/overview", env, auth(mod.token))).status).toBe(200);
    expect((await call("/api/admin/accounts", env, auth(mod.token))).status).toBe(403);
    const set = await call(`/api/admin/accounts/${target.accountId}/role`, env, auth(mod.token, { role: "admin" }));
    expect(set.status).toBe(403);
  });

  it("admin rol atayabilir", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    const target = await account(env, "player");
    const res = await call(`/api/admin/accounts/${target.accountId}/role`, env, auth(admin.token, { role: "moderator" }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { role: string }).toMatchObject({ ok: true, role: "moderator" });
  });

  it("rol degisikligi ayni oturumda ANINDA etkili olur", async () => {
    const env = makeEnv();
    const admin = await account(env, "admin");
    const target = await account(env, "moderator");
    // Moderator iken rol atayamaz.
    expect((await call(`/api/admin/accounts/${admin.accountId}/role`, env, auth(target.token, { role: "player" }))).status).toBe(403);
    // Admin tarafindan admin yapilir; AYNI belirtecle artik atayabilir.
    await call(`/api/admin/accounts/${target.accountId}/role`, env, auth(admin.token, { role: "admin" }));
    const after = await call(`/api/admin/accounts/${target.accountId}/role`, env, auth(target.token, { role: "moderator" }));
    expect(after.status).toBe(200);
  });
});

describe("Bootstrap: ilk yoneticiyi atama", () => {
  it("jeton tanimli degilse 404", async () => {
    const env = makeEnv();
    const res = await call("/api/auth/bootstrap-admin", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@y.tr" }),
    });
    expect(res.status).toBe(404);
  });

  it("yanlis jetonla 403", async () => {
    const env = makeEnv({ BOOTSTRAP_ADMIN_TOKEN: "dogru-jeton" });
    const a = await account(env, "player");
    const res = await call("/api/auth/bootstrap-admin", env, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bootstrap-token": "yanlis" },
      body: JSON.stringify({ email: a.email }),
    });
    expect(res.status).toBe(403);
  });

  it("dogru jetonla ilk admini atar, sonra kapanir", async () => {
    const env = makeEnv({ BOOTSTRAP_ADMIN_TOKEN: "dogru-jeton" });
    const a = await account(env, "player");
    const first = await call("/api/auth/bootstrap-admin", env, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bootstrap-token": "dogru-jeton" },
      body: JSON.stringify({ email: a.email }),
    });
    expect(first.status).toBe(200);
    const row = await env.DB.prepare("SELECT role FROM accounts WHERE id = ?").bind(a.accountId).first<{ role: string }>();
    expect(row?.role).toBe("admin");
    // Zaten admin varken tekrar cagrilirsa 409 (jeton sizsa bile ele gecirilemez).
    const again = await call("/api/auth/bootstrap-admin", env, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bootstrap-token": "dogru-jeton" },
      body: JSON.stringify({ email: a.email }),
    });
    expect(again.status).toBe(409);
  });
});

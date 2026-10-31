import { describe, expect, it } from "vitest";
import worker, { type Env } from "./index";
import { createTestDb } from "./test-support/sqlite-harness";
import { makeFakeHashGateNamespace } from "./test-support/hash-gate-fake";

/**
 * Uretimde yasanan kayit hatasinin (PBKDF2 600k -> workerd NotSupportedError)
 * uctan uca regresyon testi: kayit ve giris, DO hash kapisi uzerinden calisir.
 */
function makeEnv(): Env {
  return {
    DB: createTestDb(),
    SESSION_SECRET: "test-secret-degistir",
    PASSWORD_HASH_GATE: makeFakeHashGateNamespace(),
  };
}

async function call(path: string, env: Env, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://kulvetah.local${path}`, init), env, {} as ExecutionContext);
}

describe("kayit/giris uctan uca (DO hash kapisi)", () => {
  it("kayit olur, giris yapar ve oturum dogrulanir", async () => {
    const env = makeEnv();
    const email = "e2e@valedorn.tr";
    const password = "cok-guclu-parola-1";

    const reg = await call("/api/auth/register", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, locale: "tr" }),
    });
    expect(reg.status).toBe(201);
    const regBody = (await reg.json()) as { accountId: string };
    expect(regBody.accountId).toBeTruthy();

    const login = await call("/api/auth/login", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { token: string };
    expect(loginBody.token.split(".")).toHaveLength(2);

    const me = await call("/api/me", env, { headers: { authorization: `Bearer ${loginBody.token}` } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { accountId: string };
    expect(meBody.accountId).toBe(regBody.accountId);
  });

  it("ayni e-posta ile ikinci kayit 409 doner", async () => {
    const env = makeEnv();
    const body = JSON.stringify({ email: "tekrar@valedorn.tr", password: "cok-guclu-parola-1" });
    const headers = { "content-type": "application/json" };
    await call("/api/auth/register", env, { method: "POST", headers, body });
    const second = await call("/api/auth/register", env, { method: "POST", headers, body });
    expect(second.status).toBe(409);
  });

  it("yanlis parola 401 doner (sahte basari yok)", async () => {
    const env = makeEnv();
    await call("/api/auth/register", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "yanlis@valedorn.tr", password: "cok-guclu-parola-1" }),
    });
    const login = await call("/api/auth/login", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "yanlis@valedorn.tr", password: "baska-parola-99" }),
    });
    expect(login.status).toBe(401);
  });
});

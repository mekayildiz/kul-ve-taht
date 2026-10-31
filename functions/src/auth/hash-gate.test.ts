import { describe, expect, it } from "vitest";
import { createGateHasher } from "./hash-gate";
import { registerAccount, loginAccount } from "./service";
import { verifyPassword, PBKDF2, PBKDF2_MAX_ITERATIONS } from "./password";
import { createTestDb } from "../test-support/sqlite-harness";
import { queryOne } from "../db/client";
import { makeFakeHashGateNamespace } from "../test-support/hash-gate-fake";
import { PasswordHashGate } from "../durable/password-hash-gate";
import { DEFAULT_LOGIN_POLICY } from "./rate-limit";

describe("PBKDF2 platform siniri (workerd 100.000)", () => {
  it("uretim varsayilani platform ust sinirini asmaz", () => {
    expect(PBKDF2.iterations).toBeLessThanOrEqual(PBKDF2_MAX_ITERATIONS);
  });

  it("ust sinirin uzerindeki iterasyonla dogrulama acik hata verir", async () => {
    // Ust sinir asildiginda workerd NotSupportedError verir; biz erken, anlasilir
    // bir RangeError ile korunuruz (sahte basari dondurulmez).
    const tooMany = PBKDF2_MAX_ITERATIONS + 1;
    const salt = new Uint8Array(16);
    await expect(
      verifyPassword("parola-123456", {
        algorithm: "pbkdf2-sha256",
        iterations: tooMany,
        saltB64: Buffer.from(salt).toString("base64"),
        hashB64: "AAAA",
      }),
    ).rejects.toThrow(RangeError);
  });
});

describe("Durable Object hash kapisi uzerinden kayit/giris", () => {
  it("kayit hash'ini DO'da uretir ve giris ayni hash'i dogrular", async () => {
    const db = createTestDb();
    const gate = makeFakeHashGateNamespace();
    const email = "do@valedorn.tr";
    const password = "cok-guclu-parola-1";

    const reg = await registerAccount(
      db,
      { email, password },
      createGateHasher(gate, email),
    );
    expect(reg.ok).toBe(true);

    const row = await queryOne<{ password_hash: string }>(
      db,
      "SELECT password_hash FROM accounts WHERE email = ?",
      email,
    );
    expect(row?.password_hash.startsWith(`pbkdf2-sha256$${PBKDF2.iterations}$`)).toBe(true);

    const login = await loginAccount(
      db,
      { email, password },
      "test-secret",
      createGateHasher(gate, email),
    );
    expect(login.ok).toBe(true);
  });

  it("namespace yoksa yerel hasher'a duser (test/dev)", async () => {
    const db = createTestDb();
    const reg = await registerAccount(
      db,
      { email: "yerel@valedorn.tr", password: "cok-guclu-parola-1" },
      createGateHasher(undefined, "yerel@valedorn.tr"),
    );
    expect(reg.ok).toBe(true);
  });
});

describe("PasswordHashGate hiz siniri hesap bazli", () => {
  const req = (accountId: string) => ({
    kind: "hash" as const,
    accountId,
    password: "cok-guclu-parola-1",
  });

  it("bir hesabin denemeleri diger hesabi etkilemez", async () => {
    const gate = new PasswordHashGate({} as never, {} as never);
    const now = 1_000_000;

    // Hesap A: pencere limitini doldur.
    for (let i = 0; i < DEFAULT_LOGIN_POLICY.maxAttemptsPerWindow; i += 1) {
      expect((await gate.handle(req("hesap-a"), now)).ok).toBe(true);
    }
    expect((await gate.handle(req("hesap-a"), now)).ok).toBe(false);

    // Hesap B: ayni shard'da olsa bile etkilenmemeli.
    expect((await gate.handle(req("hesap-b"), now)).ok).toBe(true);
  });

  it("pencere suresi dolunca sayac sifirlanir", async () => {
    const gate = new PasswordHashGate({} as never, {} as never);
    const start = 2_000_000;
    for (let i = 0; i < DEFAULT_LOGIN_POLICY.maxAttemptsPerWindow; i += 1) {
      await gate.handle(req("hesap-c"), start);
    }
    expect((await gate.handle(req("hesap-c"), start)).ok).toBe(false);

    const after = start + DEFAULT_LOGIN_POLICY.windowMs + 1;
    expect((await gate.handle(req("hesap-c"), after)).ok).toBe(true);
  });
});

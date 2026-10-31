import { describe, expect, it, vi } from "vitest";
import { isWithinBackupWindow, runD1Backup, type BackupEnv, type WorkflowStepLike } from "./backup-d1";

function makeStep(): WorkflowStepLike {
  return {
    async do<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      return callback();
    },
  };
}

describe("yedekleme penceresi", () => {
  it("yalnizca dusuk yogunluk saatinde izin verir", () => {
    expect(isWithinBackupWindow(3)).toBe(true);
    expect(isWithinBackupWindow(12)).toBe(false);
  });
});

describe("runD1Backup", () => {
  it("export baslatir, dump'i R2'ye yazar", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const env: BackupEnv = {
      ACCOUNT_ID: "acct",
      DATABASE_ID: "db",
      D1_REST_API_TOKEN: "token",
      BACKUP_BUCKET: { put } as unknown as R2Bucket,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { at_bookmark: "bm-1" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ result: { signed_url: "https://example.test/dump.sql", filename: "d1-db.sql" } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("CREATE TABLE t(x);", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runD1Backup(env, makeStep());
    expect(result.filename).toBe("d1-db.sql");
    expect(result.bookmark).toBe("bm-1");
    expect(put).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("baslatma yanitinda bookmark yoksa hata verir (yeniden deneme senaryosu)", async () => {
    const env: BackupEnv = {
      ACCOUNT_ID: "acct",
      DATABASE_ID: "db",
      D1_REST_API_TOKEN: "token",
      BACKUP_BUCKET: { put: vi.fn() } as unknown as R2Bucket,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {} }), { status: 200 })),
    );
    await expect(runD1Backup(env, makeStep())).rejects.toThrow("missing_at_bookmark");
    vi.unstubAllGlobals();
  });

  it("signed_url gelmezse hata verir (yeniden deneme senaryosu)", async () => {
    const env: BackupEnv = {
      ACCOUNT_ID: "acct",
      DATABASE_ID: "db",
      D1_REST_API_TOKEN: "token",
      BACKUP_BUCKET: { put: vi.fn() } as unknown as R2Bucket,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ result: { at_bookmark: "bm" } }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ result: {} }), { status: 200 })),
    );
    await expect(runD1Backup(env, makeStep())).rejects.toThrow("missing_signed_url");
    vi.unstubAllGlobals();
  });
});

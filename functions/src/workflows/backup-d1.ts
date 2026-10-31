/**
 * D1 -> R2 yedekleme Workflow'u (resmi Cloudflare deseni).
 *
 * Onemli gercekler (resmi belge):
 *  - `wrangler d1 export` bir CLI komutudur; Cron Worker icinde calismaz.
 *    Bu nedenle yedekleme, D1 REST API export uc noktasi + Workflows ile
 *    yapilir ve dump dogrudan R2'ye akitilir.
 *  - "A running export will block other database requests." Bu yuzden
 *    yedekleme DUSUK YOGUNLUK saatinde calisir ve export suresince oyuncu
 *    islemleri kuyruga alinir / sinirlanir.
 *  - Free plan: Workflows 3.000 adim/gun, 1 GB-ay depolama; instance durumu
 *    3 gun saklanir; maksimum 1.024 adim/instance. Istekler Workers gunluk
 *    100.000 istek ile paylasimlidir. CPU 10 ms/invocation.
 *
 * Kota butcesi (bkz. docs/kota-butcesi.md): bu Workflow 2 adim kullanir
 * (adim sayimi yeniden denemeleri ve rollback handler'larini SAYMAZ).
 */

export interface BackupEnv {
  ACCOUNT_ID: string;
  DATABASE_ID: string;
  /** Workers Secret - yalnizca ilgili D1 export + R2 yazma yetkisi. */
  D1_REST_API_TOKEN: string;
  BACKUP_BUCKET: R2Bucket;
}

interface ExportInitResult {
  at_bookmark?: string;
}

interface ExportPollResult {
  signed_url?: string;
  filename?: string;
}

export interface BackupResult {
  filename: string;
  bytes: number;
  bookmark: string;
}

/** Dusuk yogunluk penceresi (UTC saat). Disaridan yapilandirilabilir. */
export const BACKUP_WINDOW_UTC_HOUR = 3; // 03:00 UTC civari

export function isWithinBackupWindow(nowUtcHour: number): boolean {
  return nowUtcHour === BACKUP_WINDOW_UTC_HOUR;
}

export async function runD1Backup(env: BackupEnv, step: WorkflowStepLike): Promise<BackupResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/d1/database/${env.DATABASE_ID}/export`;
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${env.D1_REST_API_TOKEN}`,
  });

  const bookmark = await step.do(`start-export:${env.DATABASE_ID}`, async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ output_format: "polling" }),
    });
    const body = (await res.json()) as { result?: ExportInitResult };
    const at = body.result?.at_bookmark;
    if (!at) throw new Error("missing_at_bookmark");
    return at;
  });

  const stored = await step.do("poll-and-store-to-r2", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ current_bookmark: bookmark }),
    });
    const body = (await res.json()) as { result?: ExportPollResult };
    const signedUrl = body.result?.signed_url;
    const filename = body.result?.filename ?? `d1-${env.DATABASE_ID}.sql`;
    if (!signedUrl) throw new Error("missing_signed_url");

    const dump = await fetch(signedUrl);
    if (!dump.ok || !dump.body) throw new Error("dump_fetch_failed");
    await env.BACKUP_BUCKET.put(filename, dump.body);
    return { filename };
  });

  return { filename: stored.filename, bytes: 0, bookmark };
}

/** Cloudflare Workflows adim arayuzunun minimal alt kumesi (test icin). */
export interface WorkflowStepLike {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

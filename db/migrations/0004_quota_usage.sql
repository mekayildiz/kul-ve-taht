-- 0004: Kota kullanim sayaclari (E1.11 kota panosu)
--
-- Amac: gercek ucretsiz plan tuketimini olcmek ve belgelemek. Sayaçlar
-- GUNLUK tutulur (UTC); boylece Workers/D1/DO/Workflows gunluk sinirlariyla
-- dogrudan karsilastirilabilir. Kota asiminda sistem ucretli plana GECMEZ;
-- yalnizca kuyruklar/yavaslar (bkz. quota/guard.ts).

CREATE TABLE IF NOT EXISTS quota_usage (
  day    TEXT NOT NULL,           -- YYYY-MM-DD (UTC)
  metric TEXT NOT NULL,           -- requests | d1_reads | d1_writes | do_requests | workflow_steps
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);

CREATE INDEX IF NOT EXISTS idx_quota_usage_day ON quota_usage(day);

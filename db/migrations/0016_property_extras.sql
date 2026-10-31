-- 0016: Mulk tamamlayicilari: kira, haciz, tapu uyusmazligi (belge 9.3, 20).
--
-- Belge 20: mulk, isletme, calisan, ortaklik, acik artirma ve miras
-- sistemleri tamamlanir. Bu tablolar kiralama, haciz ve tapu
-- uyusmazliklarinin KALICI durumunu tutar.

-- Kiralama sozlesmeleri (belge 9.3, 20).
CREATE TABLE IF NOT EXISTS property_rentals (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL,
  owner_id       TEXT NOT NULL,
  tenant_id      TEXT,
  monthly_rate   REAL NOT NULL DEFAULT 2,
  occupancy      REAL NOT NULL DEFAULT 1,
  last_paid_day  INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacant', 'ended')),
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rentals_owner ON property_rentals (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_rentals_tenant ON property_rentals (tenant_id, status);

-- Haciz kayitlari (belge 9.3, 20): vergi/borc odenmezse mulk el konur.
CREATE TABLE IF NOT EXISTS foreclosures (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL,
  owner_id      TEXT NOT NULL,
  reason        TEXT NOT NULL,
  debt          INTEGER NOT NULL,
  recovered     INTEGER NOT NULL,
  game_day      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_foreclosures_owner ON foreclosures (owner_id);

-- Tapu uyusmazliklari (belge 20): iki taraf ayni mulk uzerinde hak iddia eder.
CREATE TABLE IF NOT EXISTS title_disputes (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL,
  claimant_a    TEXT NOT NULL,
  claimant_b    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_a', 'resolved_b', 'dismissed')),
  resolved_by   TEXT,
  game_day      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_title_disputes_property ON title_disputes (property_id, status);

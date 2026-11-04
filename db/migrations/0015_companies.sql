-- 0015: Sirket, ortaklik, hisse, birlesme/devralma ve isletme (belge 20, 9.x).
--
-- Belge 20: "Karmasik sirket hisseleri, birlesme/devralma ve kurumsal
-- burokrasi ... nihai oyun hedefinin parcasidir." Ayrica "isletmeler,
-- calisanlar, sube agi ve isletmeler arasi ortakliklar desteklenir."

CREATE TABLE IF NOT EXISTS companies (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  capital      INTEGER NOT NULL DEFAULT 0,
  founder_id   TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- Ortaklik paylari (belge 20): paylarin toplami 100 olmalidir (sunucuda dogrulanir).
CREATE TABLE IF NOT EXISTS company_partners (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_id   TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'character' CHECK (owner_type IN ('character', 'npc', 'company')),
  share      REAL NOT NULL,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (company_id, owner_id)
);

-- Sirketin sahip oldugu mulkler (belge 20). character_properties'ten ayri;
-- sahiplik sirkete aittir.
CREATE TABLE IF NOT EXISTS company_properties (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  settlement_id TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN ('house', 'business', 'farm', 'mine', 'ship', 'warehouse')),
  value         INTEGER NOT NULL DEFAULT 0,
  tax_rate      REAL NOT NULL DEFAULT 0.02,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_properties ON company_properties (company_id);

-- Isletme calisanlari (belge 20).
CREATE TABLE IF NOT EXISTS company_employees (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  wage       INTEGER NOT NULL DEFAULT 5,
  skill      INTEGER NOT NULL DEFAULT 20,
  hired_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_employees ON company_employees (company_id);

-- Sube agi (belge 20).
CREATE TABLE IF NOT EXISTS company_branches (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  settlement_id TEXT NOT NULL,
  upkeep        INTEGER NOT NULL DEFAULT 20,
  opened_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_branches ON company_branches (company_id);

-- Birlesme/devralma kayitlari (belge 20): denetim izi.
CREATE TABLE IF NOT EXISTS company_mergers (
  id             TEXT PRIMARY KEY,
  acquirer_id    TEXT NOT NULL,
  target_id      TEXT NOT NULL,
  valuation      INTEGER NOT NULL,
  game_day       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

-- 0007: Askeri, ekonomi, adalet ve sosyal sistemlerin oynanis durumu.
--
-- Belge 20: bu sistemler yalnizca modul olarak var olamaz; arayuz, veritabani
-- ve sunucu dogrulamasi birbirine bagli olmalidir. Asagidaki tablolar oynanis
-- eylemlerinin KALICI durumunu tutar. Hepsi idempotenttir.

-- Karakterin askeri birligi (belge 14.5). Karakter basina tek birlik tutulur.
CREATE TABLE IF NOT EXISTS character_units (
  id            TEXT PRIMARY KEY,
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  unit_type     TEXT NOT NULL CHECK (unit_type IN ('infantry', 'cavalry', 'archer', 'siege', 'naval')),
  strength      INTEGER NOT NULL DEFAULT 0,
  morale        INTEGER NOT NULL DEFAULT 100,
  supply        INTEGER NOT NULL DEFAULT 100,
  experience    INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_units_character ON character_units (character_id);

-- Karakterin gemisi (belge 11, deniz savasi).
CREATE TABLE IF NOT EXISTS character_ships (
  id            TEXT PRIMARY KEY,
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ship_class    TEXT NOT NULL CHECK (ship_class IN ('galley', 'longship', 'caravel', 'flagship')),
  condition     INTEGER NOT NULL DEFAULT 100,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ships_character ON character_ships (character_id);

-- Karakterin kredisi (belge 9.6). Kalan borc ve faiz.
CREATE TABLE IF NOT EXISTS character_loans (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  principal      INTEGER NOT NULL,
  outstanding    INTEGER NOT NULL,
  interest_rate  REAL NOT NULL DEFAULT 5,
  issued_game_day INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'repaid', 'defaulted')),
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loans_character ON character_loans (character_id, status);

-- Karakterin mulku (belge 9.10-9.12).
CREATE TABLE IF NOT EXISTS character_properties (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  settlement_id  TEXT,
  property_type  TEXT NOT NULL CHECK (property_type IN ('house', 'business', 'farm', 'mine', 'ship', 'warehouse')),
  value          INTEGER NOT NULL DEFAULT 0,
  tax_rate       REAL NOT NULL DEFAULT 0.02,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_properties_character ON character_properties (character_id);

-- Karakterin hapis durumu (belge 13.5). Karakter basina tek kayit.
CREATE TABLE IF NOT EXISTS character_prison (
  character_id    TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  settlement_id   TEXT,
  days_remaining  INTEGER NOT NULL DEFAULT 0,
  escape_attempts INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

-- Karakterin sosyal baglantilari (belge 16.3-16.4): arkadas, dusman, ittifak.
CREATE TABLE IF NOT EXISTS character_social (
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('friend', 'enemy', 'ally', 'trade_partner')),
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (character_id, target_id, kind)
);

-- Karakterin yonettigi makam (belge 10, 11). Rutbe ve yetki.
CREATE TABLE IF NOT EXISTS character_offices (
  character_id  TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  kingdom_id    TEXT,
  title         TEXT NOT NULL,
  rank          TEXT NOT NULL DEFAULT 'recruit',
  service_points INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

-- Karakterin aile bagi (belge 7). Basit tek-kayit: es ve cocuk sayisi.
CREATE TABLE IF NOT EXISTS character_family (
  character_id  TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  spouse_id     TEXT,
  spouse_name   TEXT,
  married_day   INTEGER,
  children      INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

-- 0006: Buyu, tarim, avcilik, etkinlik ve yeralti durumlari.
--
-- character_state'e yeni alanlar eklenir. SQLite'ta ALTER TABLE ... ADD COLUMN
-- varsayilan deger ile guvenlidir ve mevcut satirlari bozmaz. Varsayilanlar
-- oyunu baslatirken tutarli baslangic degerleridir.

ALTER TABLE character_state ADD COLUMN magic_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_state ADD COLUMN energy INTEGER NOT NULL DEFAULT 100;
ALTER TABLE character_state ADD COLUMN magic_paths_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE character_state ADD COLUMN underworld_rep INTEGER NOT NULL DEFAULT 0;

-- Ekili tarla durumu (belge 12.7). Karakter basina tek aktif tarla tutulur;
-- boylece D1 Free planinda sorgu sayisi dusuk kalir.
CREATE TABLE IF NOT EXISTS character_farm (
  character_id  TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  crop          TEXT NOT NULL,
  settlement_id TEXT,
  planted_day   INTEGER NOT NULL,
  ready_day     INTEGER NOT NULL,
  expected_yield INTEGER NOT NULL,
  harvested     INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

-- Evcillestirilmis hayvanlar ve sahiplik (belge 12.3).
CREATE TABLE IF NOT EXISTS character_livestock (
  id            TEXT PRIMARY KEY,
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  animal        TEXT NOT NULL,
  acquired_day  INTEGER NOT NULL,
  fed           INTEGER NOT NULL DEFAULT 1,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_livestock_owner ON character_livestock (character_id);

-- Oyuncu bildirimleri (belge 19).
CREATE TABLE IF NOT EXISTS player_notifications (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 1,
  summary       TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_account ON player_notifications (account_id, created_at DESC);

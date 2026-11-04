-- 0008: Dunya simulasyonu durumu (belge 8, 9, 19).
--
-- Katmanli NPC simulasyonu icin NPC basina ihtiyac/hedef/ekonomi durumu,
-- ekonomi bozulmalari ve dunya olay gunlugu. Free plan kota sinirlari icinde
-- kalmak icin simulasyon katmanli araliklarla ve parti halinde calisir.

ALTER TABLE npcs ADD COLUMN needs_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE npcs ADD COLUMN goals_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE npcs ADD COLUMN gold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npcs ADD COLUMN debts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE npcs ADD COLUMN profession TEXT NOT NULL DEFAULT 'ciftci';
ALTER TABLE npcs ADD COLUMN last_simulated_day INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_npcs_sim ON npcs (last_simulated_day, importance);

-- Pazar durumu (belge 9.2): yerlesim basina arizali fiyat carpani ve arz.
CREATE TABLE IF NOT EXISTS market_state (
  settlement_id TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  supply        INTEGER NOT NULL DEFAULT 100,
  demand        INTEGER NOT NULL DEFAULT 100,
  updated_day   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (settlement_id, item_id)
);

-- Acik artirma (belge 9.3): kalici, sunucu otoriteli.
CREATE TABLE IF NOT EXISTS auctions (
  id            TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  reserve_price INTEGER NOT NULL,
  top_bidder_id TEXT,
  top_bid       INTEGER NOT NULL DEFAULT 0,
  closes_day    INTEGER NOT NULL,
  settled       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_auctions_open ON auctions (settled, closes_day);

-- Siyasi makamlar (belge 10.4): atama, rutbe, konsey.
CREATE TABLE IF NOT EXISTS offices (
  id            TEXT PRIMARY KEY,
  kingdom_id    TEXT,
  settlement_id TEXT,
  title         TEXT NOT NULL,
  holder_type   TEXT NOT NULL CHECK (holder_type IN ('character', 'npc')),
  holder_id     TEXT,
  rank          TEXT NOT NULL DEFAULT 'recruit',
  service_points INTEGER NOT NULL DEFAULT 0,
  appointed_day INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_offices_holder ON offices (holder_id);
CREATE INDEX IF NOT EXISTS idx_offices_settlement ON offices (settlement_id);

-- NOT: `character_quests` tablosu 0001_core_schema.sql'da tanimlidir; burada
-- yeniden tanimlanmaz. Gorev ilerleme kolonlari 0009'da eklenir.

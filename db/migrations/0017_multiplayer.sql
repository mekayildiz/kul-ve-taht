-- 0017: Cok oyunculu takas, ittifak ve krallik savaslari (belge 11, 16).
--
-- Belge 16: "Sohbet, ozel mesaj, arkadaslik, gruplar, loncalar, PvP ve
-- ittifaklar" ile oyuncular arasi takas. Belge 11: "ittifak, savas ve baris".

-- Iki taraf onayli takas teklifleri (belge 16). Iki asamali: teklif + kabul.
CREATE TABLE IF NOT EXISTS barter_offers (
  id                TEXT PRIMARY KEY,
  from_id           TEXT NOT NULL,
  to_id             TEXT NOT NULL,
  offer_gold        INTEGER NOT NULL DEFAULT 0,
  offer_items_json  TEXT NOT NULL DEFAULT '[]',
  request_gold      INTEGER NOT NULL DEFAULT 0,
  request_items_json TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_game_day  INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_barter_offers_parties ON barter_offers (to_id, from_id, status);

-- Kralliklar arasi ittifak ve savas (belge 11).
CREATE TABLE IF NOT EXISTS kingdom_relations (
  from_kingdom_id TEXT NOT NULL,
  to_kingdom_id   TEXT NOT NULL,
  stance          TEXT NOT NULL DEFAULT 'neutral' CHECK (stance IN ('neutral', 'allied', 'war', 'truce')),
  affinity        INTEGER NOT NULL DEFAULT 0,
  alliance_until  INTEGER,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (from_kingdom_id, to_kingdom_id)
);

-- Oyuncu ittifaklari (belge 16): oyuncu gruplarindan farkli savas ve savunma paktlari.
CREATE TABLE IF NOT EXISTS player_alliances (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  leader_id    TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_alliance_members (
  alliance_id  TEXT NOT NULL REFERENCES player_alliances(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (alliance_id, character_id)
);

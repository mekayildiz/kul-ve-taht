-- 0005: Oynanis durumu (E3-E6 modullerinin kalici hali).
--
-- Karakterin saglik/envanter/altin durumu JSON olarak tutulur: bu, D1 Free
-- planinda sorgu sayisini dusurur ve modul semalarini tek yerde toplar.
-- Dunya olaylari ve sohbet ayri tablolarda tutulur (zaman cizelgesi sorgusu).

CREATE TABLE IF NOT EXISTS character_state (
  character_id   TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  health_json    TEXT NOT NULL,
  inventory_json TEXT NOT NULL DEFAULT '[]',
  gold           INTEGER NOT NULL DEFAULT 0,
  debts          INTEGER NOT NULL DEFAULT 0,
  reputation     INTEGER NOT NULL DEFAULT 0,
  weapon         TEXT NOT NULL DEFAULT 'unarmed',
  weapon_mastery INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS character_quest_state (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  progress_json TEXT NOT NULL DEFAULT '{}',
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (character_id, quest_id)
);

CREATE TABLE IF NOT EXISTS world_event_log (
  id            TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  settlement_id TEXT,
  severity      INTEGER NOT NULL DEFAULT 0,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  game_day      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_log (
  id            TEXT PRIMARY KEY,
  channel_kind  TEXT NOT NULL,
  channel_scope TEXT,
  sender_id     TEXT NOT NULL,
  recipient_id  TEXT,
  body          TEXT NOT NULL,
  sent_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_log_channel ON chat_log (channel_kind, channel_scope, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_world_event_log_day ON world_event_log (game_day DESC);

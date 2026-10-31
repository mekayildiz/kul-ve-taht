-- 0013: Oyuncu gruplari ve lonca uyeligi (belge 16.2, 16.4).
--
-- Oyuncular kendi gruplarini/birliklerini kurabilir; bu yapilar meslek
-- loncalarindan ve NPC hanedanlarindan AYRIDIR. Kanal erisimi (lonca/grup
-- sohbeti) bu uyelik kayitlari uzerinden dogrulanir.

CREATE TABLE IF NOT EXISTS player_groups (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  leader_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  objective           TEXT,
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_group_members (
  group_id     TEXT NOT NULL REFERENCES player_groups(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (group_id, character_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_character ON player_group_members (character_id);

-- Meslek loncasi uyeligi (belge 16.2): kanal erisimi icin kalici kayit.
CREATE TABLE IF NOT EXISTS character_guilds (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  guild_id     TEXT NOT NULL,
  joined_at    INTEGER NOT NULL
);

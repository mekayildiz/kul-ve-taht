-- 0018: Cocuk gelisimi, konsey oylamasi ve makam azli (belge 7.3, 10, 11).
--
-- Belge 7.3: cocuk gelisim asamalari (bebeklik -> yetiskinlige gecis)
-- ebeveyn ilgisi ve sutanne kalitesiyle ilerler. Belge 11: konsey kararlari
-- oy agirligi ve yetersayimla alinir. Belge 10: makam azli.

-- Cocuk kayitlari: her cocugun dogum (gercek gun) ve gelisim verisi.
CREATE TABLE IF NOT EXISTS character_children (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  born_real_day  INTEGER NOT NULL,
  parent_attention INTEGER NOT NULL DEFAULT 50,
  wet_nurse_quality INTEGER NOT NULL DEFAULT 50,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_children_character ON character_children (character_id);

-- Konsey oylamalari (belge 11): yetersayim + oy agirligi.
CREATE TABLE IF NOT EXISTS council_motions (
  id            TEXT PRIMARY KEY,
  kingdom_id    TEXT NOT NULL,
  proposer_id   TEXT NOT NULL,
  title         TEXT NOT NULL,
  quorum        INTEGER NOT NULL DEFAULT 3,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'passed', 'rejected')),
  yes_weight    INTEGER NOT NULL DEFAULT 0,
  no_weight     INTEGER NOT NULL DEFAULT 0,
  created_game_day INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_motions_kingdom ON council_motions (kingdom_id, status);

-- Aile gecmisi (kronoloji) kalici kaydi (belge 7.6, 8.2): kusaklar arasi aktarim.
ALTER TABLE families ADD COLUMN chronicle_json TEXT NOT NULL DEFAULT '[]';

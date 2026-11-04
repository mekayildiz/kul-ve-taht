-- 0009: Acik artirma satici bagi (belge 9.3).
--
-- Satici kimligi tutulur ki artirma kapandiginda altin saticiya gecebilsin.
-- Mevcut satirlar icin NULL kabul edilir; satici bilinmiyorsa altin yanmaz,
-- yalnizca kazanan esyayi alir.

ALTER TABLE auctions ADD COLUMN seller_id TEXT;
CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions (seller_id);

-- `character_quests` 0001'de (character_id, quest_id) anahtariyla tanimlidir;
-- ilerleme ve gun bilgisi burada eklenir.
ALTER TABLE character_quests ADD COLUMN progress_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE character_quests ADD COLUMN started_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE character_quests ADD COLUMN updated_day INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_character_quests_status ON character_quests (character_id, status);

-- Karakterin en son hangi oyun gunune kadar ilerletildigini izler
-- (tasarim belgesi 6: acik, saglik, yaslanma ve olum gunluk ilerler).
--
-- Dunya saati ilerlediginde butun canli karakterler bir kez ilerletilir;
-- bu sutun ayni gunun birden fazla kez uygulanmasini (cift ilerleme) onler.

ALTER TABLE character_state ADD COLUMN last_advanced_day INTEGER NOT NULL DEFAULT 0;

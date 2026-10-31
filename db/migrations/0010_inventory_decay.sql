-- 0010: Depolama ve bozulma (belge 9.3).
--
-- Envanterdeki gida/ilac gun gun bozulur. Bozulma dunya gunu ilerledikce
-- uygulanir; son islenen gun tutulur ki ayni gun icin tekrar uygulanmasin.

ALTER TABLE character_state ADD COLUMN inventory_decay_day INTEGER NOT NULL DEFAULT 0;

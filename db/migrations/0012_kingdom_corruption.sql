-- 0012: Krallik yolsuzluk orani (belge 9.8).
--
-- Butce turunda gelirin bir kismi yolsuzluk nedeniyle kaybolur; denetim bu
-- kaybi ortaya cikarip hazineye geri kazandirabilir.

ALTER TABLE kingdoms ADD COLUMN corruption REAL NOT NULL DEFAULT 0.1;

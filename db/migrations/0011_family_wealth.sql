-- 0011: Hanedan zenginligi ve itibari (belge 7.6).
--
-- Aile itibari ve serveti kusaklar boyunca surer/duser; miras paylasimi bu
-- degerlerden hesaplanir. `families` tablosuna kalici alanlar eklenir.

ALTER TABLE families ADD COLUMN reputation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE families ADD COLUMN wealth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE families ADD COLUMN debt INTEGER NOT NULL DEFAULT 0;

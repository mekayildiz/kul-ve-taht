-- Kisi basina kisilik ve krallik vergi/uyum durumu (tasarim belgesi 9.7, 9.8, 10.2).
--
-- `character_personality`: oyuncu secimleri ve olaylar kisiligi zamanla
-- degistirir; degerler 0-100 araliginda tutulur (`applyPersonalityShift`).
-- `kingdoms.tax_compliance`: vergi uyumu (0-1). Vergi toplandikca uyum artar,
-- kacak/uyumsuzluk birikince duşer; kacirilan kısım huzursuzluk (unrest) uretir.
-- `kingdoms.unrest`: toplanamayan vergiden dogan toplumsal huzursuzluk.

CREATE TABLE IF NOT EXISTS character_personality (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  courage      INTEGER NOT NULL DEFAULT 50,
  mercy        INTEGER NOT NULL DEFAULT 50,
  ambition     INTEGER NOT NULL DEFAULT 50,
  loyalty      INTEGER NOT NULL DEFAULT 50,
  discipline   INTEGER NOT NULL DEFAULT 50,
  patience     INTEGER NOT NULL DEFAULT 50,
  updated_day  INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE kingdoms ADD COLUMN tax_compliance REAL NOT NULL DEFAULT 0.8;
ALTER TABLE kingdoms ADD COLUMN unrest INTEGER NOT NULL DEFAULT 0;

-- 0002: Karakter ve dunya duzeltmeleri
--
-- Neden: 0001 semasinda `character_attributes.willpower` bulunuyordu; ancak
-- tasarim belgesi 5.5 YEDI niteligi acikca sayar ve YEDINCISI "Liderlik"tir
-- (Guc, Dayaniklilik, Ceviklik, Zeka, Algi, Karizma, Liderlik). Sans ayri bir
-- nitelik DEGILDIR. Bu migrasyon sutunu belgeye uygun hale getirir.

ALTER TABLE character_attributes RENAME COLUMN willpower TO leadership;

-- Gorunus editoru (belge 5.4 ve bolum 20: tam kapsam). Kisilestirme
-- verisi ayri tutulur; boylece temel karakter sorgulari hafif kalir.
CREATE TABLE IF NOT EXISTS character_appearance (
  character_id   TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  face_shape     TEXT,
  skin_tone      TEXT,
  eye_color      TEXT,
  hair_color     TEXT,
  hair_style     TEXT,
  beard_style    TEXT,
  height_cm      INTEGER,
  build          TEXT,
  scars          TEXT,
  tattoos        TEXT,
  outfit         TEXT,
  portrait_asset TEXT REFERENCES visual_assets(id) ON DELETE SET NULL
);

-- Aile ve cocukluk gecmisi (belge 5.3): secimler baslangic kosullarini etkiler.
CREATE TABLE IF NOT EXISTS character_background (
  character_id        TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  family_wealth       TEXT CHECK (family_wealth IN ('destitute','poor','modest','comfortable','wealthy','noble')),
  family_profession   TEXT,
  family_residence    TEXT,
  noble_ties          TEXT,
  childhood_event     TEXT,
  childhood_education TEXT,
  adolescent_choice   TEXT
);

-- Itibar gruplari (belge 5.9): Halk, Tuccarlar, Soylular, Askerler.
CREATE TABLE IF NOT EXISTS character_reputation (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  group_name   TEXT NOT NULL CHECK (group_name IN ('commoners','merchants','nobles','soldiers')),
  value        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, group_name)
);

CREATE INDEX IF NOT EXISTS idx_characters_settlement ON characters(current_settlement);
-- Envanter polimorfiktir (owner_type/owner_id); sahip bazli sorgu icin indeks.
CREATE INDEX IF NOT EXISTS idx_inventory_owner ON inventory(owner_type, owner_id);

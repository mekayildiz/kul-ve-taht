-- Kul ve Taht - D1 (SQLite) temel sema
-- Tasarim belgesi 21.2'deki 19 ana varlik grubunu kapsar.
-- SQLite ortak alt kumesi kullanilir (saglayici bagimsiz: D1 <-> Turso).
-- D1'de PostgreSQL RLS YOKTUR; yetkilendirme sunucu tarafinda uygulanir.

PRAGMA foreign_keys = ON;

-- 1. Kullanici hesaplari
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'player'
                CHECK (role IN ('player', 'moderator', 'admin')),
  locale        TEXT NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr', 'en')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended', 'banned')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  issued_at  INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

-- 2. Oyuncu karakterleri
CREATE TABLE IF NOT EXISTS characters (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  given_name       TEXT NOT NULL,
  surname          TEXT NOT NULL,
  gender           TEXT,
  birth_settlement TEXT,
  age_years        INTEGER NOT NULL DEFAULT 0,
  alive            INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0, 1)),
  generation       INTEGER NOT NULL DEFAULT 1,
  current_settlement TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id);

-- 3. Karakter gecmisi ve nitelikleri
CREATE TABLE IF NOT EXISTS character_attributes (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  strength     INTEGER NOT NULL DEFAULT 5,
  agility      INTEGER NOT NULL DEFAULT 5,
  endurance    INTEGER NOT NULL DEFAULT 5,
  intellect    INTEGER NOT NULL DEFAULT 5,
  charisma     INTEGER NOT NULL DEFAULT 5,
  perception   INTEGER NOT NULL DEFAULT 5,
  willpower    INTEGER NOT NULL DEFAULT 5,
  PRIMARY KEY (character_id)
);

CREATE TABLE IF NOT EXISTS character_traits (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  trait        TEXT NOT NULL,
  value        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, trait)
);

CREATE TABLE IF NOT EXISTS character_expertise (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  expertise    TEXT NOT NULL,
  level        INTEGER NOT NULL DEFAULT 0,
  xp           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, expertise)
);

CREATE TABLE IF NOT EXISTS character_professions (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  profession   TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  PRIMARY KEY (character_id, profession)
);

-- 4. Aileler ve hanedanlar
CREATE TABLE IF NOT EXISTS families (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  crest     TEXT,
  founded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id    TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relation     TEXT NOT NULL,
  since        INTEGER NOT NULL,
  PRIMARY KEY (family_id, character_id)
);

-- 5. NPC'ler
CREATE TABLE IF NOT EXISTS npcs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  settlement_id TEXT,
  family_id    TEXT REFERENCES families(id) ON DELETE SET NULL,
  age_years    INTEGER NOT NULL DEFAULT 30,
  alive        INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0, 1)),
  importance   TEXT NOT NULL DEFAULT 'background'
               CHECK (importance IN ('background', 'notable', 'critical')),
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_npcs_settlement ON npcs(settlement_id);
CREATE INDEX IF NOT EXISTS idx_npcs_importance ON npcs(importance);

CREATE TABLE IF NOT EXISTS npc_attributes (
  npc_id       TEXT PRIMARY KEY REFERENCES npcs(id) ON DELETE CASCADE,
  strength     INTEGER NOT NULL DEFAULT 5,
  agility      INTEGER NOT NULL DEFAULT 5,
  endurance    INTEGER NOT NULL DEFAULT 5,
  intellect    INTEGER NOT NULL DEFAULT 5,
  charisma     INTEGER NOT NULL DEFAULT 5,
  perception   INTEGER NOT NULL DEFAULT 5,
  willpower    INTEGER NOT NULL DEFAULT 5
);

-- 6. Iliskiler ve hafiza kayitlari
CREATE TABLE IF NOT EXISTS relationships (
  id           TEXT PRIMARY KEY,
  owner_type   TEXT NOT NULL CHECK (owner_type IN ('character', 'npc')),
  owner_id     TEXT NOT NULL,
  target_type  TEXT NOT NULL CHECK (target_type IN ('character', 'npc')),
  target_id    TEXT NOT NULL,
  affinity     INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  UNIQUE (owner_type, owner_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS memories (
  id         TEXT PRIMARY KEY,
  npc_id     TEXT NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  weight     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_npc ON memories(npc_id);

-- 7. Kralliklar ve yonetimler
CREATE TABLE IF NOT EXISTS kingdoms (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  capital      TEXT NOT NULL,
  ruler_npc_id TEXT REFERENCES npcs(id) ON DELETE SET NULL,
  government   TEXT NOT NULL,
  treasury     INTEGER NOT NULL DEFAULT 0,
  debt         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS government_positions (
  id           TEXT PRIMARY KEY,
  kingdom_id   TEXT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  holder_type  TEXT CHECK (holder_type IN ('character', 'npc')),
  holder_id    TEXT,
  authority    TEXT NOT NULL,
  appointed_at INTEGER
);

-- 8. Yerlesimler ve bolgeler
CREATE TABLE IF NOT EXISTS settlements (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('capital', 'city', 'town', 'village', 'castle')),
  kingdom_id     TEXT REFERENCES kingdoms(id) ON DELETE SET NULL,
  x              REAL NOT NULL,
  y              REAL NOT NULL,
  population     INTEGER NOT NULL DEFAULT 0,
  security       INTEGER NOT NULL DEFAULT 0,
  primary_output TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_kingdom ON settlements(kingdom_id);

CREATE TABLE IF NOT EXISTS regions (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('kingdom', 'free_city', 'neutral')),
  settlement_id TEXT REFERENCES settlements(id) ON DELETE SET NULL
);

-- 9. Harita noktalari ve rotalar
CREATE TABLE IF NOT EXISTS map_nodes (
  id            TEXT PRIMARY KEY,
  settlement_id TEXT REFERENCES settlements(id) ON DELETE CASCADE,
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  node_type     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS map_routes (
  id           TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  to_node_id   TEXT NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  distance     REAL NOT NULL,
  route_type   TEXT NOT NULL CHECK (route_type IN ('land', 'sea')),
  danger       INTEGER NOT NULL DEFAULT 0
);

-- 10. Esyalar ve envanter
CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  weight       REAL NOT NULL DEFAULT 0,
  base_value   INTEGER NOT NULL DEFAULT 0,
  durability   INTEGER NOT NULL DEFAULT 100,
  max_durability INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS inventory (
  id            TEXT PRIMARY KEY,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('character', 'npc', 'business', 'caravan')),
  owner_id      TEXT NOT NULL,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL DEFAULT 1,
  condition     INTEGER NOT NULL DEFAULT 100,
  UNIQUE (owner_type, owner_id, item_id, condition)
);

-- 11. Meslekler ve uzmanliklar
CREATE TABLE IF NOT EXISTS professions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('production', 'service', 'military', 'scholarly'))
);

CREATE TABLE IF NOT EXISTS expertise_definitions (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL
);

-- 12. Isletmeler ve mulkler
CREATE TABLE IF NOT EXISTS properties (
  id            TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  property_type TEXT NOT NULL CHECK (property_type IN ('house', 'business', 'farm', 'mine', 'ship', 'warehouse')),
  owner_type    TEXT CHECK (owner_type IN ('character', 'npc', 'company')),
  owner_id      TEXT,
  value         INTEGER NOT NULL DEFAULT 0,
  tax_rate      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_properties_settlement ON properties(settlement_id);

CREATE TABLE IF NOT EXISTS businesses (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  business_type TEXT NOT NULL,
  employees     INTEGER NOT NULL DEFAULT 0,
  capital       INTEGER NOT NULL DEFAULT 0
);

-- 13. Pazar ve ticaret islemleri
CREATE TABLE IF NOT EXISTS markets (
  id            TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  supply        INTEGER NOT NULL DEFAULT 0,
  demand        INTEGER NOT NULL DEFAULT 0,
  price         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (settlement_id, item_id)
);

CREATE TABLE IF NOT EXISTS trade_offers (
  id            TEXT PRIMARY KEY,
  offerer_type  TEXT NOT NULL CHECK (offerer_type IN ('character', 'npc', 'company')),
  offerer_id    TEXT NOT NULL,
  counterparty_id TEXT,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'accepted', 'rejected', 'cancelled', 'settled')),
  idempotency_key TEXT UNIQUE,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_offer_lines (
  offer_id TEXT NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('give', 'receive')),
  PRIMARY KEY (offer_id, item_id, direction)
);

CREATE TABLE IF NOT EXISTS caravans (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  route_id       TEXT REFERENCES map_routes(id) ON DELETE SET NULL,
  cargo_value    INTEGER NOT NULL DEFAULT 0,
  departed_at    INTEGER,
  arrives_at     INTEGER,
  status         TEXT NOT NULL DEFAULT 'idle'
                 CHECK (status IN ('idle', 'travelling', 'arrived', 'lost'))
);

-- 14. Bankalar, borc ve vergiler
CREATE TABLE IF NOT EXISTS banks (
  id            TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  reserves      INTEGER NOT NULL DEFAULT 0,
  interest_rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts_ledger (
  id           TEXT PRIMARY KEY,
  owner_type   TEXT NOT NULL CHECK (owner_type IN ('character', 'npc', 'company', 'kingdom')),
  owner_id     TEXT NOT NULL,
  bank_id      TEXT REFERENCES banks(id) ON DELETE SET NULL,
  balance      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_owner ON accounts_ledger(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS loans (
  id            TEXT PRIMARY KEY,
  lender_ledger TEXT NOT NULL REFERENCES accounts_ledger(id) ON DELETE CASCADE,
  borrower_ledger TEXT NOT NULL REFERENCES accounts_ledger(id) ON DELETE CASCADE,
  principal     INTEGER NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 0,
  due_at        INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'repaid', 'defaulted'))
);

CREATE TABLE IF NOT EXISTS taxes (
  id            TEXT PRIMARY KEY,
  kingdom_id    TEXT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  tax_type      TEXT NOT NULL,
  rate          REAL NOT NULL,
  collected_at  INTEGER,
  amount        INTEGER NOT NULL DEFAULT 0
);

-- 15. Ordu ve birlikler
CREATE TABLE IF NOT EXISTS units (
  id             TEXT PRIMARY KEY,
  kingdom_id     TEXT REFERENCES kingdoms(id) ON DELETE SET NULL,
  owner_type     TEXT CHECK (owner_type IN ('character', 'npc', 'kingdom', 'company')),
  owner_id       TEXT,
  unit_type      TEXT NOT NULL CHECK (unit_type IN ('heavy_infantry', 'cavalry', 'archer', 'navy', 'siege', 'mercenary')),
  strength       INTEGER NOT NULL DEFAULT 0,
  morale         INTEGER NOT NULL DEFAULT 100,
  supply         INTEGER NOT NULL DEFAULT 100,
  location_id    TEXT
);

CREATE TABLE IF NOT EXISTS battles (
  id           TEXT PRIMARY KEY,
  attacker_id  TEXT NOT NULL,
  defender_id  TEXT NOT NULL,
  location_id  TEXT NOT NULL,
  battle_type  TEXT NOT NULL CHECK (battle_type IN ('field', 'siege', 'naval')),
  started_at   INTEGER NOT NULL,
  resolved_at  INTEGER,
  outcome      TEXT CHECK (outcome IN ('attacker_win', 'defender_win', 'draw', 'ongoing'))
);

-- 16. Gorevler ve olaylar
CREATE TABLE IF NOT EXISTS quests (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  quest_type    TEXT NOT NULL,
  giver_npc_id  TEXT REFERENCES npcs(id) ON DELETE SET NULL,
  reward_gold   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'active', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS character_quests (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id     TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active',
  progress     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, quest_id)
);

CREATE TABLE IF NOT EXISTS world_events (
  id          TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'system'))
);

-- 17. Sohbet ve mesajlar
CREATE TABLE IF NOT EXISTS chat_channels (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  channel_type  TEXT NOT NULL CHECK (channel_type IN ('global', 'settlement', 'guild', 'kingdom', 'direct')),
  scope_id      TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_type  TEXT NOT NULL CHECK (sender_type IN ('character', 'npc', 'system')),
  sender_id    TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);

-- 18. Gorsel varlik kayitlari
CREATE TABLE IF NOT EXISTS visual_assets (
  id             TEXT PRIMARY KEY,
  asset_key      TEXT NOT NULL UNIQUE,
  category       TEXT NOT NULL CHECK (category IN ('portrait', 'icon', 'map', 'crest', 'environment')),
  license        TEXT NOT NULL,
  attribution    TEXT,
  source         TEXT NOT NULL,
  r2_key         TEXT NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 0
);

-- 19. Bildirimler ve dunya zamani
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  body         TEXT NOT NULL,
  read_at      INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id, created_at);

CREATE TABLE IF NOT EXISTS world_clock (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  game_day             INTEGER NOT NULL DEFAULT 1,
  game_year            INTEGER NOT NULL DEFAULT 1,
  last_tick_real_ms    INTEGER NOT NULL DEFAULT 0,
  real_hours_per_game_day REAL NOT NULL DEFAULT 6
);

INSERT OR IGNORE INTO world_clock (id, game_day, game_year, last_tick_real_ms, real_hours_per_game_day)
VALUES (1, 1, 1, 0, 6);

-- Denetim kaydi (21.1: yonetici islemleri kayit altina alinir)
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

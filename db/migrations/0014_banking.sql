-- 0014: Bankacilik, emanet ve taraflar arasi finansman (belge 20, 9.x).
--
-- Belge 20: "Bankalar, mevduat, kasa, emanet, kredi, faiz, borc, temerrut,
-- tahsilat, iflas, tasfiye ve oyuncular/NPC'ler arasi finansman sistemleri
-- tamamlanir." Bu tablolar KALICI durumu tutar; hesaplar sunucuda islenir.

-- Mevduat ve kasa hesaplari (belge 20). Kasa (vault) faizsiz guvenli saklama.
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  settlement_id   TEXT,
  kind            TEXT NOT NULL DEFAULT 'current' CHECK (kind IN ('current', 'vault')),
  balance         INTEGER NOT NULL DEFAULT 0,
  interest_rate   REAL NOT NULL DEFAULT 0,
  opened_game_day INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (owner_id, settlement_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_owner ON bank_accounts (owner_id);

-- Emanet (escrow): taraflar arasi guvenli islem (belge 20).
CREATE TABLE IF NOT EXISTS escrows (
  id               TEXT PRIMARY KEY,
  from_id          TEXT NOT NULL,
  to_id            TEXT NOT NULL,
  amount           INTEGER NOT NULL,
  condition        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded', 'disputed')),
  created_game_day INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escrows_parties ON escrows (from_id, to_id, status);

-- Banka ve taraflar arasi krediler (belge 20). character_loans'tan farkli
-- olarak alacakli taraf (lender_id) ve vade (due_game_day) tutulur.
CREATE TABLE IF NOT EXISTS bank_loans (
  id               TEXT PRIMARY KEY,
  borrower_id      TEXT NOT NULL,
  lender_id        TEXT NOT NULL,
  principal        INTEGER NOT NULL,
  outstanding      INTEGER NOT NULL,
  interest_rate    REAL NOT NULL DEFAULT 5,
  issued_game_day  INTEGER NOT NULL,
  due_game_day     INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'defaulted', 'repaid')),
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_loans_borrower ON bank_loans (borrower_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_loans_lender ON bank_loans (lender_id, status);

-- Iflas kayitlari (belge 20): tasfiye sonucu.
CREATE TABLE IF NOT EXISTS bankruptcies (
  id             TEXT PRIMARY KEY,
  debtor_id      TEXT NOT NULL,
  net_worth      INTEGER NOT NULL,
  total_debt     INTEGER NOT NULL,
  liquidated     INTEGER NOT NULL,
  game_day       INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bankruptcies_debtor ON bankruptcies (debtor_id);

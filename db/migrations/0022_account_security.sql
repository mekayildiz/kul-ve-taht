-- Hesap guvenligi: oturum takibi, iki adimli dogrulama (TOTP) ve
-- kurtarma kodlari (tasarim belgesi 21.1).
--
-- Amac: oturumlarin listelenmesi/iptal edilmesi, opsiyonel TOTP tabanli 2FA
-- ve hesap kurtarma kodlari. E-posta ile kod gonderimi gerektirmez; tamami
-- 0 TL (Workers/D1 ucretsiz katman) icinde calisir.

-- 1) Sunucu tarafi oturum kaydi. Token'in kendisi ASLA saklanmaz; yalnizca
--    SHA-256 ozeti tutulur. Boylece D1 sizsa bile oturum ele gecirilemez.
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip_hash TEXT;

-- 2) Iki adimli dogrulama (TOTP) durumu. Sir ASLA duz metin saklanmaz;
--    uygulama katmaninda sifrelenmis (AES-GCM) olarak tutulur.
ALTER TABLE accounts ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN totp_secret TEXT;

-- 3) Tek kullanimlik kurtarma kodlari (hash'lenmis).
CREATE TABLE IF NOT EXISTS account_recovery_codes (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recovery_account ON account_recovery_codes(account_id);

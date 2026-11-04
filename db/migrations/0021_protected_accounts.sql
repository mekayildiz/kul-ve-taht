-- Korumali hesap (kurucu/yonetici hesabi).
--
-- Sorun: bir yonetici yanlislikla ya da kotu niyetle kurucu hesabini
-- banlayabilir veya rolunu dusurebilir; bu durumda yonetim tamamen kilitlenir.
-- Cozum: `protected = 1` olan hesap icin durum (ban/askiya alma) ve rol
-- degisikligi SUNUCU tarafinda reddedilir. Bayrak yalnizca dogrudan D1
-- uzerinden (wrangler) kaldirilabilir; boylece panelden geri alinamaz.
ALTER TABLE accounts ADD COLUMN protected INTEGER NOT NULL DEFAULT 0;

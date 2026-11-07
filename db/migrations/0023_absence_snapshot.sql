-- "Yoklugunda ne oldu" ozeti (tasarim belgesi 6, 19).
--
-- Sorun: dunya saati ve zamanlanmis tur, oyuncu cevrimdisiyken karakteri
-- ilerletir (aclik, saglik, yara iyilesmesi, yaslanma, olum). Oyuncu geri
-- dondugunde ne oldugunu goremez; dunya "cansiz" hisseder.
--
-- Cozum: oyuncunun son gorulme anindaki KUCUK bir anlik goruntusu saklanir.
-- Donuste bu goruntu ile guncel durum karsilastirilip aradaki fark ozetlenir.
-- Tam envanter kopyasi tutulmaz (depolama dostu): yalnizca ozet alanlari.

ALTER TABLE character_state ADD COLUMN last_seen_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_state ADD COLUMN last_seen_json TEXT;

# Veritabanı Migration'ları

D1 (SQLite) migration'ları `0001_*.sql`, `0002_*.sql` … sırasıyla eklenir.

- Şema, tasarım belgesi 21.2'deki varlık gruplarına göre E1.4'te oluşturulur.
- Sağlayıcı-bağımsız katman: yalnızca SQLite/libSQL ortak SQL alt kümesi kullanılır.
- D1'de PostgreSQL RLS yoktur; yetkilendirme sunucu tarafında uygulanır.
- Her migration ileri/geri denenebilir olmalıdır.

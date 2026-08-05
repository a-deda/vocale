-- Typen op een schermtoetsenbord kost ruwweg twee keer zoveel tijd per teken
-- als op een fysiek toetsenbord. De snelheidsdrempel houdt daar nu rekening
-- mee, met geschatte tarieven (180 ms tegen 340 ms per teken).
--
-- Door het medium per review vast te leggen zijn die schattingen later te
-- toetsen: samen met `response_ms` en de antwoordlengte is het werkelijke
-- tiktarief per medium gewoon uit de historie af te leiden.
ALTER TABLE review_logs ADD COLUMN IF NOT EXISTS input_medium TEXT;

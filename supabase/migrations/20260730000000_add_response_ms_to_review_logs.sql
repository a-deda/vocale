-- Reactietijd (tijd tot de eerste toets) werd alleen tijdens de sessie gebruikt
-- voor de speed-upgrade en daarna weggegooid. Zonder deze kolom is "tijd tot
-- eerste toets" op het overzicht niet uit historische data af te leiden.
ALTER TABLE review_logs ADD COLUMN response_ms INTEGER;

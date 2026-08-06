-- De beoordeling wordt niet meer op de volledige reactietijd gebaseerd maar op
-- de tijd tot de eerste toetsaanslag: het herinneren zelf, zonder tiktijd.
--
-- Eerder werd die tiktijd geschat en van de reactietijd afgetrokken. Wie sneller
-- typte dan het aangenomen tarief raakte daardoor ruim een seconde echte
-- denktijd kwijt, en kwam dus altijd op het maximum uit.
--
-- `response_ms` blijft de tijd tot Enter; deze kolom is wat de planning stuurt.
ALTER TABLE review_logs ADD COLUMN IF NOT EXISTS recall_ms INTEGER;

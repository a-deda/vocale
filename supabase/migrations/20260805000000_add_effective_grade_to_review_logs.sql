-- Snelheid bepaalt niet langer een van twee uitkomsten maar een vloeiende
-- schaal tussen goed en moeiteloos. De toegepaste beoordeling kan daardoor
-- gebroken zijn (3,4 bijvoorbeeld), en dat past niet in `grade`: die kolom is
-- een SMALLINT met een check op 1 t/m 4.
--
-- `grade` blijft dus de afgeronde bucket voor bestaande queries, en de
-- werkelijk toegepaste waarde komt hiernaast te staan. Zonder deze kolom is
-- niet te reconstrueren welk interval er destijds uit het model kwam.
ALTER TABLE review_logs ADD COLUMN IF NOT EXISTS effective_grade DOUBLE PRECISION;

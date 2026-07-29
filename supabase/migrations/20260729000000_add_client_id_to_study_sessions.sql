-- Idempotent opslaan van studiesessies.
--
-- De app zet een afgeronde les eerst in een lokale outbox en stuurt hem daarna
-- naar de server. Mislukt dat (offline, tab gesloten voordat het antwoord
-- binnen was), dan wordt hij later opnieuw verstuurd. Zonder sleutel van de
-- client zou zo'n herhaalde poging een dubbele rij opleveren; met client_id
-- wordt het een upsert die precies één rij oplevert.

ALTER TABLE public.study_sessions
ADD COLUMN IF NOT EXISTS client_id UUID;

-- Niet-partieel: ON CONFLICT kan alleen een volledige unieke index gebruiken.
-- Bestaande rijen hebben client_id NULL en die gelden als onderling verschillend,
-- dus die blijven gewoon naast elkaar bestaan.
CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_user_client_id_key
  ON public.study_sessions (user_id, client_id);

-- INSERT ... ON CONFLICT DO UPDATE vereist naast de insert-policy ook een
-- update-policy, anders faalt een herhaalde poging op de conflictregel.
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.study_sessions;
CREATE POLICY "Users can update their own sessions"
  ON public.study_sessions FOR UPDATE
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

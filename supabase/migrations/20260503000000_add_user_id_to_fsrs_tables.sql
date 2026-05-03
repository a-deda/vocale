-- Voeg user_id toe aan card_fsrs_states en review_logs voor eenvoudigere RLS
ALTER TABLE card_fsrs_states ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE review_logs      ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

-- Vul user_id in via de words-tabel (voor bestaande rijen)
UPDATE card_fsrs_states cfs
SET user_id = w.user_id
FROM words w
WHERE w.id = cfs.card_id
  AND cfs.user_id = '';

UPDATE review_logs rl
SET user_id = w.user_id
FROM words w
WHERE w.id = rl.card_id
  AND rl.user_id = '';

-- Verwijder DEFAULT '' nu alle rijen gevuld zijn
ALTER TABLE card_fsrs_states ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE review_logs      ALTER COLUMN user_id DROP DEFAULT;

-- Vervang EXISTS-gebaseerde policies door eenvoudige user_id-check
DROP POLICY IF EXISTS "select own fsrs states"  ON card_fsrs_states;
DROP POLICY IF EXISTS "insert own fsrs states"  ON card_fsrs_states;
DROP POLICY IF EXISTS "update own fsrs states"  ON card_fsrs_states;
DROP POLICY IF EXISTS "delete own fsrs states"  ON card_fsrs_states;
DROP POLICY IF EXISTS "select own review logs"  ON review_logs;
DROP POLICY IF EXISTS "insert own review logs"  ON review_logs;

CREATE POLICY "select own fsrs states" ON card_fsrs_states FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "insert own fsrs states" ON card_fsrs_states FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "update own fsrs states" ON card_fsrs_states FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "delete own fsrs states" ON card_fsrs_states FOR DELETE
  USING (user_id = auth.uid()::text);

CREATE POLICY "select own review logs" ON review_logs FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "insert own review logs" ON review_logs FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Index voor snelle gebruikersquery
CREATE INDEX IF NOT EXISTS idx_card_fsrs_states_user ON card_fsrs_states (user_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_user      ON review_logs (user_id);

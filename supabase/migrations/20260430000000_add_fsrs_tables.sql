-- card_fsrs_states: één rij per (kaart, modus) combinatie
CREATE TABLE card_fsrs_states (
  card_id          TEXT    NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  mode             TEXT    NOT NULL CHECK (mode IN ('typed_nl_it','typed_it_nl','listen_type','mc','self_assess')),
  stability        DOUBLE PRECISION,
  difficulty       DOUBLE PRECISION,
  due_date         DATE,
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (card_id, mode)
);

ALTER TABLE card_fsrs_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own fsrs states" ON card_fsrs_states FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM words
    WHERE words.id = card_fsrs_states.card_id
    AND words.user_id = auth.uid()::text
  ));

CREATE POLICY "insert own fsrs states" ON card_fsrs_states FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM words
    WHERE words.id = card_fsrs_states.card_id
    AND words.user_id = auth.uid()::text
  ));

CREATE POLICY "update own fsrs states" ON card_fsrs_states FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM words
    WHERE words.id = card_fsrs_states.card_id
    AND words.user_id = auth.uid()::text
  ));

CREATE POLICY "delete own fsrs states" ON card_fsrs_states FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM words
    WHERE words.id = card_fsrs_states.card_id
    AND words.user_id = auth.uid()::text
  ));

-- review_logs: audit-trail van elke FSRS-review
CREATE TABLE review_logs (
  id             UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id        TEXT           NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  mode           TEXT           NOT NULL,
  grade          SMALLINT       NOT NULL CHECK (grade BETWEEN 1 AND 4),
  r_at_review    DOUBLE PRECISION,
  s_before       DOUBLE PRECISION,
  s_after        DOUBLE PRECISION NOT NULL,
  d_before       DOUBLE PRECISION,
  d_after        DOUBLE PRECISION NOT NULL,
  interval_days  INTEGER        NOT NULL,
  reviewed_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

ALTER TABLE review_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own review logs" ON review_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM words
    WHERE words.id = review_logs.card_id
    AND words.user_id = auth.uid()::text
  ));

CREATE POLICY "insert own review logs" ON review_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM words
    WHERE words.id = review_logs.card_id
    AND words.user_id = auth.uid()::text
  ));

-- Index voor snelle sessie-opbouw
CREATE INDEX idx_card_fsrs_states_due ON card_fsrs_states (due_date) WHERE due_date IS NOT NULL;

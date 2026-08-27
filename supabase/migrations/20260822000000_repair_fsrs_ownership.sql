-- Beoordelingen die niet meer van je lijken te zijn.
--
-- Symptoom: een woord staat na een sessie netjes in het overzicht, en is de
-- volgende dag weer verdwenen — waarna het opnieuw als kennismaking langskomt
-- en weer op drie dagen wordt gezet.
--
-- Oorzaak: `card_fsrs_states` en `review_logs` dragen `user_id` als TEXT,
-- terwijl `words.user_id` een UUID is. De RLS-policies vergelijken met
-- `auth.uid()::text`. Klopt de waarde niet exact, dan is de rij onzichtbaar voor
-- SELECT maar bezet hij nog wél de primaire sleutel (card_id, mode). De upsert
-- valt dan in de conflict-tak, raakt nul rijen en meldt géén fout: het lijkt
-- opgeslagen, maar bij het volgende laden is er niets.
--
-- Deze migratie trekt het eigenaarschap gelijk met het woord waar de rij bij
-- hoort. Expliciet casten naar text, want dat is precies de naad.
UPDATE card_fsrs_states cfs
SET    user_id = w.user_id::text
FROM   words w
WHERE  w.id::text = cfs.card_id
  AND  cfs.user_id IS DISTINCT FROM w.user_id::text;

UPDATE review_logs rl
SET    user_id = w.user_id::text
FROM   words w
WHERE  w.id::text = rl.card_id
  AND  rl.user_id IS DISTINCT FROM w.user_id::text;

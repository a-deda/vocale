-- Herstel van geschiedenis die door een onvolledige lading is overschreven.
--
-- Wat er misging: de app haalde `card_fsrs_states` op met één kale select.
-- Supabase geeft per verzoek hooguit `max-rows` rijen terug (standaard 1000) en
-- meldt dat niet. Boven die grens kwam een deel van de states niet binnen. Zo'n
-- woord leek gloednieuw, kwam opnieuw in de sessie, en de beurt werd als eerste
-- beurt geboekt: stabiliteit terug naar ~3 dagen. Die reset overschreef de rij.
--
-- De review-logs zijn nooit overschreven, dus wat een woord ooit bereikt had
-- staat er nog. Een woord kan maar één keer een eerste beurt hebben (s_before is
-- dan leeg); meerdere zulke regels voor hetzelfde paar zijn het bewijs van een
-- reset, en alleen die paren worden hier aangeraakt.
--
-- Meet eerst hoeveel het er zijn:
--
--   select count(*) from (
--     select card_id, mode from review_logs
--     where s_before is null
--     group by card_id, mode having count(*) > 1
--   ) t;
--
-- Kanttekening: een woord dat in de tussentijd écht vergeten is, wordt hiermee
-- te hoog teruggezet. Het eerstvolgende foute antwoord haalt het vanzelf weer
-- omlaag; zonder herstel begint zo'n woord opnieuw op drie dagen.

WITH reset_pairs AS (
  SELECT card_id, mode
  FROM review_logs
  WHERE s_before IS NULL
  GROUP BY card_id, mode
  HAVING count(*) > 1
),
peak AS (
  SELECT DISTINCT ON (l.card_id, l.mode)
         l.card_id, l.mode, l.s_after, l.d_after
  FROM review_logs l
  JOIN reset_pairs p ON p.card_id = l.card_id AND p.mode = l.mode
  ORDER BY l.card_id, l.mode, l.s_after DESC
)
UPDATE card_fsrs_states c
SET stability  = peak.s_after,
    difficulty = peak.d_after,
    -- Bij 90% gewenste retentie is het interval gelijk aan de stabiliteit,
    -- afgerond en met hetzelfde plafond van 365 dagen als de app hanteert.
    due_date   = COALESCE(c.last_reviewed_at, now())::date
               + LEAST(GREATEST(round(peak.s_after)::int, 1), 365)
FROM peak
WHERE peak.card_id = c.card_id
  AND peak.mode    = c.mode
  AND (c.stability IS NULL OR c.stability < peak.s_after);

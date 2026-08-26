import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ANCHOR_DAYS } from '@/lib/fsrs';
import type { StatsLog } from '@/lib/stats';

/**
 * Zoveel recente reviews haalt het statistiekenscherm op. Het venster dat de
 * store laadt staat op 500 — genoeg voor de cijfers op het overzicht, maar bij
 * dagelijks gebruik nog geen drie weken.
 */
const RECENT_WINDOW = 5000;

/** Rij zoals de smalle select hem teruggeeft. */
interface LogRow {
  card_id:     string;
  s_before:    number | null;
  s_after:     number;
  reviewed_at: string;
  think_ms:    number | null;
}

const toLog = (row: LogRow): StatsLog => ({
  cardId:     row.card_id,
  sBefore:    row.s_before,
  sAfter:     row.s_after,
  reviewedAt: row.reviewed_at,
  thinkMs:    row.think_ms,
});

const COLUMNS = 'card_id, s_before, s_after, reviewed_at, think_ms';

export interface ReviewHistory {
  /** Een venster op de laatste reviews: denktijd, terugval, introductietempo. */
  recent: StatsLog[];
  /**
   * Élke keer dat een woord de verankerdrempel passeerde, in beide richtingen,
   * over de hele levensduur van de app.
   */
  crossings: StatsLog[];
}

/**
 * De review-historie waar de statistieken op rekenen — twee lijsten met een
 * verschillende reikwijdte, omdat de blokken een verschillende vraag stellen.
 *
 * Denktijd, terugval en het introductietempo gaan over hoe het er *nu* voor
 * staat; daar is een venster het juiste antwoord. De maandstrook van blok 1
 * kijkt terug tot het eerste woord, en die mag niet afhangen van hoe diep het
 * venster toevallig reikt: ontbreekt een maand, dan telt de terugloop daar nul
 * overschrijdingen af en loopt de lijn vlak door op de huidige waarde. Je zou
 * dan zien dat je vorig jaar al net zoveel woorden vast had als nu.
 *
 * Daarom worden de overschrijdingen apart en ongelimiteerd opgehaald. Een woord
 * gaat hooguit een paar keer over de drempel, dus dat zijn er over jaren een
 * paar honderd — een fractie van de reviews eromheen.
 *
 * Het venster van de store wordt niet opgehoogd: dat zou elke app-start duurder
 * maken voor een scherm dat je zelden opent. Er is ook geen laadscherm — de
 * pagina rendert meteen op wat de store al heeft en schuift de diepere historie
 * eronder zodra die binnen is.
 */
export function useReviewHistory(fallback: StatsLog[]): ReviewHistory {
  const [recent, setRecent] = useState<StatsLog[] | null>(null);
  const [crossings, setCrossings] = useState<StatsLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from('review_logs')
        .select(COLUMNS)
        .order('reviewed_at', { ascending: false })
        .limit(RECENT_WINDOW);
      if (!cancelled && !error && data) setRecent(data.map(toLog));
    })();

    void (async () => {
      // Een eerste beurt heeft `s_before IS NULL` en valt buiten `lt`. Dat klopt:
      // `initialStability` komt niet hoger dan W[3] ≈ 15,7 dagen, dus zo'n beurt
      // kan de drempel onmogelijk halen. De rekenlaag leest `sBefore ?? 0` en
      // zou hem anders wél als overschrijding tellen.
      const { data, error } = await supabase
        .from('review_logs')
        .select(COLUMNS)
        .or(
          `and(s_before.lt.${ANCHOR_DAYS},s_after.gte.${ANCHOR_DAYS}),` +
          `and(s_before.gte.${ANCHOR_DAYS},s_after.lt.${ANCHOR_DAYS})`,
        )
        .order('reviewed_at', { ascending: false });
      if (!cancelled && !error && data) setCrossings(data.map(toLog));
    })();

    return () => { cancelled = true; };
  }, []);

  // Mislukt de overschrijdingen-query, dan blijft het venster over: een kortere
  // historie, en verder niets kapot.
  return {
    recent:    recent ?? fallback,
    crossings: crossings ?? recent ?? fallback,
  };
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StatsLog } from '@/lib/stats';

/**
 * Zoveel reviews haalt het statistiekenscherm op. Het venster dat de store laadt
 * staat op 500 — genoeg voor de cijfers op het overzicht, maar bij dagelijks
 * gebruik nog geen drie weken, en de maandstaven van blok 1 kijken verder terug.
 */
const DEEP_WINDOW = 5000;

/**
 * De review-historie waar de statistieken op rekenen.
 *
 * Het venster van de store wordt niet opgehoogd: dat zou elke app-start duurder
 * maken voor een scherm dat je zelden opent. In plaats daarvan haalt dit scherm
 * zijn eigen, diepere venster op — met alleen de vijf kolommen die de sommen
 * gebruiken, zodat tien keer zoveel rijen alsnog een kleinere overdracht is.
 *
 * Er is geen laadscherm: de pagina rendert meteen op wat de store al heeft en
 * schuift de diepere historie eronder zodra die binnen is. Mislukt de query, dan
 * blijft het ondiepe venster staan — minder maanden, verder niets kapot.
 */
export function useReviewHistory(fallback: StatsLog[]): StatsLog[] {
  const [deep, setDeep] = useState<StatsLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from('review_logs')
        .select('card_id, s_before, s_after, reviewed_at, think_ms')
        .order('reviewed_at', { ascending: false })
        .limit(DEEP_WINDOW);

      if (cancelled || error || !data) return;
      setDeep(data.map(row => ({
        cardId:     row.card_id,
        sBefore:    row.s_before,
        sAfter:     row.s_after,
        reviewedAt: row.reviewed_at,
        thinkMs:    row.think_ms,
      })));
    })();

    return () => { cancelled = true; };
  }, []);

  return deep ?? fallback;
}

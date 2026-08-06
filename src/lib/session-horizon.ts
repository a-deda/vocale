import { FSRS_MODES } from '@/lib/fsrs';
import type { FsrsMode, FsrsState } from '@/lib/fsrs';

/** Eén of meer dagen verder dan een yyyy-mm-dd-sleutel. */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * De states zoals een sessie met deze horizon ze moet zien.
 *
 * Bij vooruitwerken kijkt de sessie verder dan vandaag, en dan komt alles in
 * beeld wat tot die dag vervalt. Wat je vandaag al hebt gehad hoort daar niet
 * bij: een fout antwoord komt op één dag te staan, dus zonder deze filter zou
 * je datzelfde woord in de volgende ronde meteen weer voor je kaak krijgen.
 *
 * De state blijft staan, alleen de vervaldatum gaat buiten de horizon. Hem
 * weghalen zou het woord als gloednieuw laten tellen, met een kennismaking als
 * gevolg.
 */
export function statesForHorizon(
  states: Partial<Record<FsrsMode, FsrsState>>,
  horizon: string,
  today: string,
): Partial<Record<FsrsMode, FsrsState>> {
  if (horizon <= today) return states;

  const kept: Partial<Record<FsrsMode, FsrsState>> = { ...states };
  for (const mode of FSRS_MODES) {
    const state = kept[mode];
    if (!state?.lastReviewedAt?.startsWith(today)) continue;
    kept[mode] = { ...state, dueDate: addDaysKey(horizon, 1) };
  }
  return kept;
}

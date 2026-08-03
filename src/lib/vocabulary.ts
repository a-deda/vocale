import { Word, StudySession } from '@/types/word';
import { ANCHOR_DAYS, addDays, daysBetween, strongestState, wordState } from '@/lib/fsrs';
import type { FsrsMode, FsrsState, WordState } from '@/lib/fsrs';
import type { FsrsStatesMap, ReviewLogRow } from '@/lib/store';

/** De modus waarin herhalingen gepland worden; die draagt de vervaldatum. */
const SCHEDULING_MODE: FsrsMode = 'typed_nl_it';

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

export interface StateCounts {
  lapsed:   number;
  active:   number;
  anchored: number;
  new:      number;
  total:    number;
}

export interface WeakWord {
  id:        string;
  original:  string;
  stability: number;
}

export interface Rhythm {
  /** 14 dagen, oudste eerst; true = die dag geoefend. */
  days:     boolean[];
  studied:  number;
  streak:   number;
}

export interface Overview {
  dueToday:      number;
  backlog:       number;
  dueTomorrow:   number;
  dueThisWeek:   number;
  counts:        StateCounts;
  /** Gemiddelde stabiliteit in dagen over alles wat een state heeft. */
  shelfLife:     number | null;
  weakest:       WeakWord[];
  recentlyAnchored: string[];
  rhythm:        Rhythm;
  /** Gemiddelde tijd tot de eerste toets in ms, over de gelogde reviews. */
  avgResponseMs: number | null;
  /** Dagen sinds de laatste sessie; null als er nog nooit een sessie was. */
  daysAway:      number | null;
}

function statesOf(word: Word, fsrsStates: FsrsStatesMap): Partial<Record<FsrsMode, FsrsState>> {
  return fsrsStates[word.id] ?? {};
}

/** Vervaldatum van het woord: die van de modus waarin herhalingen gepland worden. */
function dueDateOf(states: Partial<Record<FsrsMode, FsrsState>>): string | null {
  return states[SCHEDULING_MODE]?.dueDate ?? null;
}

export function countStates(words: Word[], fsrsStates: FsrsStatesMap, today: string): StateCounts {
  const counts: StateCounts = { lapsed: 0, active: 0, anchored: 0, new: 0, total: words.length };
  for (const word of words) {
    const state: WordState = wordState(statesOf(word, fsrsStates), today);
    counts[state === 'new' ? 'new' : state]++;
  }
  return counts;
}

/**
 * Hoeveel woorden er per dag vervallen, veertien dagen vooruit.
 * Alleen gebruikt door schermen die de vervalstrook tonen.
 */
export function decayByDay(
  words: Word[], fsrsStates: FsrsStatesMap, today: string, days = 14,
): { date: string; label: string; count: number }[] {
  const strip: { date: string; label: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    strip.push({
      date,
      label: i === 0 ? 'vandaag' : DAY_NAMES[new Date(date).getDay()],
      count: 0,
    });
  }
  const index = new Map(strip.map((d, i) => [d.date, i]));
  for (const word of words) {
    const due = dueDateOf(statesOf(word, fsrsStates));
    if (due === null) continue;
    const i = index.get(due);
    if (i !== undefined) strip[i].count++;
  }
  return strip;
}

/** Woorden met de laagste stabiliteit: die verdwijnen het eerst. */
export function weakestWords(
  words: Word[], fsrsStates: FsrsStatesMap, limit = 3,
): WeakWord[] {
  return words
    .map(word => {
      const best = strongestState(statesOf(word, fsrsStates));
      return best?.stability != null
        ? { id: word.id, original: word.original, stability: best.stability }
        : null;
    })
    .filter((w): w is WeakWord => w !== null)
    .sort((a, b) => a.stability - b.stability)
    .slice(0, limit);
}

/**
 * Woorden die onlangs de verankerdrempel passeerden. Uit de review-logs, want
 * alleen daar staat de stabiliteit van vóór de review — de huidige state weet
 * niet meer wanneer de grens werd gepasseerd.
 */
export function recentlyAnchored(
  words: Word[], logs: ReviewLogRow[], limit = 3,
): string[] {
  const byId = new Map(words.map(w => [w.id, w.original]));
  const seen = new Set<string>();
  const originals: string[] = [];

  for (const log of [...logs].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))) {
    if (originals.length >= limit) break;
    if (seen.has(log.cardId)) continue;
    const crossed = (log.sBefore ?? 0) < ANCHOR_DAYS && log.sAfter >= ANCHOR_DAYS;
    if (!crossed) continue;
    const original = byId.get(log.cardId);
    if (!original) continue;
    seen.add(log.cardId);
    originals.push(original);
  }
  return originals;
}

/** Ritme over veertien dagen: op welke dagen is er geoefend, en hoeveel op rij. */
export function rhythmOf(sessions: StudySession[], today: string, days = 14): Rhythm {
  const studiedDays = new Set(sessions.map(s => {
    const d = new Date(s.date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));

  const window: boolean[] = [];
  for (let i = days - 1; i >= 0; i--) window.push(studiedDays.has(addDays(today, -i)));

  // Een streak die vandaag nog niet is aangevuld loopt door tot gisteren; pas
  // als ook gisteren leeg is, is het ritme gebroken.
  let streak = 0;
  let cursor = studiedDays.has(today) ? 0 : 1;
  while (studiedDays.has(addDays(today, -cursor))) {
    streak++;
    cursor++;
  }

  return { days: window, studied: window.filter(Boolean).length, streak };
}

export function buildOverview(
  words:      Word[],
  fsrsStates: FsrsStatesMap,
  sessions:   StudySession[],
  logs:       ReviewLogRow[],
  today:      string,
): Overview {
  const tomorrow = addDays(today, 1);
  const weekEnd  = addDays(today, 6);

  let dueToday = 0, backlog = 0, dueTomorrow = 0, dueThisWeek = 0;
  const stabilities: number[] = [];

  for (const word of words) {
    const states = statesOf(word, fsrsStates);
    const best   = strongestState(states);
    if (best?.stability != null) stabilities.push(best.stability);

    const due = dueDateOf(states);
    if (due === null) continue;
    if (due < today)       backlog++;
    else if (due === today) dueToday++;
    if (due === tomorrow)  dueTomorrow++;
    if (due <= weekEnd)    dueThisWeek++;
  }

  const responseTimes = logs
    .map(l => l.responseMs)
    .filter((ms): ms is number => ms != null && ms > 0);

  const lastSession = sessions
    .map(s => new Date(s.date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    dueToday,
    backlog,
    dueTomorrow,
    dueThisWeek,
    counts:    countStates(words, fsrsStates, today),
    shelfLife: stabilities.length > 0
      ? Math.round(stabilities.reduce((a, b) => a + b, 0) / stabilities.length)
      : null,
    weakest:          weakestWords(words, fsrsStates),
    recentlyAnchored: recentlyAnchored(words, logs),
    rhythm:           rhythmOf(sessions, today),
    avgResponseMs: responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null,
    daysAway: lastSession
      ? daysBetween(
          `${lastSession.getFullYear()}-${String(lastSession.getMonth() + 1).padStart(2, '0')}-${String(lastSession.getDate()).padStart(2, '0')}`,
          today,
        )
      : null,
  };
}

/** Nederlandse getalnotatie: komma als decimaalteken. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

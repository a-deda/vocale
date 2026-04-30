// FSRS-5 algoritme — zie https://github.com/open-spaced-repetition/fsrs4anki/wiki

// ─── CONSTANTEN ──────────────────────────────────────────────────────────────

const F = 19 / 81;
const C = -0.5;
const DESIRED_RETENTION = 0.9;

const W = [
  0.40255, 1.18385, 3.173,   15.69105, 7.1949,  0.5345, 1.4604,
  0.0046,  1.54575, 0.1192,   1.01925,  1.9395,  0.11,   0.29605,
  2.2698,  0.2315,  2.9898,   0.51655,  0.6621,
];

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type FsrsMode =
  | 'typed_nl_it'
  | 'typed_it_nl'
  | 'listen_type'
  | 'mc'
  | 'self_assess';

export const FSRS_MODES: FsrsMode[] = [
  'typed_nl_it',
  'typed_it_nl',
  'listen_type',
  'mc',
  'self_assess',
];

export const GRADE = {
  FORGOT: 1,
  HARD:   2,
  GOOD:   3,
  EASY:   4,
} as const;
export type FsrsGrade = typeof GRADE[keyof typeof GRADE];

export interface FsrsState {
  stability:      number | null;
  difficulty:     number | null;
  dueDate:        string | null; // YYYY-MM-DD
  lastReviewedAt: string | null; // ISO timestamp
}

export function emptyFsrsState(): FsrsState {
  return { stability: null, difficulty: null, dueDate: null, lastReviewedAt: null };
}

export interface FsrsReviewLog {
  cardId:       string;
  mode:         FsrsMode;
  grade:        FsrsGrade;
  rAtReview:    number | null;
  sBefore:      number | null;
  sAfter:       number;
  dBefore:      number | null;
  dAfter:       number;
  intervalDays: number;
  reviewedAt:   string;
}

export interface QueueItem {
  cardId:  string;
  mode:    FsrsMode;
  dueDate: string | null;
}

// ─── KERN FORMULES ───────────────────────────────────────────────────────────

export function retrievability(t: number, S: number): number {
  return Math.pow(1 + F * (t / S), C);
}

export function nextInterval(S: number): number {
  const raw = (S / F) * (Math.pow(DESIRED_RETENTION, 1 / C) - 1);
  return Math.max(1, Math.round(raw));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function initialStability(grade: FsrsGrade): number {
  return W[grade - 1];
}

export function initialDifficulty(grade: FsrsGrade): number {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

export function updateDifficulty(D: number, grade: FsrsGrade): number {
  const delta = -W[6] * (grade - 3);
  return clamp(D + delta * ((10 - D) / 9), 1, 10);
}

export function stabilityAfterSuccess(
  D: number, S: number, R: number, grade: FsrsGrade
): number {
  const tD = 11 - D;
  const tS = Math.pow(S, -W[9]);
  const tR = Math.exp(W[10] * (1 - R)) - 1;
  const h  = grade === GRADE.HARD ? W[15] : 1.0;
  const b  = grade === GRADE.EASY ? W[16] : 1.0;
  const c  = Math.exp(W[8]);
  return S * (1 + tD * tS * tR * h * b * c);
}

export function stabilityAfterFailure(D: number, S: number, R: number): number {
  const dF = Math.pow(D, -W[12]);
  const sF = Math.pow(S + 1, W[13]) - 1;
  const rF = Math.exp(W[14] * (1 - R));
  return Math.min(dF * sF * rF * W[11], S);
}

// ─── REVIEW UITVOEREN ────────────────────────────────────────────────────────

export function reviewCard(
  state: FsrsState,
  grade: FsrsGrade,
  today: string // YYYY-MM-DD
): { newState: FsrsState; logPartial: Omit<FsrsReviewLog, 'cardId' | 'mode'> } {
  const isNew    = state.stability === null;
  const sBefore  = state.stability;
  const dBefore  = state.difficulty;
  let   rNow: number | null = null;

  let newS: number;
  let newD: number;

  if (isNew) {
    newS = initialStability(grade);
    newD = initialDifficulty(grade);
  } else {
    const lastDate = state.lastReviewedAt
      ? state.lastReviewedAt.split('T')[0]
      : (state.dueDate ?? today);
    const t = daysBetween(lastDate, today);
    rNow = retrievability(Math.max(1, t), state.stability!);
    newD = updateDifficulty(state.difficulty!, grade);

    newS = grade === GRADE.FORGOT
      ? stabilityAfterFailure(newD, state.stability!, rNow)
      : stabilityAfterSuccess(newD, state.stability!, rNow, grade);
  }

  const interval = nextInterval(newS);
  const newState: FsrsState = {
    stability:      newS,
    difficulty:     newD,
    dueDate:        addDays(today, interval),
    lastReviewedAt: new Date().toISOString(),
  };

  return {
    newState,
    logPartial: {
      grade,
      rAtReview:    rNow,
      sBefore,
      sAfter:       newS,
      dBefore,
      dAfter:       newD,
      intervalDays: interval,
      reviewedAt:   new Date().toISOString(),
    },
  };
}

// ─── GRADE BEPALEN PER MODUS ─────────────────────────────────────────────────

export function determineGrade(
  mode:        FsrsMode,
  matchResult: 'correct' | 'almost' | 'wrong',
  selfRating?: FsrsGrade,
): FsrsGrade {
  if (mode === 'mc') {
    return matchResult === 'correct' ? GRADE.HARD : GRADE.FORGOT;
  }
  if (mode === 'self_assess') {
    return selfRating ?? GRADE.GOOD;
  }
  // typed_nl_it, typed_it_nl, listen_type
  if (matchResult === 'correct') return GRADE.GOOD;
  if (matchResult === 'almost')  return GRADE.HARD;
  return GRADE.FORGOT;
}

/**
 * Upgrade GOOD → EASY bij razendsnel beantwoorden van getypte modi.
 * Geldt alleen voor typed/listen, niet voor MC of zelfbeoordeling.
 */
export function adjustGradeBySpeed(
  grade:         FsrsGrade,
  mode:          FsrsMode,
  responseTimeMs: number,
  wordLength:    number,
): FsrsGrade {
  if (grade !== GRADE.GOOD) return grade;
  if (mode === 'mc' || mode === 'self_assess') return grade;
  const threshold = 4000 + wordLength * 300; // 4s + 300ms/teken
  return responseTimeMs <= threshold ? GRADE.EASY : grade;
}

// ─── SESSIE OPBOUWEN ─────────────────────────────────────────────────────────

const PRIORITY: FsrsMode[] = [
  'typed_nl_it',
  'typed_it_nl',
  'listen_type',
  'self_assess',
  'mc',
];

export function buildSession(
  cardStates: Record<string, Partial<Record<FsrsMode, FsrsState>>>,
  today: string,
  maxReviews: number,
): QueueItem[] {
  const queue: QueueItem[] = [];

  for (const cardId of Object.keys(cardStates)) {
    const states   = cardStates[cardId];
    const dueModes = FSRS_MODES.filter(mode => {
      const s = states?.[mode];
      return !s || s.dueDate === null || s.dueDate <= today;
    });
    if (dueModes.length === 0) continue;

    const chosenMode = PRIORITY.find(m => dueModes.includes(m))!;
    const s = states?.[chosenMode];
    queue.push({ cardId, mode: chosenMode, dueDate: s?.dueDate ?? null });
  }

  // Nieuwste kaarten (dueDate === null) komen eerst, daarna oplopend op datum
  queue.sort((a, b) => {
    if (a.dueDate === null && b.dueDate === null) return 0;
    if (a.dueDate === null) return -1;
    if (b.dueDate === null) return 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return queue.slice(0, maxReviews);
}

// ─── MASTERY SCORE VANUIT FSRS ────────────────────────────────────────────────

/**
 * Bereken beheersingscore (0–100) op basis van gemiddelde FSRS-stabiliteit
 * over alle modi met een ingevulde state. Maximale stabiliteit = 365 dagen.
 */
export function getFsrsMasteryScore(
  states: Partial<Record<FsrsMode, FsrsState>>
): number {
  const stabilities = FSRS_MODES
    .map(m => states[m]?.stability)
    .filter((s): s is number => s != null);
  if (stabilities.length === 0) return 0;
  const avg = stabilities.reduce((a, b) => a + b, 0) / stabilities.length;
  return Math.round(Math.min(100, (avg / 365) * 100));
}

/** Voorspel het volgende interval (in dagen) voor een gegeven grade + state. */
export function previewInterval(state: FsrsState, grade: FsrsGrade, today: string): number {
  const { newState } = reviewCard(state, grade, today);
  return nextInterval(newState.stability!);
}

/** Leesbare intervaltekst voor de FSRS-grade-knoppen op de flashcard. */
export function fsrsIntervalText(state: FsrsState, grade: FsrsGrade, today: string): string {
  const days = previewInterval(state, grade, today);
  if (days === 1) return '1 dag';
  if (days < 7)  return `${days} dagen`;
  if (days < 30) return `${Math.round(days / 7)} weken`;
  return `${Math.round(days / 30)} maanden`;
}

// ─── LABELS ──────────────────────────────────────────────────────────────────

export const MODE_LABELS: Record<FsrsMode, string> = {
  typed_nl_it: 'Productie',
  typed_it_nl: 'Vertalen',
  listen_type: 'Luisteren',
  mc:          'Multiple Choice',
  self_assess: 'Flashcard',
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

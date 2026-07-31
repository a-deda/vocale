// FSRS-5 algoritme — zie https://github.com/open-spaced-repetition/fsrs4anki/wiki

// ─── CONSTANTEN ──────────────────────────────────────────────────────────────

const F = 19 / 81;
const C = -0.5;
export const DESIRED_RETENTION = 0.9;

export const W = [
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
  /** Tijd tot de eerste toets, in ms. Null voor modi zonder invoer. */
  responseMs:   number | null;
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
): { newState: FsrsState; logPartial: Omit<FsrsReviewLog, 'cardId' | 'mode' | 'responseMs'> } {
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
    return matchResult === 'correct' ? GRADE.GOOD : GRADE.FORGOT;
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

// Mode waarin geïntroduceerde woorden geproduceerd worden (typen, NL → IT).
const TYPED_MODE: FsrsMode = 'typed_nl_it';

// Van de gloednieuwe woorden in één sessie krijgen er hooguit zoveel een
// luister-intro; de rest wordt via meerkeuze geïntroduceerd. Zo blijft het
// aandeel audio-oefeningen behapbaar.
const MAX_NEW_INTRO_LISTEN = 7;

/**
 * Bouw de wachtrij voor een studiesessie.
 *
 * Kernregel (zie PRODUCT-doel): luisteren en meerkeuze zijn uitsluitend
 * kennismakings­vormen voor gloednieuwe woorden. Zodra een woord op welke
 * manier dan ook is geïntroduceerd, wordt het altijd getypt — nooit meer
 * via luisteren of meerkeuze.
 *
 * Per woord geldt dus exact één van drie situaties:
 *   1. Al getypt (heeft `typed_nl_it`-state) → enkel getypte reviews als ze due zijn.
 *   2. Geïntroduceerd via luisteren/meerkeuze maar nog niet getypt → moet nú getypt.
 *   3. Gloednieuw (geen enkele state) → één kennismaking via luisteren óf meerkeuze.
 */
export function buildSession(
  cardStates: Record<string, Partial<Record<FsrsMode, FsrsState>>>,
  today: string,
  maxReviews: number,
): QueueItem[] {
  const overdue:  QueueItem[] = []; // getypte reviews die due zijn (situatie 1)
  const toType:   QueueItem[] = []; // geïntroduceerd maar nog niet getypt (situatie 2)
  const brandNew: string[]    = []; // nog nooit gezien (situatie 3)

  for (const cardId of Object.keys(cardStates)) {
    const states = cardStates[cardId] ?? {};
    const hasTyped    = !!states[TYPED_MODE];
    const hasAnyState = FSRS_MODES.some(m => !!states[m]);

    if (hasTyped) {
      // Situatie 1: al geïntroduceerd én getypt → uitsluitend getypte reviews.
      const s = states[TYPED_MODE]!;
      if (s.dueDate && s.dueDate <= today) {
        overdue.push({ cardId, mode: TYPED_MODE, dueDate: s.dueDate });
      }
      continue;
    }

    if (hasAnyState) {
      // Situatie 2: ooit gezien (luisteren/meerkeuze), maar nog niet via typen
      // geproduceerd → de enige volgende stap is typen, nooit opnieuw herkennen.
      toType.push({ cardId, mode: TYPED_MODE, dueDate: null });
      continue;
    }

    // Situatie 3: gloednieuw woord, nog nooit gezien.
    brandNew.push(cardId);
  }

  // Verdeel nieuwe woorden over luister- en meerkeuze-intro's.
  fisherYates(brandNew);
  const recognitionNew: QueueItem[] = brandNew.map((cardId, idx) => ({
    cardId,
    mode:    idx < MAX_NEW_INTRO_LISTEN ? 'listen_type' : 'mc',
    dueDate: null,
  }));

  // Oudste due-datum eerst; cap op maxReviews zodat een sessie nooit
  // ongelimiteerd groeit bij een grote achterstand.
  overdue.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const cappedOverdue = overdue.slice(0, maxReviews);

  fisherYates(toType);
  fisherYates(recognitionNew);

  // Vul de resterende ruimte afwisselend met te-typen en nieuwe woorden.
  const freeSlots = Math.max(0, maxReviews - cappedOverdue.length);
  const pools     = [toType, recognitionNew].filter(p => p.length > 0);

  const pool: QueueItem[] = [];
  let i = 0;
  while (pool.length < freeSlots && pools.some(p => p.length > 0)) {
    const p = pools[i % pools.length];
    if (p.length > 0) pool.push(p.shift()!);
    i++;
  }

  fisherYates(pool);
  return [...cappedOverdue, ...pool];
}

function fisherYates<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─── WOORDTOESTAND VANUIT FSRS ───────────────────────────────────────────────

/** Onder deze retrievability op vandaag heet een woord vervallen (wankel). */
export const LAPSED_RETRIEVABILITY = 0.7;

/** Vanaf deze stabiliteit heet een woord verankerd (vast). */
export const ANCHOR_DAYS = 90;

/** wankel = vervallen · actief = in de cyclus · vast = verankerd · nieuw = nooit gezien */
export type WordState = 'lapsed' | 'active' | 'anchored' | 'new';

/** De sterkste state over alle modi; die bepaalt hoe het woord ervoor staat. */
export function strongestState(
  states: Partial<Record<FsrsMode, FsrsState>>
): FsrsState | null {
  let best: FsrsState | null = null;
  for (const mode of FSRS_MODES) {
    const s = states[mode];
    if (s?.stability == null) continue;
    if (!best || s.stability > best.stability!) best = s;
  }
  return best;
}

/**
 * Retrievability van een woord op `today` — de kans dat je het nu nog weet.
 * Null voor een woord dat nog geen enkele review heeft gehad.
 */
export function retrievabilityToday(state: FsrsState, today: string): number | null {
  if (state.stability == null) return null;
  const lastDate = state.lastReviewedAt ? state.lastReviewedAt.split('T')[0] : null;
  if (!lastDate) return null;
  return retrievability(Math.max(1, daysBetween(lastDate, today)), state.stability);
}

/** Gemiddelde stabiliteit in dagen — hoe lang je woordenschat nog meegaat. */
export function shelfLifeDays(state: FsrsState | null): number | null {
  return state?.stability ?? null;
}

export function wordState(
  states: Partial<Record<FsrsMode, FsrsState>>,
  today: string,
): WordState {
  const best = strongestState(states);
  if (!best) return 'new';

  // Vervallen gaat vóór verankerd: een woord dat je 300 dagen niet zag is
  // wankel, hoe hoog de stabiliteit ook stond toen je het voor het laatst deed.
  const r = retrievabilityToday(best, today);
  if (r !== null && r < LAPSED_RETRIEVABILITY) return 'lapsed';
  if (best.stability! >= ANCHOR_DAYS) return 'anchored';
  return 'active';
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

export function daysBetween(from: string, to: string): number {
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

export function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

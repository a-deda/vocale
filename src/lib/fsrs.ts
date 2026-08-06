// FSRS-5 algoritme — zie https://github.com/open-spaced-repetition/fsrs4anki/wiki

import type { InputMedium } from '@/lib/input-medium';

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
  /**
   * De werkelijk toegepaste beoordeling, die tussen goed en moeiteloos gebroken
   * kan zijn. `grade` hierboven is de afgeronde bucket, want de databasekolom
   * is een SMALLINT met een check op 1 t/m 4; zonder deze waarde is de historie
   * niet te reproduceren.
   */
  effectiveGrade: number;
  /**
   * Waarmee er getypt werd. Het tiktarief per medium is nu geschat; met dit
   * veld erbij is het achteraf uit de eigen historie te toetsen.
   */
  inputMedium:  InputMedium | null;
  intervalDays: number;
  reviewedAt:   string;
  /**
   * Tijd van kaart tot bevestiging, in ms — inclusief de tijd die het typen
   * kostte. Null voor modi zonder invoer en bij overslaan.
   */
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

/**
 * De vier ankerwaarden W[0..3] horen bij hele grades. Bij een gebroken grade
 * wordt ertussen geïnterpoleerd — zonder dat zou `W[2.4]` `undefined` opleveren
 * en de stabiliteit van een gloednieuw woord op NaN zetten.
 */
export function initialStability(grade: number): number {
  const g  = clamp(grade, 1, 4);
  const lo = Math.floor(g);
  const hi = Math.ceil(g);
  const a  = W[lo - 1];
  const b  = W[hi - 1];
  return a + (b - a) * (g - lo);
}

/** Al continu in `grade`: de exponent slikt een gebroken waarde zonder meer. */
export function initialDifficulty(grade: number): number {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

/**
 * Werkt ongewijzigd met een gebroken grade: de term is al lineair in `grade`,
 * dus een 3,5 levert precies de helft van de stap die een 4 zou opleveren.
 */
export function updateDifficulty(D: number, grade: number): number {
  const delta = -W[6] * (grade - 3);
  return clamp(D + delta * ((10 - D) / 9), 1, 10);
}

export function stabilityAfterSuccess(
  D: number, S: number, R: number, grade: number
): number {
  const tD = 11 - D;
  const tS = Math.pow(S, -W[9]);
  const tR = Math.exp(W[10] * (1 - R)) - 1;
  const h  = grade === GRADE.HARD ? W[15] : 1.0;
  // De enige harde vertakking in het model, nu geïnterpoleerd: tussen goed en
  // moeiteloos loopt de bonus vloeiend van 1 naar W[16]. Bij een hele 3 of 4
  // komt er exact uit wat er vóór deze wijziging uitkwam.
  const b  = grade > GRADE.GOOD ? 1 + (grade - GRADE.GOOD) * (W[16] - 1) : 1.0;
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
  /** Mag gebroken zijn tussen goed en moeiteloos; zie `speedFactor`. */
  grade: number,
  today: string // YYYY-MM-DD
): { newState: FsrsState; logPartial: Omit<FsrsReviewLog, 'cardId' | 'mode' | 'responseMs' | 'inputMedium'> } {
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
      grade:          clamp(Math.round(grade), 1, 4) as FsrsGrade,
      effectiveGrade: grade,
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
 * Tiktarief per teken. Ruwweg 65 woorden per minuut op een fysiek toetsenbord
 * tegenover 34 op glas. Geschat, niet gemeten — daarom slaan we het medium bij
 * elke review op, zodat deze twee getallen later uit de historie te toetsen zijn.
 */
const PER_CHAR_MS: Record<InputMedium, number> = { keyboard: 180, touch: 340 };

/** Binnen een seconde bedacht is moeiteloos; acht seconden is met moeite. */
const RECALL_FAST_MS = 1000;
const RECALL_SLOW_MS = 8000;

/**
 * Wat er van de reactietijd overblijft als de tiktijd eraf gaat: de tijd die
 * het herinneren zelf kostte.
 *
 * Eerder lag er een budget *omheen* — herinnertijd plus tiktijd, met een band
 * eromheen. Dat schaalde de hele band mee met de woordlengte, waardoor een lang
 * woord ook een ruimere herinnermarge kreeg. Aftrekken is zuiverder: tikken is
 * overhead, herinneren is wat we meten.
 */
export function recallMs(
  responseMs: number, answerLength: number, medium: InputMedium,
): number {
  return responseMs - answerLength * PER_CHAR_MS[medium];
}

/**
 * Hoe moeiteloos ging dit, van 0 (niet) tot 1 (volledig)?
 *
 * `repeat` is waar zodra dit woord eerder in dezelfde sessie is beantwoord —
 * na een kennismaking via meerkeuze of luisteren, of bij een herkansing. Dan
 * komt het antwoord uit het werkgeheugen en zegt de snelheid niets over wat er
 * over weken nog van over is. FSRS-5 kent daar aparte gewichten voor
 * (W[17]/W[18]); die zijn hier niet geïmplementeerd, dus vervalt de bonus.
 */
export function speedFactor(
  responseMs: number | null,
  answerLength: number,
  medium: InputMedium,
  repeat = false,
): number {
  if (responseMs === null || !Number.isFinite(responseMs)) return 0;
  if (repeat) return 0;
  const r = recallMs(responseMs, answerLength, medium);
  if (r <= RECALL_FAST_MS) return 1;
  if (r >= RECALL_SLOW_MS) return 0;
  return (RECALL_SLOW_MS - r) / (RECALL_SLOW_MS - RECALL_FAST_MS);
}

/**
 * De beoordeling zoals hij daadwerkelijk wordt opgeslagen, snelheid inbegrepen.
 *
 * Eén ingang voor zowel het opslaan als het tonen van het interval. Werden die
 * los samengesteld, dan kon het getoonde `+N d` afwijken van wat er gepland werd:
 * de ene plek paste de snelheidsupgrade toe en de andere niet.
 *
 * Zonder invoertijd (`null`, bij overslaan en meerkeuze) is er geen upgrade.
 */
export function gradeForAnswer(
  mode:         FsrsMode,
  matchResult:  'correct' | 'almost' | 'wrong',
  responseMs:   number | null,
  answerLength: number,
  medium:       InputMedium,
  /** Is dit woord eerder in deze sessie al beantwoord? */
  repeat = false,
): number {
  const base = determineGrade(mode, matchResult);
  // Alleen een goed antwoord kan meeschalen; bijna en fout staan vast, en
  // meerkeuze meet geen tijd die iets zegt over herinneren.
  if (base !== GRADE.GOOD) return base;
  if (mode === 'mc' || mode === 'self_assess') return base;
  return GRADE.GOOD + speedFactor(responseMs, answerLength, medium, repeat);
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
export function previewInterval(state: FsrsState, grade: number, today: string): number {
  const { newState } = reviewCard(state, grade, today);
  return nextInterval(newState.stability!);
}

/**
 * Een aantal dagen als leesbare periode.
 *
 * Dagen lopen door tot vier weken en weken tot ruim vier maanden. Grover
 * afronden wist juist het verschil uit dat een snel antwoord oplevert: een
 * gloednieuw woord komt niet verder dan 16 dagen, en in weken zouden 14 tot 17
 * dagen allemaal "2 weken" heten.
 */
export function intervalText(days: number): string {
  if (days === 1)  return '1 dag';
  if (days < 28)   return `${days} dagen`;
  if (days < 120) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? '1 week' : `${weeks} weken`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? '1 maand' : `${months} maanden`;
}

/**
 * Hetzelfde interval, bondig: `+6 d`, `+4 wk`, `+2 mnd`. Zelfde grenzen als
 * `intervalText`, zodat de twee weergaven niet uiteen kunnen lopen.
 */
export function intervalShort(days: number): string {
  if (days < 28)  return `+${days} d`;
  if (days < 120) return `+${Math.round(days / 7)} wk`;
  return `+${Math.round(days / 30)} mnd`;
}

/**
 * Hoe ver is dit woord op weg naar verankerd? 0 bij een dag, 1 vanaf de
 * verankerdrempel. Logaritmisch, want het verschil tussen één en zes dagen
 * telt zwaarder dan tussen tachtig en vijfentachtig.
 *
 * Dit stuurt de kleur van het briefje: die is volledig goud op het moment dat
 * het woord `ANCHOR_DAYS` haalt. De kleur codeert dus een toestand die het
 * systeem al kent, niet een versiering.
 */
export function intervalTone(days: number): number {
  if (days <= 1) return 0;
  return clamp(Math.log(days) / Math.log(ANCHOR_DAYS), 0, 1);
}

/** Leesbare intervaltekst voor een grade + state. */
export function fsrsIntervalText(state: FsrsState, grade: number, today: string): string {
  return intervalText(previewInterval(state, grade, today));
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

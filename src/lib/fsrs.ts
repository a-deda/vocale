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
   * De werkelijk toegepaste beoordeling, die rond goed gebroken kan zijn — een
   * tikje omhoog bij een vlot antwoord, een tikje omlaag bij een moeizaam.
   * `grade` hierboven is de afgeronde bucket, want de databasekolom is een
   * SMALLINT met een check op 1 t/m 4; zonder deze waarde is de historie niet
   * te reproduceren.
   */
  effectiveGrade: number;
  /**
   * Waarmee er getypt werd. De beoordeling hangt hier niet meer aan — denktijd
   * wordt gemeten, niet uit een tiktarief teruggerekend — maar het blijft staan
   * omdat het bij het uitpluizen van de historie uitmaakt of een trage beurt op
   * glas of op een fysiek toetsenbord plaatsvond.
   */
  inputMedium:  InputMedium | null;
  intervalDays: number;
  reviewedAt:   string;
  /**
   * Tijd van kaart tot bevestiging, in ms — inclusief de tijd die het typen
   * kostte. Null voor modi zonder invoer en bij overslaan. Beschrijft het tempo
   * van de sessie; de beoordeling hangt aan `thinkMs`.
   */
  responseMs:   number | null;
  /**
   * Tijd van kaart tot de eerste toetsaanslag, in ms — het herinneren zelf,
   * zonder de tijd die het typen kostte. Dit is de maat waarop de snelheids-
   * bijstelling rust. Null zolang er niets is ingetypt (overslaan, meerkeuze).
   */
  thinkMs:      number | null;
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

/**
 * Verder dan een jaar plannen we niet vooruit.
 *
 * Bij 90% gewenste retentie reduceert `nextInterval` tot precies de stabiliteit,
 * dus zonder plafond schuift een sterk woord jaren weg — en één misrekening van
 * het model is dan een woord dat je kwijt bent zonder het te merken. Het plafond
 * raakt alleen de plandatum: de stabiliteit blijft staan, want die draagt 'vast',
 * de houdbaarheid en de beheersingscore. `getFsrsMasteryScore` hanteert dezelfde
 * 365 dagen als plafond van beheersing.
 *
 * De prijs is dat een vast woord terugkomt terwijl je het nog voor ~95% weet in
 * plaats van 90%. Dat remt meteen de groei van de stabiliteit (de `tR`-term in
 * `stabilityAfterSuccess` ongeveer halveert), dus het loopt niet weg.
 */
export const MAX_INTERVAL_DAYS = 365;

export function nextInterval(S: number): number {
  const raw = (S / F) * (Math.pow(DESIRED_RETENTION, 1 / C) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Een vervaldatum van vóór het plafond, teruggebracht tot het plafond.
 *
 * Woorden die eerder op twee jaar vooruit werden gezet blijven anders staan waar
 * ze staan; het plafond zou dan pas na jaren overal doorwerken. Dit rekent bij het
 * inlezen af met die erfenis. De rij in de database blijft ongemoeid tot de
 * eerstvolgende review er vanzelf een nette datum overheen schrijft.
 */
export function cappedDueDate(state: FsrsState): string | null {
  if (!state.dueDate || !state.lastReviewedAt) return state.dueDate;
  const ceiling = addDays(state.lastReviewedAt.split('T')[0], MAX_INTERVAL_DAYS);
  return state.dueDate > ceiling ? ceiling : state.dueDate;
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
  // Beide vertakkingen in het model zijn geïnterpoleerd, zodat de schaal aan
  // weerszijden van 'goed' vloeiend loopt: onder de 3 zakt de demping van 1
  // naar W[15], erboven klimt de bonus van 1 naar W[16]. Bij een hele 2, 3 of
  // 4 komt er exact uit wat FSRS-5 voorschrijft.
  const h  = grade < GRADE.GOOD
    ? 1 + (GRADE.GOOD - clamp(grade, GRADE.HARD, GRADE.GOOD)) * (W[15] - 1)
    : 1.0;
  const b  = grade > GRADE.GOOD
    ? 1 + (clamp(grade, GRADE.GOOD, GRADE.EASY) - GRADE.GOOD) * (W[16] - 1)
    : 1.0;
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

/**
 * Het tijdstip van deze review, gestempeld op de dag waarmee gerekend wordt.
 *
 * `today` is de lokale dagsleutel van de aanroeper; `toISOString` geeft UTC. Wie
 * na middernacht studeert in een zone vóór UTC kreeg zo een stempel van de dag
 * ervóór: het model zag dan een tijdsverschil van een dag waar er geen was, en
 * een tweede beurt in dezelfde sessie zag er niet meer als dezelfde dag uit.
 * De datum komt daarom van de aanroeper, de kloktijd van de klok.
 */
function reviewTimestamp(today: string): string {
  return `${today}T${new Date().toISOString().split('T')[1]}`;
}

/**
 * Is dit een tweede beurt op dezelfde dag? Dan zegt hij niets over volgende week.
 *
 * Een herkansing na een fout is de normale aanleiding: je ziet het juiste
 * antwoord staan en typt het even later in. Zou die beurt als volwaardige
 * review tellen, dan zou het model met een tijdsverschil van nul rekenen —
 * afgerond naar één dag — en de houdbaarheid meteen weer optrekken. Precies het
 * woord dat je zojuist niet wist, zou dan verder weg komen te staan.
 *
 * FSRS is een model voor herhalingen over dágen. Wat binnen één dag gebeurt
 * hoort in de leerstap, niet in het geheugenmodel; het wordt wel gelogd.
 */
function isSameDayRepeat(state: FsrsState, today: string): boolean {
  if (state.stability === null || !state.lastReviewedAt) return false;
  return state.lastReviewedAt.split('T')[0] === today;
}

export function reviewCard(
  state: FsrsState,
  /** Mag gebroken zijn tussen moeizaam en moeiteloos; zie `speedFactor`. */
  grade: number,
  today: string // YYYY-MM-DD
): { newState: FsrsState; logPartial: Omit<FsrsReviewLog, 'cardId' | 'mode' | 'responseMs' | 'thinkMs' | 'inputMedium'> } {
  const isNew    = state.stability === null;
  const sBefore  = state.stability;
  const dBefore  = state.difficulty;
  let   rNow: number | null = null;

  // Tweede beurt vandaag: alles blijft staan, alleen het tijdstip schuift op.
  if (isSameDayRepeat(state, today)) {
    const interval = state.dueDate
      ? daysBetween(today, state.dueDate)
      : nextInterval(state.stability!);
    return {
      newState: { ...state, lastReviewedAt: reviewTimestamp(today) },
      logPartial: {
        grade:          clamp(Math.round(grade), 1, 4) as FsrsGrade,
        effectiveGrade: grade,
        rAtReview:      null,
        sBefore,
        sAfter:         state.stability!,
        dBefore,
        dAfter:         state.difficulty!,
        intervalDays:   interval,
        reviewedAt:     reviewTimestamp(today),
      },
    };
  }

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
    lastReviewedAt: reviewTimestamp(today),
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
      reviewedAt:   reviewTimestamp(today),
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
 * Denktijd: van het verschijnen van de kaart tot de eerste toetsaanslag.
 *
 * Dit is wat we willen weten — hoe lang duurde het voor het woord bovenkwam —
 * en het wordt nu gemeten in plaats van geschat. Eerder werd het uit de totale
 * reactietijd teruggerekend door er een geschat tiktarief per teken van af te
 * trekken. Wie sneller typte dan die schatting kwam op een negatieve denktijd
 * uit en kreeg dus altijd de volle bonus: je typsnelheid lekte zo in je
 * geheugenbeoordeling. De eerste aanslag kent dat probleem niet, en scheelt
 * bovendien twee aannames (het tarief zelf, en waarmee je typt).
 *
 * Binnen een seconde bedacht is moeiteloos; vanaf acht seconden is er geen
 * bonus meer, en vanaf vijftien seconden was het met moeite.
 */
export const THINK_FAST_MS    =  1000;
export const THINK_NEUTRAL_MS =  8000;
export const THINK_SLOW_MS    = 15000;

/**
 * De grootste verschuiving die snelheid aan de beoordeling mag geven.
 *
 * Klein met opzet. FSRS is leidend: de ankerwaarden voor 'goed' en 'moeiteloos'
 * liggen ver uit elkaar (3,2 tegenover 15,7 dagen op een nieuw woord) en de
 * groeibonus van een hele 4 verdrievoudigt de stap. Die hefboom hoort bij een
 * oordeel dat je bewust geeft, niet bij een klok die meekijkt. Met een zwaai van
 * 0,3 blijft snelheid een nuance binnen 'goed' in plaats van een overname.
 */
export const SPEED_SWING = 0.3;

/**
 * Hoe vlot ging dit? Van +1 (moeiteloos) via 0 (gewoon) naar −1 (met moeite).
 *
 * De schaal loopt bewust twee kanten op. Alleen belonen zou een schatting zijn
 * die maar één kant op kan afwijken, en dan stapelen de afwijkingen zich altijd
 * dezelfde kant op: intervallen die stelselmatig te ver vooruit lopen.
 */
export function speedFactor(thinkMs: number | null): number {
  if (thinkMs === null || !Number.isFinite(thinkMs)) return 0;
  if (thinkMs <= THINK_FAST_MS) return 1;
  if (thinkMs >= THINK_SLOW_MS) return -1;
  if (thinkMs <= THINK_NEUTRAL_MS) {
    return (THINK_NEUTRAL_MS - thinkMs) / (THINK_NEUTRAL_MS - THINK_FAST_MS);
  }
  return -(thinkMs - THINK_NEUTRAL_MS) / (THINK_SLOW_MS - THINK_NEUTRAL_MS);
}

/** Wanneer snelheid niets zegt over wat er over weken nog van het woord over is. */
export interface SpeedContext {
  /**
   * Is dit woord eerder in dezelfde sessie al beantwoord? Na een kennismaking
   * via meerkeuze of luisteren, of bij een herkansing, komt het antwoord uit het
   * werkgeheugen. FSRS-5 kent daar aparte gewichten voor (W[17]/W[18]); die zijn
   * hier niet geïmplementeerd, dus vervalt de bijstelling.
   */
  repeat?: boolean;
  /**
   * Is dit de allereerste review in deze modus? Dan bepaalt de beoordeling niet
   * een stap maar het startpunt, en die ankers liggen vijf keer uit elkaar. Eén
   * enkele blootstelling is het zwakste bewijs dat er is; daar hoort geen
   * hefboom aan. Dit vangt ook het woord dat gisteren via meerkeuze langskwam en
   * vandaag voor het eerst getypt wordt — binnen één sessie doet `repeat` dat,
   * maar die kennis overleeft het einde van de sessie niet.
   */
  firstReview?: boolean;
}

/**
 * De beoordeling zoals hij daadwerkelijk wordt opgeslagen, snelheid inbegrepen.
 *
 * Eén ingang voor zowel het opslaan als het tonen van het interval. Werden die
 * los samengesteld, dan kon het getoonde `+N d` afwijken van wat er gepland werd:
 * de ene plek paste de snelheidsbijstelling toe en de andere niet.
 */
export function gradeForAnswer(
  mode:        FsrsMode,
  matchResult: 'correct' | 'almost' | 'wrong',
  /** Tijd tot de eerste toetsaanslag; null bij overslaan en meerkeuze. */
  thinkMs:     number | null,
  { repeat = false, firstReview = false }: SpeedContext = {},
): number {
  const base = determineGrade(mode, matchResult);
  // Alleen een goed antwoord schaalt mee; bijna en fout staan vast, en
  // meerkeuze meet geen tijd die iets zegt over herinneren.
  if (base !== GRADE.GOOD) return base;
  if (mode === 'mc' || mode === 'self_assess') return base;
  if (repeat || firstReview) return base;
  return GRADE.GOOD + SPEED_SWING * speedFactor(thinkMs);
}

// ─── SESSIE OPBOUWEN ─────────────────────────────────────────────────────────

// Mode waarin geïntroduceerde woorden geproduceerd worden (typen, NL → IT).
const TYPED_MODE: FsrsMode = 'typed_nl_it';

/** De vormen waarmee een woord kennismaakt, vóórdat het getypt wordt. */
const INTRO_MODES: FsrsMode[] = ['listen_type', 'mc'];

/**
 * De state waarmee een beurt begint — en het startpunt van de eerste typebeurt.
 *
 * Voor typen zonder eigen state: de sterkste kennismaking telt mee in plaats van
 * dat het woord bij nul begint. De kennismaking gebeurt per ontwerp precies één
 * keer, dus die state ís wat er van het woord bekend is. Zonder dit levert elke
 * eerste typebeurt exact `initialStability(3)` = 3,17 op — drie dagen, hoe goed
 * je het woord ook kent — en vervalt bovendien de snelheidsbijstelling, omdat
 * het dan als eerste beurt telt.
 */
export function startingState(
  states: Partial<Record<FsrsMode, FsrsState>>,
  mode:   FsrsMode,
): FsrsState {
  const own = states[mode];
  if (own?.stability != null) return own;
  if (mode !== TYPED_MODE) return emptyFsrsState();

  let best: FsrsState | null = null;
  for (const intro of INTRO_MODES) {
    const s = states[intro];
    if (s?.stability == null) continue;
    if (!best || s.stability > best.stability!) best = s;
  }
  return best ?? emptyFsrsState();
}

/**
 * Wanneer komt een geïntroduceerd-maar-nog-niet-getypt woord aan de beurt?
 *
 * Op de vervaldatum die de kennismaking zelf opleverde. Zonder datum is dat nu.
 * Eerder stond hier `null` en kwam zo'n woord elke sessie terug tot het een keer
 * getypt was — ook als de kennismaking van gisteren pas over drie dagen vervalt.
 */
function introDue(states: Partial<Record<FsrsMode, FsrsState>>, today: string): string {
  let earliest: string | null = null;
  for (const intro of INTRO_MODES) {
    const state = states[intro];
    if (!state) continue;                          // die vorm is er niet geweest
    if (state.dueDate == null) return today;       // gezien, maar zonder planning
    if (earliest === null || state.dueDate < earliest) earliest = state.dueDate;
  }
  // Geen kennismaking om op te wachten — bijvoorbeeld een losse state uit een
  // andere modus. Dan is typen de enige volgende stap, en die mag nu.
  return earliest ?? today;
}

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
      // Wél op het ritme van de kennismaking: anders komt zo'n woord elke dag
      // terug tot het een keer getypt is.
      const due = introDue(states, today);
      if (due <= today) toType.push({ cardId, mode: TYPED_MODE, dueDate: due });
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

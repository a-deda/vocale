import { Word, StudySession } from '@/types/word';
import {
  ANCHOR_DAYS, FSRS_MODES, GRADE, addDays, emptyFsrsState, reviewCard, strongestState, wordState,
} from '@/lib/fsrs';
import type { FsrsMode, FsrsState, WordState } from '@/lib/fsrs';
import type { FsrsStatesMap, ReviewLogRow } from '@/lib/store';
import { rhythmOf } from '@/lib/vocabulary';
import type { Rhythm } from '@/lib/vocabulary';

/**
 * De rekenlaag onder het statistiekenscherm.
 *
 * Het overzicht kijkt veertien dagen vooruit en beantwoordt "wat moet ik nu
 * doen". Hier staat de andere vraag: levert dit werk iets op, en waar loopt het
 * vast. Dat betekent maanden terug én maanden vooruit, en dus andere sommen dan
 * die in `vocabulary.ts` — die blijft van het overzicht.
 *
 * Alles hier is puur: woorden, states, logs en sessies erin, cijfers eruit.
 */

/**
 * Wat de statistieken uit een review-log nodig hebben — smaller dan
 * `ReviewLogRow`. Dit scherm leest maanden terug in plaats van het venster dat
 * het overzicht laadt, en dan telt elke kolom die niet over de lijn hoeft.
 */
export type StatsLog = Pick<ReviewLogRow, 'cardId' | 'sBefore' | 'sAfter' | 'reviewedAt' | 'thinkMs'>;

const MONTHS      = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_FULL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                     'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** Het aandeel van de woordenschat waarop de horizon slaat. */
const HORIZON_SHARE = 0.9;

/**
 * Veiligheidsklep op de prognose, geen grens: de strook loopt door tot het
 * laatste woord vast is. Woorden waarvoor `anchorDate` niets teruggeeft landen
 * nooit, en zonder klep zou de strook dan eindeloos doorlopen.
 */
const MAX_PROJECTED_MONTHS = 36;

/** Onder zoveel gemeten antwoorden zegt de denktijd nog niets. */
export const THINK_TIME_MINIMUM = 50;

/**
 * Het aandeel woorden dat een woordsoort moet dragen voordat de uitsplitsing
 * iets betekent. Een grafiek over dertig van de vierhonderd woorden suggereert
 * een patroon dat er niet is.
 */
const POS_COVERAGE = 0.5;

/** De modus die de vervaldatum draagt; daarop wordt vooruitgerekend. */
const SCHEDULING_MODE: FsrsMode = 'typed_nl_it';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function addMonths(month: string, count: number): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 1 + count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `mei` — de as onder de staven. */
export function monthLabel(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

/** `maart 2027` — de horizon, voluit. */
export function monthFull(month: string): string {
  return `${MONTHS_FULL[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function statesOf(word: Word, fsrsStates: FsrsStatesMap): Partial<Record<FsrsMode, FsrsState>> {
  return fsrsStates[word.id] ?? {};
}

function stabilityOf(word: Word, fsrsStates: FsrsStatesMap): number | null {
  return strongestState(statesOf(word, fsrsStates))?.stability ?? null;
}

// ─── VAST WORDEN ─────────────────────────────────────────────────────────────

export interface AnchorPoint {
  month:     string;
  label:     string;
  /** Cumulatief aantal vaste woorden aan het eind van deze maand. */
  count:     number;
  /** Open staaf: dit is gerekend, niet gemeten. */
  projected: boolean;
}

export interface AnchorTrend {
  points: AnchorPoint[];
  /** `maart 2027`, of null als er te weinig is om op te rekenen. */
  horizon: string | null;
}

/**
 * Wanneer haalt dit woord de verankerdrempel, als je bijblijft en het goed doet?
 *
 * Niet geschat maar doorgerekend met het model zelf: telkens een goede beurt op
 * de vervaldatum, tot de stabiliteit 90 dagen haalt. Dat zijn typisch drie tot
 * vijf stappen. Zo zit er geen enkele eigen constante in de voorspelling — de
 * vorige versie had er drie, plus een handgeschreven mediaanfilter eroverheen.
 *
 * Null wanneer het woord binnen `maxSteps` niet convergeert; dat telt dan als
 * "niet te voorspellen" in plaats van als een verzonnen datum.
 */
export function anchorDate(
  start: FsrsState, from: string, maxSteps = 24,
): string | null {
  let state = start;
  // Begin op de vervaldatum als die nog komt: eerder oefenen doet het model niet.
  let date = start.dueDate && start.dueDate > from ? start.dueDate : from;

  for (let step = 0; step < maxSteps; step++) {
    const { newState } = reviewCard(state, GRADE.GOOD, date);
    // Een beurt die niets verschuift (tweede beurt op dezelfde dag) zou de lus
    // leeg laten draaien; dan is er niets meer te rekenen.
    if (newState.stability === state.stability && newState.dueDate === state.dueDate) return null;
    if ((newState.stability ?? 0) >= ANCHOR_DAYS) return date;
    state = newState;
    date  = newState.dueDate!;
  }
  return null;
}

/**
 * Hoeveel gloednieuwe woorden komen er per kalenderdag bij in de cyclus?
 *
 * Gemeten, niet aangenomen: het aantal woorden dat voor het eerst beoordeeld
 * werd, gedeeld door de dagen waarop er geoefend is, maal het aandeel dagen dat
 * je oefent. Zonder historie is er niets te meten en dus niets te voorspellen.
 */
export function introductionRate(logs: StatsLog[], rhythm: Rhythm): number | null {
  const firstReviewDays = new Map<string, number>();
  for (const log of logs) {
    if (log.sBefore !== null) continue; // niet de eerste beurt op dit woord
    const day = log.reviewedAt.slice(0, 10);
    firstReviewDays.set(day, (firstReviewDays.get(day) ?? 0) + 1);
  }
  if (firstReviewDays.size === 0) return null;

  const perStudyDay = [...firstReviewDays.values()].reduce((a, b) => a + b, 0) / firstReviewDays.size;
  const studyDayShare = rhythm.studied / rhythm.days.length;
  if (studyDayShare <= 0) return null;

  return perStudyDay * studyDayShare;
}

/**
 * De staven van blok 1: gemeten links, geprojecteerd rechts.
 *
 * Het gemeten deel loopt terug vanaf het huidige aantal vaste woorden: elke maand
 * eraf wat er in die maand netto bijkwam. De overschrijdingen staan in de logs —
 * `sBefore < 90 ≤ sAfter` is erover, andersom is eronder. Verder terug dan de
 * logs reiken kan niet, en daar houdt de strook dan ook op.
 *
 * Het vooruit-deel gaat over de woorden die je *nu* hebt. Wat je later toevoegt
 * zit er niet in; dat is een bewegend doel en zou de horizon betekenisloos maken.
 */
export function anchorTrend(
  words:      Word[],
  fsrsStates: FsrsStatesMap,
  logs:       StatsLog[],
  /** Élke passage van de drempel, over de hele levensduur — zie `useReviewHistory`. */
  crossings:  StatsLog[],
  rhythm:     Rhythm,
  today:      string,
): AnchorTrend {
  const nowMonth = monthOf(today);
  if (words.length === 0) return { points: [], horizon: null };

  // Dezelfde telling als de toestandsbalk op het overzicht: `wordState` zet een
  // woord dat je maanden niet zag op wankel, hoe hoog de stabiliteit ook stond.
  // Twee schermen die een ander getal "vast" noemen is erger dan een strengere maat.
  const anchoredNow = words.filter(w => wordState(statesOf(w, fsrsStates), today) === 'anchored').length;

  // ── gemeten ──
  // Netto per maand: erover is plus één, eronder is min één. Alleen de passages
  // tellen, dus een gewone review verschuift niets.
  const net = new Map<string, number>();
  for (const log of crossings) {
    const before = log.sBefore ?? 0;
    const step = before < ANCHOR_DAYS && log.sAfter >= ANCHOR_DAYS ? 1
      : before >= ANCHOR_DAYS && log.sAfter < ANCHOR_DAYS ? -1
      : 0;
    if (step === 0) continue;
    const month = monthOf(log.reviewedAt.slice(0, 10));
    net.set(month, (net.get(month) ?? 0) + step);
  }

  // De as begint waar de app in gebruik kwam: bij het vroegst toegevoegde woord.
  const firstMonth = words
    .map(w => monthOf(w.createdAt.slice(0, 10)))
    .reduce((a, b) => (b < a ? b : a), nowMonth);

  const measured: AnchorPoint[] = [{
    month: nowMonth, label: 'nu', count: anchoredNow, projected: false,
  }];
  let running = anchoredNow;
  let cursor  = nowMonth;
  // Terug door de maanden: haal er telkens af wat er in die maand bij kwam.
  while (cursor > firstMonth) {
    running -= net.get(cursor) ?? 0;
    cursor   = addMonths(cursor, -1);
    measured.unshift({
      month: cursor, label: monthLabel(cursor), count: Math.max(0, running), projected: false,
    });
  }

  // ── geprojecteerd ──
  const rate = introductionRate(logs, rhythm);
  const dates: (string | null)[] = [];
  let queued = 0;

  for (const word of words) {
    const states = statesOf(word, fsrsStates);
    if (wordState(states, today) === 'anchored') {
      dates.push(today); // staat er al
      continue;
    }

    const scheduled = states[SCHEDULING_MODE];
    if (scheduled?.stability != null) {
      dates.push(anchorDate(scheduled, today));
      continue;
    }

    // Nog nooit getypt. Wie al via luisteren of meerkeuze kennismaakte staat nu
    // in de wachtrij — dat woord begint vandaag aan zijn curve. De rest moet
    // eerst geïntroduceerd worden, en dat gaat op het gemeten tempo.
    if (FSRS_MODES.some(m => states[m]?.stability != null)) {
      dates.push(anchorDate(emptyFsrsState(), today));
      continue;
    }
    if (rate === null) { dates.push(null); continue; }
    queued += 1;
    dates.push(anchorDate(emptyFsrsState(), addDays(today, Math.ceil(queued / rate))));
  }

  const known = dates.filter((d): d is string => d !== null).sort();
  const target = Math.ceil(words.length * HORIZON_SHARE);
  const horizon = known.length >= target && target > 0
    ? monthFull(monthOf(known[target - 1]))
    : null;

  const points = [...measured];
  if (known.length > anchoredNow) {
    // Door tot het láátste woord vast is, niet tot de horizon: die noemt het
    // moment waarop negen van de tien er zijn, de strook toont de hele staart.
    const last = known[known.length - 1].slice(0, 7);
    for (let i = 1; i <= MAX_PROJECTED_MONTHS; i++) {
      const month = addMonths(nowMonth, i);
      const end   = addMonths(month, 1); // alles vóór de eerste van de maand erna
      points.push({
        month,
        label: monthLabel(month),
        count: known.filter(d => monthOf(d) < end).length,
        projected: true,
      });
      if (month >= last) break;
    }
  }

  return { points, horizon };
}

// ─── DE VORM VAN JE WOORDENSCHAT ─────────────────────────────────────────────

export interface Band {
  label: string;
  count: number;
}

const BAND_EDGES: { label: string; upto: number }[] = [
  { label: '1–7 d',    upto: 7 },
  { label: '7–30 d',   upto: 30 },
  { label: '30–90 d',  upto: 90 },
  { label: '90–365 d', upto: 365 },
  { label: '365+',     upto: Infinity },
];

export interface Shape {
  bands: Band[];
  /** Woorden zonder enige houdbaarheid; die vallen buiten de banden. */
  untouched: number;
}

/**
 * De verdeling over houdbaarheidsbanden.
 *
 * Het overzicht toont één gemiddelde, en dat verbergt de vorm: 300 dagen
 * gemiddeld kan betekenen dat alles rond de 300 zit, of dat de helft tegen het
 * jaarplafond staat en de rest op vijf dagen. Dat verschil bepaalt of je
 * woordenschat rust of aandacht vraagt.
 */
export function shapeOf(words: Word[], fsrsStates: FsrsStatesMap): Shape {
  const bands = BAND_EDGES.map(edge => ({ label: edge.label, count: 0 }));
  let untouched = 0;

  for (const word of words) {
    const stability = stabilityOf(word, fsrsStates);
    if (stability === null) { untouched++; continue; }
    bands[BAND_EDGES.findIndex(edge => stability < edge.upto)].count++;
  }
  return { bands, untouched };
}

// ─── DENKTIJD ────────────────────────────────────────────────────────────────

export interface ThinkTime {
  state:    Exclude<WordState, 'new'>;
  label:    string;
  medianMs: number;
}

const THINK_STATES: { state: Exclude<WordState, 'new'>; label: string }[] = [
  { state: 'lapsed',   label: 'wankel' },
  { state: 'active',   label: 'actief' },
  { state: 'anchored', label: 'vast'   },
];

/**
 * Hoe lang het herinneren duurt per toestand — de kern van wat de app beweert:
 * een woord dat vast zit, komt vanzelf.
 *
 * Mediaan, geen gemiddelde: één keer wegkijken van je scherm zou een gemiddelde
 * over een handvol beurten meteen onbruikbaar maken.
 *
 * Leeg tot er genoeg gemeten is. `thinkMs` bestaat pas sinds de denktijd echt
 * gemeten wordt in plaats van uit een tiktarief teruggerekend, dus de historie
 * draagt hem niet.
 */
export function thinkTimes(
  words: Word[], fsrsStates: FsrsStatesMap, logs: StatsLog[], today: string,
): ThinkTime[] {
  const stateById = new Map(words.map(w => [w.id, wordState(statesOf(w, fsrsStates), today)]));
  const buckets = new Map<WordState, number[]>();
  let measured = 0;

  for (const log of logs) {
    if (log.thinkMs == null || log.thinkMs <= 0) continue;
    const state = stateById.get(log.cardId);
    if (state === undefined || state === 'new') continue;
    if (!buckets.has(state)) buckets.set(state, []);
    buckets.get(state)!.push(log.thinkMs);
    measured++;
  }

  if (measured < THINK_TIME_MINIMUM) return [];

  return THINK_STATES
    .map(({ state, label }) => ({ state, label, medianMs: median(buckets.get(state) ?? []) }))
    .filter(row => row.medianMs > 0);
}

// ─── WAAR HET BLIJFT HAKEN ───────────────────────────────────────────────────

export interface LaggingWord {
  id:       string;
  original: string;
  /** Hoe vaak dit woord houdbaarheid verloor. */
  falls:    number;
}

/**
 * Woorden die zijn teruggevallen — niet de zwakste.
 *
 * Het overzicht toont al de wankelste woorden, en daar staan gewoon nieuwe
 * woorden tussen die nog nergens waren. Dit is een ander en bruikbaarder
 * gezelschap: woorden die je dácht te kennen en toch kwijtraakte.
 */
export function laggingWords(
  words: Word[], logs: StatsLog[], limit = 4,
): LaggingWord[] {
  const byId = new Map(words.map(w => [w.id, w.original]));
  const falls = new Map<string, number>();

  for (const log of logs) {
    if (log.sBefore === null || log.sAfter >= log.sBefore) continue;
    if (!byId.has(log.cardId)) continue;
    falls.set(log.cardId, (falls.get(log.cardId) ?? 0) + 1);
  }

  return [...falls.entries()]
    .map(([id, count]) => ({ id, original: byId.get(id)!, falls: count }))
    .sort((a, b) => b.falls - a.falls || a.original.localeCompare(b.original))
    .slice(0, limit);
}

export interface PartOfSpeechShelfLife {
  label: string;
  days:  number;
}

/**
 * Gemiddelde houdbaarheid per woordsoort — de enige uitsplitsing die voor een
 * taalleerder iets verandert aan wat hij doet.
 *
 * Leeg zolang te weinig woorden het veld dragen: `partOfSpeech` wordt niet
 * altijd ingevuld, en een uitsplitsing over een handvol woorden suggereert een
 * patroon dat er niet is.
 */
export function shelfLifeByPartOfSpeech(
  words: Word[], fsrsStates: FsrsStatesMap, limit = 3,
): PartOfSpeechShelfLife[] {
  const withStability = words.filter(w => stabilityOf(w, fsrsStates) !== null);
  if (withStability.length === 0) return [];

  const groups = new Map<string, number[]>();
  for (const word of withStability) {
    const pos = word.partOfSpeech?.trim();
    if (!pos) continue;
    if (!groups.has(pos)) groups.set(pos, []);
    groups.get(pos)!.push(stabilityOf(word, fsrsStates)!);
  }

  const covered = [...groups.values()].reduce((sum, list) => sum + list.length, 0);
  if (covered < withStability.length * POS_COVERAGE || groups.size < 2) return [];

  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([label, list]) => ({
      label,
      days: Math.round(list.reduce((a, b) => a + b, 0) / list.length),
    }));
}

// ─── ALLES BIJ ELKAAR ────────────────────────────────────────────────────────

export interface Stats {
  totalWords:   number;
  /** Woorden zonder enige houdbaarheid — de lege staat leunt hierop. */
  untouched:    number;
  addedThisMonth: number;
  anchored:     AnchorTrend;
  shape:        Shape;
  think:        ThinkTime[];
  lagging:      LaggingWord[];
  byPartOfSpeech: PartOfSpeechShelfLife[];
  rhythm:       Rhythm;
  /** Mediaan aantal woorden per sessie over het ritmevenster. */
  medianSessionWords: number | null;
}

/** Het ritmevenster van dit scherm; het overzicht kijkt veertien dagen. */
export const RHYTHM_DAYS = 90;

export function buildStats(
  words:      Word[],
  fsrsStates: FsrsStatesMap,
  sessions:   StudySession[],
  /** Een venster op de recente reviews; draagt denktijd, terugval en tempo. */
  logs:       StatsLog[],
  /** Élke passage van de drempel, ongelimiteerd; draagt de maandstrook. */
  crossings:  StatsLog[],
  today:      string,
): Stats {
  const rhythm    = rhythmOf(sessions, today, RHYTHM_DAYS);
  const shape     = shapeOf(words, fsrsStates);
  const nowMonth  = monthOf(today);
  const windowFrom = addDays(today, -(RHYTHM_DAYS - 1));

  const recentSizes = sessions
    .filter(s => s.wordsStudied > 0 && s.date.slice(0, 10) >= windowFrom)
    .map(s => s.wordsStudied);

  return {
    totalWords:     words.length,
    untouched:      shape.untouched,
    addedThisMonth: words.filter(w => monthOf(w.createdAt.slice(0, 10)) === nowMonth).length,
    anchored:       anchorTrend(words, fsrsStates, logs, crossings, rhythm, today),
    shape,
    think:          thinkTimes(words, fsrsStates, logs, today),
    lagging:        laggingWords(words, logs),
    byPartOfSpeech: shelfLifeByPartOfSpeech(words, fsrsStates),
    rhythm,
    medianSessionWords: recentSizes.length > 0 ? Math.round(median(recentSizes)) : null,
  };
}

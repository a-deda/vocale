import { describe, it, expect } from 'vitest';
import {
  buildSession, cappedDueDate, emptyFsrsState, FSRS_MODES, GRADE, gradeForAnswer, initialStability,
  intervalShort, intervalTone, MAX_INTERVAL_DAYS, nextInterval, previewInterval,
  reviewCard, speedFactor, SPEED_SWING, updateDifficulty, W,
} from '@/lib/fsrs';
import type { FsrsMode, FsrsState } from '@/lib/fsrs';

const TODAY = '2026-06-15';
const FUTURE = '2027-01-01';
const PAST = '2026-01-01';

function state(dueDate: string | null): FsrsState {
  return { stability: 5, difficulty: 5, dueDate, lastReviewedAt: '2026-06-10T10:00:00.000Z' };
}

type Card = Partial<Record<FsrsMode, FsrsState>>;

// In de praktijk plant buildSession alleen deze drie modi in, dus alleen
// hiervoor kunnen states ontstaan.
const REALISTIC_MODES: FsrsMode[] = ['listen_type', 'mc', 'typed_nl_it'];

describe('buildSession — kernregel: luisteren/meerkeuze alleen voor nieuwe woorden', () => {
  it('gloednieuw woord krijgt kennismaking via luisteren of meerkeuze, nooit typen', () => {
    const items = buildSession({ a: {} }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].cardId).toBe('a');
    expect(['listen_type', 'mc']).toContain(items[0].mode);
  });

  it('woord met luister-state (nog niet getypt) moet getypt worden', () => {
    const items = buildSession({ a: { listen_type: state(TODAY) } }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe('typed_nl_it');
  });

  it('woord met meerkeuze-state (nog niet getypt) moet getypt worden', () => {
    const items = buildSession({ a: { mc: state(TODAY) } }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe('typed_nl_it');
  });

  it('geïntroduceerd-maar-niet-getypt komt terug als typen, ook als herkennings-state in de toekomst staat', () => {
    const items = buildSession({ a: { listen_type: state(FUTURE) } }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe('typed_nl_it');
  });

  it('getypt woord dat due is → getypte review (nooit luisteren/meerkeuze)', () => {
    const items = buildSession({ a: { typed_nl_it: state(TODAY) } }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe('typed_nl_it');
  });

  it('getypt woord dat al due was (verleden) → getypte review', () => {
    const items = buildSession({ a: { typed_nl_it: state(PAST) } }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe('typed_nl_it');
  });

  it('getypt woord dat nog niet due is → niet ingepland', () => {
    const items = buildSession({ a: { typed_nl_it: state(FUTURE) } }, TODAY, 20);
    expect(items).toHaveLength(0);
  });

  it('getypt woord met oude luister-/meerkeuze-states herhaalt geen herkenning', () => {
    const items = buildSession(
      { a: { listen_type: state(PAST), mc: state(PAST), typed_nl_it: state(FUTURE) } },
      TODAY, 20,
    );
    // typed nog niet due → niets, en zeker geen listen/mc
    expect(items).toHaveLength(0);
  });
});

describe('buildSession — verdeling van nieuwe woorden', () => {
  it('eerste 7 nieuwe woorden krijgen luisteren, de rest meerkeuze', () => {
    const cards: Record<string, Card> = {};
    for (let i = 0; i < 15; i++) cards['c' + i] = {};
    const items = buildSession(cards, TODAY, 100);
    const listen = items.filter(i => i.mode === 'listen_type').length;
    const mc = items.filter(i => i.mode === 'mc').length;
    expect(listen).toBe(7);
    expect(mc).toBe(8);
    expect(items.every(i => i.mode === 'listen_type' || i.mode === 'mc')).toBe(true);
  });

  it('respecteert de maxReviews-cap', () => {
    const cards: Record<string, Card> = {};
    for (let i = 0; i < 50; i++) cards['c' + i] = {};
    const items = buildSession(cards, TODAY, 20);
    expect(items).toHaveLength(20);
  });

  it('due reviews krijgen voorrang en vullen de cap vóór nieuwe woorden', () => {
    const cards: Record<string, Card> = {};
    for (let i = 0; i < 25; i++) cards['due' + i] = { typed_nl_it: state(PAST) };
    for (let i = 0; i < 25; i++) cards['new' + i] = {};
    const items = buildSession(cards, TODAY, 20);
    expect(items).toHaveLength(20);
    // Alle slots zijn opgevuld door due reviews; geen nieuwe intro's meer.
    expect(items.every(i => i.mode === 'typed_nl_it')).toBe(true);
  });
});

describe('buildSession — invariant over willekeurige mix', () => {
  it('luisteren/meerkeuze verschijnt uitsluitend voor woorden zónder enige state', () => {
    for (let iter = 0; iter < 300; iter++) {
      const cards: Record<string, Card> = {};
      const N = 30;
      for (let i = 0; i < N; i++) {
        const c: Card = {};
        for (const m of REALISTIC_MODES) {
          if (Math.random() < 0.35) {
            c[m] = state(Math.random() < 0.5 ? TODAY : FUTURE);
          }
        }
        cards['c' + i] = c;
      }
      const items = buildSession(cards, TODAY, 1000);
      for (const it of items) {
        if (it.mode === 'listen_type' || it.mode === 'mc') {
          const st = cards[it.cardId];
          const hasAny = FSRS_MODES.some(m => !!st[m]);
          expect(hasAny).toBe(false);
        }
      }
    }
  });

  it('elke kaart komt hoogstens één keer in de wachtrij', () => {
    const cards: Record<string, Card> = {};
    for (let i = 0; i < 40; i++) {
      const r = Math.random();
      cards['c' + i] =
        r < 0.33 ? {} :
        r < 0.66 ? { listen_type: state(TODAY) } :
                   { typed_nl_it: state(PAST) };
    }
    const items = buildSession(cards, TODAY, 1000);
    const ids = items.map(i => i.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('zelfs een onverwachte losse state (geen listen/mc/typed) telt als geïntroduceerd → typen', () => {
    const items = buildSession({ a: { self_assess: state(TODAY) } }, TODAY, 20);
    expect(items).toHaveLength(1);
    expect(items[0].mode).toBe('typed_nl_it');
  });
});

describe('speedFactor — denktijd, twee kanten op', () => {
  it('binnen een seconde bedacht is volledig moeiteloos', () => {
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(500)).toBe(1);
    expect(speedFactor(1000)).toBe(1);
  });

  it('acht seconden denken is precies neutraal', () => {
    expect(speedFactor(8000)).toBe(0);
  });

  it('vanaf vijftien seconden was het met moeite', () => {
    expect(speedFactor(15000)).toBe(-1);
    expect(speedFactor(60000)).toBe(-1);
  });

  it('loopt monotoon af van moeiteloos naar met moeite', () => {
    const ms = [500, 1500, 3000, 5000, 8000, 10000, 13000, 20000];
    const factors = ms.map(speedFactor);
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }
    expect(factors[0]).toBe(1);
    expect(factors[factors.length - 1]).toBe(-1);
  });

  it('zonder gemeten tijd is er geen bijstelling', () => {
    expect(speedFactor(null)).toBe(0);
    expect(speedFactor(NaN)).toBe(0);
    expect(speedFactor(Infinity)).toBe(0);
  });
});

describe('gradeForAnswer — snelheid is een nuance, geen overname', () => {
  it('een vlot antwoord tilt de beoordeling hooguit met de zwaai op', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', 300))
      .toBeCloseTo(GRADE.GOOD + SPEED_SWING, 10);
  });

  it('een moeizaam antwoord duwt hem even ver omlaag', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', 20000))
      .toBeCloseTo(GRADE.GOOD - SPEED_SWING, 10);
  });

  it('blijft altijd binnen de zwaai rond goed — nooit een hele 4', () => {
    for (const ms of [0, 1, 100, 5000, 8000, 20000, 1e9]) {
      const g = gradeForAnswer('typed_nl_it', 'correct', ms);
      expect(g).toBeGreaterThanOrEqual(GRADE.GOOD - SPEED_SWING);
      expect(g).toBeLessThanOrEqual(GRADE.GOOD + SPEED_SWING);
      expect(g).toBeLessThan(GRADE.EASY);
    }
  });

  it('daartussen loopt het monotoon af', () => {
    const grades = [1000, 2000, 4000, 6000, 8000, 11000, 15000]
      .map(ms => gradeForAnswer('typed_nl_it', 'correct', ms));
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i]).toBeLessThan(grades[i - 1]);
    }
  });

  it('een herhaling binnen dezelfde sessie krijgt geen bijstelling', () => {
    // Na een kennismaking komt het woord uit het werkgeheugen; snelheid zegt
    // dan niets over wat er over weken nog van over is.
    expect(gradeForAnswer('typed_nl_it', 'correct', 200, { repeat: true })).toBe(GRADE.GOOD);
    expect(gradeForAnswer('typed_nl_it', 'correct', 20000, { repeat: true })).toBe(GRADE.GOOD);
  });

  it('de allereerste beurt in een modus krijgt geen bijstelling', () => {
    // Die beurt zet het startpunt, en de ankers voor goed en moeiteloos liggen
    // vijf keer uit elkaar. Eén blootstelling draagt die hefboom niet.
    expect(gradeForAnswer('typed_nl_it', 'correct', 200, { firstReview: true })).toBe(GRADE.GOOD);
    expect(gradeForAnswer('typed_nl_it', 'correct', 20000, { firstReview: true })).toBe(GRADE.GOOD);
  });

  it('snelheid redt een bijna- of fout antwoord niet', () => {
    expect(gradeForAnswer('typed_nl_it', 'almost', 100)).toBe(GRADE.HARD);
    expect(gradeForAnswer('typed_nl_it', 'wrong', 100)).toBe(GRADE.FORGOT);
  });

  it('zonder gemeten tijd blijft het een gewone goede beurt', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', null)).toBe(GRADE.GOOD);
  });

  it('meerkeuze wordt nooit bijgesteld, hoe snel ook', () => {
    expect(gradeForAnswer('mc', 'correct', 10)).toBe(GRADE.GOOD);
    expect(gradeForAnswer('mc', 'wrong', 10)).toBe(GRADE.FORGOT);
  });
});

describe('een woord dat al loopt toont een zichtbare schaal', () => {
  const RUNNING: FsrsState = {
    stability: 10, difficulty: 5,
    dueDate: TODAY, lastReviewedAt: '2026-06-05T10:00:00.000Z',
  };

  it('verschillende denktijden leveren verschillende labels op', () => {
    const labels = [1000, 4000, 8000, 12000, 15000].map(ms => {
      const g = gradeForAnswer('typed_nl_it', 'correct', ms);
      return intervalShort(previewInterval(RUNNING, g, TODAY));
    });
    // Geen enkel label mag samenvallen met zijn buur, anders is de schaal
    // onzichtbaar — dat was precies de klacht.
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('een moeizaam antwoord plant korter dan een vlot antwoord', () => {
    const traag = previewInterval(RUNNING, gradeForAnswer('typed_nl_it', 'correct', 20000), TODAY);
    const gewoon = previewInterval(RUNNING, GRADE.GOOD, TODAY);
    const vlot  = previewInterval(RUNNING, gradeForAnswer('typed_nl_it', 'correct', 500), TODAY);
    expect(traag).toBeLessThan(gewoon);
    expect(gewoon).toBeLessThan(vlot);
  });
});

describe('intervalShort en intervalTone', () => {
  it('kiest de eenheid op dezelfde grenzen als de lange vorm', () => {
    expect(intervalShort(6)).toBe('+6 d');
    // Dagen lopen door tot vier weken: een gloednieuw woord komt niet verder
    // dan 16 dagen, en in weken zou die hele schaal op "+2 wk" uitkomen.
    expect(intervalShort(16)).toBe('+16 d');
    expect(intervalShort(27)).toBe('+27 d');
    expect(intervalShort(28)).toBe('+4 wk');
    expect(intervalShort(119)).toBe('+17 wk');
    expect(intervalShort(120)).toBe('+4 mnd');
  });

  it('loopt van kleurloos naar volledig goud op de verankerdrempel', () => {
    expect(intervalTone(1)).toBe(0);
    expect(intervalTone(90)).toBeCloseTo(1, 10);
    expect(intervalTone(365)).toBe(1); // geklemd
  });

  it('stijgt monotoon met het interval', () => {
    const tones = [1, 3, 7, 21, 45, 90].map(intervalTone);
    for (let i = 1; i < tones.length; i++) {
      expect(tones[i]).toBeGreaterThan(tones[i - 1]);
    }
  });
});

describe('de plandatum heeft een plafond', () => {
  /** Ruim voorbij het plafond: bij 90% retentie is het interval de stabiliteit. */
  const ROTSVAST: FsrsState = {
    stability: 880, difficulty: 4,
    dueDate: '2026-06-15', lastReviewedAt: '2026-06-15T10:00:00.000Z',
  };

  it('klemt het interval op een jaar, en laat alles eronder met rust', () => {
    expect(nextInterval(2000)).toBe(MAX_INTERVAL_DAYS);
    expect(nextInterval(880)).toBe(MAX_INTERVAL_DAYS);
    expect(nextInterval(300)).toBe(300);
    // De ondergrens blijft ook staan: nooit korter dan een dag.
    expect(nextInterval(0.2)).toBe(1);
  });

  // ROTSVAST staat op vandaag als laatste review, wat het een tweede beurt op
  // dezelfde dag zou maken; deze twee gaan over een échte review, dus komt de
  // vorige beurt een jaar terug te liggen.
  const ROTSVAST_DUE: FsrsState = { ...ROTSVAST, lastReviewedAt: '2025-06-15T10:00:00.000Z' };

  it('plant een review nooit verder dan een jaar vooruit', () => {
    const { newState, logPartial } = reviewCard(ROTSVAST_DUE, GRADE.EASY, TODAY);
    expect(newState.dueDate).toBe('2027-06-15');
    expect(logPartial.intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  it('laat de stabiliteit zelf ongemoeid — die draagt vast, houdbaarheid en beheersing', () => {
    const { newState, logPartial } = reviewCard(ROTSVAST_DUE, GRADE.EASY, TODAY);
    expect(newState.stability!).toBeGreaterThan(MAX_INTERVAL_DAYS);
    expect(logPartial.sAfter).toBeGreaterThan(ROTSVAST_DUE.stability!);
  });

  it('haalt een vervaldatum van vóór het plafond terug naar het plafond', () => {
    // Twee jaar vooruit gezet, gerekend vanaf de laatste review.
    expect(cappedDueDate({ ...ROTSVAST, dueDate: '2028-06-14' })).toBe('2027-06-15');
    // Binnen het jaar verandert er niets.
    expect(cappedDueDate({ ...ROTSVAST, dueDate: '2026-09-01' })).toBe('2026-09-01');
  });

  it('laat een state zonder datum of zonder laatste review met rust', () => {
    expect(cappedDueDate({ ...ROTSVAST, dueDate: null })).toBeNull();
    expect(cappedDueDate({ ...ROTSVAST, lastReviewedAt: null })).toBe('2026-06-15');
  });
});

describe('de continue schaal past in FSRS', () => {
  const MATURE: FsrsState = {
    stability: 10, difficulty: 5,
    dueDate: '2026-06-15', lastReviewedAt: '2026-06-05T10:00:00.000Z',
  };

  it('een hele 3 en een hele 4 geven nog steeds de bekende intervallen', () => {
    // Deze twee getallen zijn met de hand uit de formules gerekend; ze bewaken
    // dat de interpolatie de uitersten niet verschoven heeft.
    expect(previewInterval(MATURE, GRADE.GOOD, TODAY)).toBe(33);
    expect(previewInterval(MATURE, GRADE.EASY, TODAY)).toBe(88);
  });

  it('gebroken grades liggen ertussen en lopen monotoon op', () => {
    const days = [3, 3.25, 3.5, 3.75, 4].map(g => previewInterval(MATURE, g, TODAY));
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThan(days[i - 1]);
    }
    expect(days[0]).toBe(33);
    expect(days[days.length - 1]).toBe(88);
  });

  it('een gloednieuw woord krijgt een echte stabiliteit, geen NaN', () => {
    // initialStability leest W[grade-1]; zonder interpolatie zou W[2.4]
    // undefined zijn en de kaart met NaN in de database belanden.
    for (const g of [3, 3.3, 3.5, 3.75, 4]) {
      const s = initialStability(g);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
    expect(initialStability(3)).toBeCloseTo(W[2], 10);
    expect(initialStability(4)).toBeCloseTo(W[3], 10);
    expect(initialStability(3.5)).toBeCloseTo((W[2] + W[3]) / 2, 10);
  });

  it('moeilijkheid blijft bij gebroken grades binnen de grenzen', () => {
    for (const g of [3, 3.4, 3.9, 4]) {
      const d = updateDifficulty(5, g);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });
});

describe('een tweede beurt op dezelfde dag laat het geheugenmodel met rust', () => {
  const REVIEWED_TODAY: FsrsState = {
    stability: 3, difficulty: 6,
    dueDate: '2026-06-18', lastReviewedAt: TODAY + 'T09:00:00.000Z',
  };

  it('houdt stabiliteit, moeilijkheid en plandatum precies waar ze staan', () => {
    const { newState } = reviewCard(REVIEWED_TODAY, GRADE.GOOD, TODAY);
    expect(newState.stability).toBe(REVIEWED_TODAY.stability);
    expect(newState.difficulty).toBe(REVIEWED_TODAY.difficulty);
    expect(newState.dueDate).toBe(REVIEWED_TODAY.dueDate);
  });

  it('schuift alleen het tijdstip op, zodat de volgende echte review goed rekent', () => {
    const { newState } = reviewCard(REVIEWED_TODAY, GRADE.GOOD, TODAY);
    expect(newState.lastReviewedAt).not.toBe(REVIEWED_TODAY.lastReviewedAt);
    expect(newState.lastReviewedAt!.split('T')[0]).toBe(TODAY);
    expect(Date.parse(newState.lastReviewedAt!)).not.toBeNaN();
  });

  it('een herkansing na een fout duwt het woord niet alsnog vooruit', () => {
    // Dit was het lek: fout → 3 dagen, en de goede herkansing een minuut later
    // rekende met een tijdsverschil van één dag en tilde het naar 5.
    const before = reviewCard(
      { stability: 20, difficulty: 5, dueDate: TODAY, lastReviewedAt: '2026-05-26T10:00:00.000Z' },
      GRADE.FORGOT, TODAY,
    ).newState;
    const after = reviewCard(before, GRADE.GOOD, TODAY).newState;
    expect(after.stability).toBe(before.stability);
    expect(after.dueDate).toBe(before.dueDate);
  });

  it('ook een tweede fout telt niet dubbel', () => {
    const { newState } = reviewCard(REVIEWED_TODAY, GRADE.FORGOT, TODAY);
    expect(newState.stability).toBe(REVIEWED_TODAY.stability);
  });

  it('logt de beurt wél, met het interval dat blijft staan', () => {
    const { logPartial } = reviewCard(REVIEWED_TODAY, 3.3, TODAY);
    expect(logPartial.effectiveGrade).toBe(3.3);
    expect(logPartial.grade).toBe(3);
    expect(logPartial.sAfter).toBe(REVIEWED_TODAY.stability);
    expect(logPartial.intervalDays).toBe(3); // 15 → 18 juni
  });

  it('raakt de eerste beurt van de dag niet', () => {
    const gisteren: FsrsState = {
      stability: 3, difficulty: 6,
      dueDate: TODAY, lastReviewedAt: '2026-06-14T09:00:00.000Z',
    };
    const { newState } = reviewCard(gisteren, GRADE.GOOD, TODAY);
    expect(newState.stability).toBeGreaterThan(gisteren.stability!);
  });

  it('raakt een gloednieuw woord niet', () => {
    const { newState } = reviewCard(emptyFsrsState(), GRADE.GOOD, TODAY);
    expect(newState.stability).toBeCloseTo(W[2], 10);
  });
});

describe('de demping onder goed loopt net zo vloeiend als de bonus erboven', () => {
  const MATURE: FsrsState = {
    stability: 10, difficulty: 5,
    dueDate: '2026-06-15', lastReviewedAt: '2026-06-05T10:00:00.000Z',
  };

  it('een hele 2 en een hele 3 geven nog steeds de bekende intervallen', () => {
    // Met de hand uit de formules gerekend, zodat de interpolatie de uitersten
    // niet ongemerkt kan verschuiven.
    expect(previewInterval(MATURE, GRADE.HARD, TODAY)).toBe(15);
    expect(previewInterval(MATURE, GRADE.GOOD, TODAY)).toBe(33);
  });

  it('gebroken grades tussen moeizaam en goed lopen monotoon op', () => {
    const days = [2, 2.25, 2.5, 2.7, 3].map(g => previewInterval(MATURE, g, TODAY));
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    }
    expect(days[0]).toBe(15);
    expect(days[days.length - 1]).toBe(33);
  });
});

describe('woorden schuiven niet meer in drie beurten een jaar weg', () => {
  /** Speel een reeks goede beurten af, telkens precies op de plandatum. */
  function trajectory(thinkMs: number, beurten: number): number[] {
    let state = emptyFsrsState();
    let date  = TODAY;
    const out: number[] = [];
    for (let i = 0; i < beurten; i++) {
      const grade = gradeForAnswer('typed_nl_it', 'correct', thinkMs, { firstReview: i === 0 });
      const { newState, logPartial } = reviewCard(state, grade, date);
      out.push(logPartial.intervalDays);
      state = newState;
      date  = newState.dueDate!;
    }
    return out;
  }

  it('een vlotte leerling loopt op, maar niet in één sprong naar het plafond', () => {
    const days = trajectory(2000, 4);
    // Voorheen: 9 · 59 · 334 · plafond. Drie beurten en het woord was weg.
    expect(days[0]).toBeLessThanOrEqual(4);
    expect(days[3]).toBeLessThan(MAX_INTERVAL_DAYS);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
  });

  it('vlot blijft wel verder komen dan moeizaam', () => {
    const vlot  = trajectory(500, 4);
    const traag = trajectory(20000, 4);
    expect(vlot[3]).toBeGreaterThan(traag[3]);
  });

  it('de eerste beurt van een nieuw woord staat vast op de goed-ankerwaarde', () => {
    expect(trajectory(200, 1)[0]).toBe(trajectory(30000, 1)[0]);
    expect(trajectory(200, 1)[0]).toBe(nextInterval(W[2]));
  });
});

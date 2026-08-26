import { describe, it, expect } from 'vitest';
import {
  addMonths, anchorDate, anchorTrend, buildStats, introductionRate, laggingWords,
  monthFull, monthLabel, monthOf, shapeOf, shelfLifeByPartOfSpeech, thinkTimes,
  THINK_TIME_MINIMUM,
} from '@/lib/stats';
import type { StatsLog } from '@/lib/stats';
import { ANCHOR_DAYS, emptyFsrsState } from '@/lib/fsrs';
import type { FsrsState } from '@/lib/fsrs';
import type { FsrsStatesMap } from '@/lib/store';
import { rhythmOf } from '@/lib/vocabulary';
import { Word, StudySession } from '@/types/word';

const TODAY = '2026-08-20';

function word(id: string, over: Partial<Word> = {}): Word {
  return {
    id, original: id, translation: id,
    easeFactor: 2.5, interval: 0, repetitions: 0,
    nextReview: TODAY, createdAt: '2026-01-01T10:00:00.000Z',
    status: 'new', autoTranslated: false, consecutiveErrors: 0,
    ...over,
  };
}

const day = (offset: number) => {
  const d = new Date(2026, 7, 20 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Een state zoals de app hem maakt: `stability` dagen geleden beoordeeld, en
 * daarmee vandaag vervallen — bij 90% gewenste retentie is het interval precies
 * de stabiliteit. Een state waarin die twee niet op elkaar slaan bestaat in de
 * app niet, en levert bij het vooruitrekenen onzin op.
 */
function state(stability: number, dueIn = 0): FsrsState {
  return {
    stability, difficulty: 5,
    dueDate: day(dueIn),
    lastReviewedAt: `${day(-Math.round(stability))}T10:00:00.000Z`,
  };
}

function log(over: Partial<StatsLog> = {}): StatsLog {
  return {
    cardId: 'a', sBefore: 10, sAfter: 20,
    reviewedAt: `${TODAY}T10:00:00.000Z`, thinkMs: 2000,
    ...over,
  };
}

describe('maandrekenen', () => {
  it('telt maanden op en af over de jaargrens', () => {
    expect(addMonths('2026-08', 1)).toBe('2026-09');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-08', 12)).toBe('2027-08');
  });

  it('leest de maand uit een dagsleutel', () => {
    expect(monthOf('2026-08-20')).toBe('2026-08');
  });

  it('schrijft de as kort en de horizon voluit', () => {
    expect(monthLabel('2026-03')).toBe('mrt');
    expect(monthFull('2027-03')).toBe('maart 2027');
    expect(monthFull('2026-05')).toBe('mei 2026');
  });
});

describe('anchorDate — doorrekenen met het model zelf', () => {
  it('een gloednieuw woord haalt de drempel in een handvol beurten', () => {
    const date = anchorDate(emptyFsrsState(), TODAY);
    expect(date).not.toBeNull();
    expect(date! > TODAY).toBe(true);
    // Vier goede beurten brengen een nieuw woord voorbij de 90 dagen; dat mag
    // niet stilletjes maanden opschuiven zonder dat iemand het merkt.
    expect(date! < '2026-12-01').toBe(true);
  });

  it('meer houdbaarheid is eerder vast — bij gelijke vervaldatum', () => {
    // Allebei vandaag vervallen; dan telt alleen hoe ver ze al waren. Een
    // gloednieuw woord kan wél eerder vast zijn dan een rijp woord dat nog
    // midden in zijn interval zit: het komt in die tijd vaker langs.
    expect(anchorDate(state(60), TODAY)! < anchorDate(state(10), TODAY)!).toBe(true);
  });

  it('een woord dat de drempel al haalt landt op de eerstvolgende beurt', () => {
    expect(anchorDate(state(ANCHOR_DAYS + 50, 3), TODAY)).toBe('2026-08-23');
  });

  it('begint op de vervaldatum als die nog komt — eerder oefent het model niet', () => {
    expect(anchorDate(state(200, 5), TODAY)).toBe('2026-08-25');
  });

  it('geeft null in plaats van een verzonnen datum als het niet convergeert', () => {
    // Eén stap toegestaan is te weinig voor een gloednieuw woord.
    expect(anchorDate(emptyFsrsState(), TODAY, 1)).toBeNull();
  });
});

describe('introductionRate — gemeten, niet aangenomen', () => {
  const rhythm = rhythmOf(
    [{ id: 's', date: `${TODAY}T10:00:00.000Z`, wordsStudied: 10, correct: 9, incorrect: 1, duration: 300 }],
    TODAY, 90,
  );

  it('telt alleen eerste beurten, en deelt door de dagen waarop geoefend is', () => {
    const logs = [
      log({ cardId: 'a', sBefore: null, reviewedAt: '2026-08-18T10:00:00.000Z' }),
      log({ cardId: 'b', sBefore: null, reviewedAt: '2026-08-18T10:00:00.000Z' }),
      log({ cardId: 'c', sBefore: null, reviewedAt: '2026-08-19T10:00:00.000Z' }),
      log({ cardId: 'a', sBefore: 3,    reviewedAt: '2026-08-19T10:00:00.000Z' }),
    ];
    // 3 eerste beurten over 2 dagen = 1,5 per studiedag, maal 1/90 studiedagen.
    expect(introductionRate(logs, rhythm)).toBeCloseTo(1.5 * (1 / 90), 10);
  });

  it('zonder eerste beurten valt er niets te meten', () => {
    expect(introductionRate([log({ sBefore: 5 })], rhythm)).toBeNull();
  });

  it('zonder geoefende dagen valt er niets te meten', () => {
    const leeg = rhythmOf([], TODAY, 90);
    expect(introductionRate([log({ sBefore: null })], leeg)).toBeNull();
  });
});

describe('anchorTrend', () => {
  const rhythm = rhythmOf(
    [{ id: 's', date: `${TODAY}T10:00:00.000Z`, wordsStudied: 10, correct: 9, incorrect: 1, duration: 300 }],
    TODAY, 90,
  );

  /** Woorden die in juni zijn toegevoegd; de as begint dan in juni. */
  const since = (id: string, month = '2026-06') => word(id, { createdAt: `${month}-01T10:00:00.000Z` });

  it('de laatste gemeten staaf heet "nu" en draagt het huidige aantal vast', () => {
    const words = [since('a'), since('b')];
    const states: FsrsStatesMap = {
      a: { typed_nl_it: state(ANCHOR_DAYS + 10) },
      b: { typed_nl_it: state(5) },
    };
    const { points } = anchorTrend(words, states, [], [], rhythm, TODAY);
    const nu = points.find(p => p.label === 'nu')!;
    expect(nu.count).toBe(1);
    expect(nu.projected).toBe(false);
  });

  it('de as begint in de maand van het vroegst toegevoegde woord', () => {
    const words = [since('a', '2025-11'), since('b', '2026-03'), since('c', '2026-07')];
    const { points } = anchorTrend(words, {}, [], [], rhythm, TODAY);
    expect(points[0].month).toBe('2025-11');
    // november 2025 t/m augustus 2026 is tien maanden.
    expect(points.filter(p => !p.projected)).toHaveLength(10);
  });

  it('loopt terug door de maanden met de overschrijdingen', () => {
    const words = [since('a'), since('b'), since('c')];
    const states: FsrsStatesMap = {
      a: { typed_nl_it: state(ANCHOR_DAYS + 10) },
      b: { typed_nl_it: state(ANCHOR_DAYS + 10) },
      c: { typed_nl_it: state(ANCHOR_DAYS + 10) },
    };
    const crossings = [
      // twee woorden gingen deze maand over de drempel
      log({ sBefore: 80, sAfter: 95, reviewedAt: '2026-08-04T10:00:00.000Z' }),
      log({ sBefore: 85, sAfter: 99, reviewedAt: '2026-08-06T10:00:00.000Z' }),
      // en één in juli
      log({ sBefore: 70, sAfter: 92, reviewedAt: '2026-07-09T10:00:00.000Z' }),
    ];
    const { points } = anchorTrend(words, states, [], crossings, rhythm, TODAY);
    const measured = points.filter(p => !p.projected);
    // Eind juni stond er niets vast, eind juli één, en nu drie. Augustus is
    // `nu` — die staat niet nog een keer onder zijn eigen naam.
    expect(measured.map(p => p.count)).toEqual([0, 1, 3]);
    expect(measured.map(p => p.label)).toEqual(['jun', 'jul', 'nu']);
  });

  it('leest de historie uit de overschrijdingen, niet uit het recente venster', () => {
    // Dit was het lek: reikte het venster niet tot juni, dan trok de terugloop
    // daar nul af en liep de lijn vlak door op de huidige waarde.
    const words = [since('a', '2026-05')];
    const states: FsrsStatesMap = { a: { typed_nl_it: state(ANCHOR_DAYS + 10) } };
    const crossings = [log({ sBefore: 80, sAfter: 95, reviewedAt: '2026-06-10T10:00:00.000Z' })];
    const recentOnly = [log({ sBefore: 95, sAfter: 99, reviewedAt: '2026-08-18T10:00:00.000Z' })];

    const { points } = anchorTrend(words, states, recentOnly, crossings, rhythm, TODAY);
    const byLabel = Object.fromEntries(points.map(p => [p.label, p.count]));
    expect(byLabel['mei']).toBe(0); // vóór de overschrijding stond er niets vast
    expect(byLabel['jun']).toBe(1);
    expect(byLabel['nu']).toBe(1);
  });

  it('telt een terugval mee als een min', () => {
    const words = [since('a')];
    const states: FsrsStatesMap = { a: { typed_nl_it: state(ANCHOR_DAYS + 10) } };
    const crossings = [log({ sBefore: 95, sAfter: 40, reviewedAt: '2026-08-04T10:00:00.000Z' })];
    const { points } = anchorTrend(words, states, [], crossings, rhythm, TODAY);
    // Nu 1 vast, deze maand netto −1 → vorige maand stonden er 2.
    expect(points.find(p => p.label === 'jul')!.count).toBe(2);
  });

  it('projecteert vooruit met open staven en noemt een horizon', () => {
    const words = [since('a'), since('b')];
    const states: FsrsStatesMap = {
      a: { typed_nl_it: state(ANCHOR_DAYS + 10) },
      b: { typed_nl_it: state(40) },
    };
    const logs = [log({ sBefore: null, sAfter: 3, reviewedAt: '2026-08-18T10:00:00.000Z' })];
    const { points, horizon } = anchorTrend(words, states, logs, [], rhythm, TODAY);
    expect(points.filter(p => p.projected).length).toBeGreaterThan(0);
    expect(horizon).not.toBeNull();
  });

  it('loopt door tot het laatste woord vast is, niet tot de horizon', () => {
    // Negen woorden die snel vast zijn en één dat er lang over doet: de horizon
    // ligt op negen van de tien, maar de strook hoort tot de tiende te lopen.
    const words = Array.from({ length: 10 }, (_, i) => since('w' + i));
    const states: FsrsStatesMap = Object.fromEntries(
      words.map((w, i) => [w.id, { typed_nl_it: state(i < 9 ? 80 : 2) }]),
    );
    const { points, horizon } = anchorTrend(words, states, [], [], rhythm, TODAY);
    const projected = points.filter(p => p.projected);
    const laatste = projected[projected.length - 1];
    expect(laatste.count).toBe(10);           // iedereen vast op de laatste staaf
    expect(laatste.month > monthOf(TODAY)).toBe(true);
    // De horizon noemt negen van de tien en ligt dus eerder dan het einde.
    expect(horizon).not.toBeNull();
  });

  it('houdt een woordenschat die niet convergeert binnen de klep', () => {
    const words = Array.from({ length: 40 }, (_, i) => since('w' + i));
    const logs = [log({ sBefore: null, sAfter: 3, reviewedAt: '2026-08-18T10:00:00.000Z' })];
    const { points } = anchorTrend(words, {}, logs, [], rhythm, TODAY);
    expect(points.filter(p => p.projected).length).toBeLessThanOrEqual(36);
  });

  it('projecteert niets als er niets te projecteren valt', () => {
    const words = [since('a'), since('b')];
    const { points, horizon } = anchorTrend(words, { a: {}, b: {} }, [], [], rhythm, TODAY);
    expect(points.every(p => !p.projected)).toBe(true);
    expect(horizon).toBeNull();
  });

  it('geeft niets terug voor een lege woordenbank', () => {
    expect(anchorTrend([], {}, [], [], rhythm, TODAY)).toEqual({ points: [], horizon: null });
  });

  it('de geprojecteerde reeks daalt nooit', () => {
    const words = Array.from({ length: 12 }, (_, i) => since('w' + i));
    const states: FsrsStatesMap = Object.fromEntries(
      words.map((w, i) => [w.id, { typed_nl_it: state(3 + i * 6) }]),
    );
    const logs = [log({ sBefore: null, sAfter: 3, reviewedAt: '2026-08-18T10:00:00.000Z' })];
    const { points } = anchorTrend(words, states, logs, [], rhythm, TODAY);
    const projected = points.filter(p => p.projected).map(p => p.count);
    for (let i = 1; i < projected.length; i++) {
      expect(projected[i]).toBeGreaterThanOrEqual(projected[i - 1]);
    }
  });

  it('de maanden lopen zonder gaten van begin tot eind', () => {
    const words = [since('a', '2026-02'), since('b', '2026-04')];
    const states: FsrsStatesMap = { a: { typed_nl_it: state(60) }, b: { typed_nl_it: state(70) } };
    const { points } = anchorTrend(words, states, [], [], rhythm, TODAY);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].month).toBe(addMonths(points[i - 1].month, 1));
    }
  });
});

describe('shapeOf — de verdeling over houdbaarheidsbanden', () => {
  it('legt elk woord in de band waar het in hoort', () => {
    const words = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => word(id));
    const states: FsrsStatesMap = {
      a: { typed_nl_it: state(3) },
      b: { typed_nl_it: state(20) },
      c: { typed_nl_it: state(60) },
      d: { typed_nl_it: state(200) },
      e: { typed_nl_it: state(400) },
      f: {},
    };
    const { bands, untouched } = shapeOf(words, states);
    expect(bands.map(b => b.count)).toEqual([1, 1, 1, 1, 1]);
    expect(untouched).toBe(1);
  });

  it('grenswaarden vallen in de bovenliggende band', () => {
    const words = [word('a'), word('b')];
    const states: FsrsStatesMap = {
      a: { typed_nl_it: state(7) },
      b: { typed_nl_it: state(90) },
    };
    const { bands } = shapeOf(words, states);
    expect(bands[0].count).toBe(0); // 7 hoort niet meer bij 1–7
    expect(bands[1].count).toBe(1);
    expect(bands[3].count).toBe(1); // 90 hoort bij 90–365
  });

  it('een woordenschat zonder houdbaarheid levert lege banden', () => {
    const { bands, untouched } = shapeOf([word('a'), word('b')], {});
    expect(bands.every(b => b.count === 0)).toBe(true);
    expect(untouched).toBe(2);
  });
});

describe('thinkTimes', () => {
  const words = [word('a')];
  const states: FsrsStatesMap = { a: { typed_nl_it: state(200) } };

  it('zwijgt tot er genoeg gemeten is', () => {
    const few = Array.from({ length: THINK_TIME_MINIMUM - 1 }, () => log({ thinkMs: 1500 }));
    expect(thinkTimes(words, states, few, TODAY)).toEqual([]);
  });

  it('geeft de mediaan per toestand zodra de drempel gehaald is', () => {
    const many = Array.from({ length: THINK_TIME_MINIMUM }, (_, i) =>
      log({ thinkMs: i < THINK_TIME_MINIMUM / 2 ? 1000 : 3000 }));
    const rows = thinkTimes(words, states, many, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('anchored');
    expect(rows[0].medianMs).toBe(2000);
  });

  it('negeert beurten zonder gemeten denktijd', () => {
    const logs = Array.from({ length: THINK_TIME_MINIMUM + 10 }, () => log({ thinkMs: null }));
    expect(thinkTimes(words, states, logs, TODAY)).toEqual([]);
  });
});

describe('laggingWords — teruggevallen, niet zwak', () => {
  it('telt alleen beurten waarin houdbaarheid verloren ging', () => {
    const words = [word('a'), word('b')];
    const logs = [
      log({ cardId: 'a', sBefore: 50, sAfter: 5 }),
      log({ cardId: 'a', sBefore: 30, sAfter: 4 }),
      log({ cardId: 'b', sBefore: 20, sAfter: 3 }),
      log({ cardId: 'b', sBefore: 10, sAfter: 40 }), // vooruit, telt niet
    ];
    expect(laggingWords(words, logs)).toEqual([
      { id: 'a', original: 'a', falls: 2 },
      { id: 'b', original: 'b', falls: 1 },
    ]);
  });

  it('telt een eerste beurt nooit als terugval', () => {
    expect(laggingWords([word('a')], [log({ cardId: 'a', sBefore: null, sAfter: 3 })])).toEqual([]);
  });

  it('laat verwijderde woorden weg', () => {
    expect(laggingWords([], [log({ cardId: 'weg', sBefore: 50, sAfter: 5 })])).toEqual([]);
  });
});

describe('shelfLifeByPartOfSpeech', () => {
  const states = (ids: string[]): FsrsStatesMap =>
    Object.fromEntries(ids.map(id => [id, { typed_nl_it: state(60) }]));

  it('zwijgt als te weinig woorden een woordsoort dragen', () => {
    const words = [
      word('a', { partOfSpeech: 'werkwoord' }),
      word('b'), word('c'), word('d'),
    ];
    expect(shelfLifeByPartOfSpeech(words, states(['a', 'b', 'c', 'd']))).toEqual([]);
  });

  it('zwijgt bij één soort — dat is geen uitsplitsing', () => {
    const words = ['a', 'b'].map(id => word(id, { partOfSpeech: 'werkwoord' }));
    expect(shelfLifeByPartOfSpeech(words, states(['a', 'b']))).toEqual([]);
  });

  it('geeft de gemiddelde houdbaarheid per soort, grootste groep eerst', () => {
    const words = [
      word('a', { partOfSpeech: 'werkwoord' }),
      word('b', { partOfSpeech: 'werkwoord' }),
      word('c', { partOfSpeech: 'zelfst. nw.' }),
    ];
    const rows = shelfLifeByPartOfSpeech(words, states(['a', 'b', 'c']));
    expect(rows.map(r => r.label)).toEqual(['werkwoord', 'zelfst. nw.']);
    expect(rows[0].days).toBe(60);
  });
});

describe('buildStats — het hele scherm', () => {
  const sessions: StudySession[] = [
    { id: 's1', date: `${TODAY}T10:00:00.000Z`, wordsStudied: 20, correct: 18, incorrect: 2, duration: 400 },
    { id: 's2', date: '2026-08-19T10:00:00.000Z', wordsStudied: 16, correct: 14, incorrect: 2, duration: 350 },
  ];

  it('klapt niet om op een lege woordenbank', () => {
    const stats = buildStats([], {}, [], [], [], TODAY);
    expect(stats.totalWords).toBe(0);
    expect(stats.shape.untouched).toBe(0);
    expect(stats.think).toEqual([]);
    expect(stats.anchored.horizon).toBeNull();
  });

  it('klapt niet om op woorden zonder enige review', () => {
    const words = [word('a'), word('b')];
    const stats = buildStats(words, {}, [], [], [], TODAY);
    expect(stats.untouched).toBe(2);
    expect(stats.lagging).toEqual([]);
    expect(stats.anchored.points.every(p => !p.projected)).toBe(true);
  });

  it('telt wat er deze maand bij kwam', () => {
    const words = [
      word('a', { createdAt: `${TODAY}T09:00:00.000Z` }),
      word('b', { createdAt: '2026-05-01T09:00:00.000Z' }),
    ];
    expect(buildStats(words, {}, [], [], [], TODAY).addedThisMonth).toBe(1);
  });

  it('neemt de mediane sessiegrootte over het ritmevenster', () => {
    const stats = buildStats([word('a')], {}, sessions, [], [], TODAY);
    expect(stats.medianSessionWords).toBe(18);
    expect(stats.rhythm.days).toHaveLength(90);
    expect(stats.rhythm.studied).toBe(2);
  });
});

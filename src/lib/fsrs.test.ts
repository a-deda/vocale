import { describe, it, expect } from 'vitest';
import {
  buildSession, cappedDueDate, emptyFsrsState, FSRS_MODES, GRADE, gradeForAnswer, initialStability,
  intervalShort, intervalTone, MAX_INTERVAL_DAYS, nextInterval, previewInterval, recallMs,
  reviewCard, updateDifficulty, W,
} from '@/lib/fsrs';
import { answerLength } from '@/lib/translation-utils';
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

describe('recallMs — tiktijd telt niet mee als denktijd', () => {
  it('trekt de geschatte tiktijd van de reactietijd af', () => {
    // 7 tekens x 180 ms = 1260 ms tikken; wat overblijft is herinneren.
    expect(recallMs(5000, 7, 'keyboard')).toBe(5000 - 1260);
  });

  it('rekent op glas met een hoger tiktarief', () => {
    expect(recallMs(5000, 7, 'touch')).toBeLessThan(recallMs(5000, 7, 'keyboard'));
  });

  it('een lang woord levert bij dezelfde reactietijd minder denktijd op', () => {
    expect(recallMs(6000, 17, 'keyboard')).toBeLessThan(recallMs(6000, 4, 'keyboard'));
  });
});

describe('gradeForAnswer — snelheid schaalt vloeiend tussen goed en moeiteloos', () => {
  const WORD = 'parlare'.length;
  /** Reactietijd die na aftrek van de tiktijd `recall` ms denktijd overhoudt. */
  const at = (recall: number, medium: 'keyboard' | 'touch' = 'keyboard') =>
    recall + WORD * (medium === 'keyboard' ? 180 : 340);

  it('binnen een seconde bedacht is volledig moeiteloos', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', at(500), WORD, 'keyboard')).toBe(GRADE.EASY);
    expect(gradeForAnswer('typed_nl_it', 'correct', at(1000), WORD, 'keyboard')).toBe(GRADE.EASY);
  });

  it('acht seconden denken levert geen bonus meer op', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', at(8000), WORD, 'keyboard')).toBe(GRADE.GOOD);
    expect(gradeForAnswer('typed_nl_it', 'correct', at(20000), WORD, 'keyboard')).toBe(GRADE.GOOD);
  });

  it('daartussen loopt het monotoon af', () => {
    const grades = [1000, 2000, 3000, 4500, 6000, 7000, 8000]
      .map(r => gradeForAnswer('typed_nl_it', 'correct', at(r), WORD, 'keyboard'));
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i]).toBeLessThan(grades[i - 1]);
    }
    expect(grades[0]).toBe(GRADE.EASY);
    expect(grades[grades.length - 1]).toBe(GRADE.GOOD);
  });

  it('dezelfde denktijd telt op glas even zwaar — alleen de tiktijd verschilt', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', at(3000, 'touch'), WORD, 'touch'))
      .toBeCloseTo(gradeForAnswer('typed_nl_it', 'correct', at(3000), WORD, 'keyboard'), 10);
  });

  it('een herhaling binnen dezelfde sessie krijgt geen bonus', () => {
    // Na een kennismaking komt het woord uit het werkgeheugen; snelheid zegt
    // dan niets over wat er over weken nog van over is.
    expect(gradeForAnswer('typed_nl_it', 'correct', at(200), WORD, 'keyboard', true))
      .toBe(GRADE.GOOD);
  });

  it('blijft altijd binnen goed en moeiteloos', () => {
    for (const ms of [0, 1, 100, 5000, 20000, 1e9]) {
      const g = gradeForAnswer('typed_nl_it', 'correct', ms, WORD, 'keyboard');
      expect(g).toBeGreaterThanOrEqual(GRADE.GOOD);
      expect(g).toBeLessThanOrEqual(GRADE.EASY);
    }
  });

  it('snelheid redt een bijna- of fout antwoord niet', () => {
    expect(gradeForAnswer('typed_nl_it', 'almost', 100, WORD, 'keyboard')).toBe(GRADE.HARD);
    expect(gradeForAnswer('typed_nl_it', 'wrong', 100, WORD, 'keyboard')).toBe(GRADE.FORGOT);
  });

  it('zonder gemeten tijd is er geen verhoging', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', null, WORD, 'keyboard')).toBe(GRADE.GOOD);
  });

  it('meerkeuze wordt nooit verhoogd, hoe snel ook', () => {
    expect(gradeForAnswer('mc', 'correct', 10, WORD, 'keyboard')).toBe(GRADE.GOOD);
    expect(gradeForAnswer('mc', 'wrong', 10, WORD, 'keyboard')).toBe(GRADE.FORGOT);
  });
});

describe('een gloednieuw woord toont een zichtbare schaal', () => {
  const TODAY_ = '2026-06-15';
  const WORD = 'parlare'.length;
  const at = (recall: number) => recall + WORD * 180;

  it('verschillende denktijden leveren verschillende labels op', () => {
    const labels = [1000, 3000, 5000, 7000, 8000].map(r => {
      const g = gradeForAnswer('typed_nl_it', 'correct', at(r), WORD, 'keyboard');
      return intervalShort(previewInterval(emptyFsrsState(), g, TODAY_));
    });
    // Geen enkel label mag samenvallen met zijn buur, anders is de schaal
    // onzichtbaar — dat was precies de klacht.
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('answerLength — wat je werkelijk moet typen', () => {
  it('neemt de kortste betekenis, niet het hele veld', () => {
    // "praten; kletsen" is 15 tekens, maar je typt er 6.
    expect(answerLength('praten; kletsen')).toBe(6);
  });

  it('telt annotaties niet mee', () => {
    expect(answerLength('il libro (s.m.)')).toBe('il libro'.length);
  });

  it('werkt bij een enkele betekenis', () => {
    expect(answerLength('parlare')).toBe(7);
  });

  it('valt terug op een leeg veld zonder te klappen', () => {
    expect(answerLength('')).toBe(0);
    expect(answerLength('   ')).toBe(0);
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

  it('plant een review nooit verder dan een jaar vooruit', () => {
    const { newState, logPartial } = reviewCard(ROTSVAST, GRADE.EASY, TODAY);
    expect(newState.dueDate).toBe('2027-06-15');
    expect(logPartial.intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  it('laat de stabiliteit zelf ongemoeid — die draagt vast, houdbaarheid en beheersing', () => {
    const { newState, logPartial } = reviewCard(ROTSVAST, GRADE.EASY, TODAY);
    expect(newState.stability!).toBeGreaterThan(MAX_INTERVAL_DAYS);
    expect(logPartial.sAfter).toBeGreaterThan(ROTSVAST.stability!);
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

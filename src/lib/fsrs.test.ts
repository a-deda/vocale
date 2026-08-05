import { describe, it, expect } from 'vitest';
import {
  buildSession, FSRS_MODES, GRADE, gradeForAnswer, initialStability,
  previewInterval, speedThreshold, updateDifficulty, W,
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

describe('gradeForAnswer — snelheid schaalt vloeiend tussen goed en moeiteloos', () => {
  // 'parlare' telt 7 tekens, dus de ijkdrempel ligt op 4000 + 7 x 300 = 6100 ms.
  const WORD = 'parlare'.length;
  const T    = speedThreshold(WORD);

  it('de uitersten komen exact overeen met de oude hele grades', () => {
    // Halve drempel of sneller = volledig moeiteloos; anderhalve drempel of
    // trager = gewoon goed. Deze twee moeten na de overgang naar een continue
    // schaal nog precies hetzelfde opleveren als voorheen.
    expect(gradeForAnswer('typed_nl_it', 'correct', 0.5 * T, WORD)).toBe(GRADE.EASY);
    expect(gradeForAnswer('typed_nl_it', 'correct', 1.5 * T, WORD)).toBe(GRADE.GOOD);
  });

  it('op de ijkdrempel zit je precies halverwege', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', T, WORD)).toBeCloseTo(3.5, 10);
  });

  it('loopt monotoon af naarmate je trager antwoordt', () => {
    const grades = [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6]
      .map(k => gradeForAnswer('typed_nl_it', 'correct', k * T, WORD));
    for (let i = 1; i < grades.length; i++) {
      expect(grades[i]).toBeLessThanOrEqual(grades[i - 1]);
    }
    expect(grades[0]).toBe(GRADE.EASY);
    expect(grades[grades.length - 1]).toBe(GRADE.GOOD);
  });

  it('blijft altijd binnen goed en moeiteloos', () => {
    for (const ms of [0, 1, 100, 5000, 6100, 20000, 1e9]) {
      const g = gradeForAnswer('typed_nl_it', 'correct', ms, WORD);
      expect(g).toBeGreaterThanOrEqual(GRADE.GOOD);
      expect(g).toBeLessThanOrEqual(GRADE.EASY);
    }
  });

  it('een langer woord krijgt een ruimere drempel', () => {
    const long = 'la disoccupazione'.length;
    expect(gradeForAnswer('typed_nl_it', 'correct', 9000, long))
      .toBeGreaterThan(gradeForAnswer('typed_nl_it', 'correct', 9000, WORD));
  });

  it('snelheid redt een bijna- of fout antwoord niet', () => {
    expect(gradeForAnswer('typed_nl_it', 'almost', 100, WORD)).toBe(GRADE.HARD);
    expect(gradeForAnswer('typed_nl_it', 'wrong', 100, WORD)).toBe(GRADE.FORGOT);
  });

  it('zonder gemeten tijd is er geen verhoging', () => {
    expect(gradeForAnswer('typed_nl_it', 'correct', null, WORD)).toBe(GRADE.GOOD);
  });

  it('meerkeuze wordt nooit verhoogd, hoe snel ook', () => {
    expect(gradeForAnswer('mc', 'correct', 10, WORD)).toBe(GRADE.GOOD);
    expect(gradeForAnswer('mc', 'wrong', 10, WORD)).toBe(GRADE.FORGOT);
  });

  it('luisteren volgt dezelfde snelheidsregel als typen', () => {
    expect(gradeForAnswer('listen_type', 'correct', 0.5 * T, WORD)).toBe(GRADE.EASY);
    expect(gradeForAnswer('listen_type', 'correct', 1.5 * T, WORD)).toBe(GRADE.GOOD);
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

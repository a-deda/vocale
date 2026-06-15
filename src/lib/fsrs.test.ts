import { describe, it, expect } from 'vitest';
import { buildSession, FSRS_MODES } from '@/lib/fsrs';
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

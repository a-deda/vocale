import { describe, it, expect } from 'vitest';
import { studiedToday } from '@/lib/vocabulary';
import { buildSession } from '@/lib/fsrs';
import type { ReviewLogRow } from '@/lib/store';
import type { FsrsState } from '@/lib/fsrs';

const TODAY = '2026-06-15';

function log(cardId: string, day: string): ReviewLogRow {
  return {
    cardId, mode: 'typed_nl_it', grade: 3, effectiveGrade: 3, inputMedium: 'keyboard',
    sBefore: 5, sAfter: 8, reviewedAt: `${day}T10:00:00.000Z`, responseMs: 2000, recallMs: 800,
  };
}

describe('studiedToday', () => {
  it('telt niets zonder logs', () => {
    expect(studiedToday([], TODAY)).toBe(0);
  });

  it('telt uniek per woord, niet per kaart', () => {
    // Eén woord kan binnen één sessie drie keer langskomen: kennismaking,
    // de getypte herhaling erna, en een herkansing. Dat is één woord.
    expect(studiedToday([log('w1', TODAY), log('w1', TODAY), log('w1', TODAY)], TODAY)).toBe(1);
  });

  it('negeert wat er gisteren gebeurde', () => {
    expect(studiedToday([log('w1', '2026-06-14'), log('w2', TODAY)], TODAY)).toBe(1);
  });
});

describe('het dagdoel begrenst herhalingen én nieuwe woorden samen', () => {
  /** Twintig gloednieuwe woorden. */
  const states: Record<string, Partial<Record<'typed_nl_it', FsrsState>>> = {};
  for (let i = 0; i < 20; i++) states['w' + i] = {};

  const budget = (goal: number, done: number) => Math.max(0, goal - done);

  it('geeft na 15 van de 20 nog vijf woorden', () => {
    expect(buildSession(states, TODAY, budget(20, 15))).toHaveLength(5);
  });

  it('geeft niets meer zodra het dagdoel gehaald is', () => {
    expect(buildSession(states, TODAY, budget(20, 20))).toHaveLength(0);
  });

  it('maar met het dagdoel losgelaten staat er wél werk klaar', () => {
    // Dat is precies waarom "Toch doorgaan" bestaat: het scherm mag niet
    // doodlopen terwijl er nog van alles te doen is.
    expect(buildSession(states, TODAY, 20).length).toBeGreaterThan(0);
  });
});

describe('de wachtrij zet herhalen vóór nieuw', () => {
  it('geen enkele introductie staat vóór de laatste herhaling', () => {
    const states: Record<string, Partial<Record<'typed_nl_it', FsrsState>>> = {};
    for (let i = 0; i < 3; i++) {
      states['due' + i] = {
        typed_nl_it: {
          stability: 5, difficulty: 5,
          dueDate: '2026-06-10', lastReviewedAt: '2026-06-05T10:00:00.000Z',
        },
      };
    }
    for (let i = 0; i < 10; i++) states['new' + i] = {};

    const items    = buildSession(states, TODAY, 20);
    const isIntro  = items.map(i => i.dueDate === null);
    const laatste  = isIntro.lastIndexOf(false);
    const eerste   = isIntro.indexOf(true);

    expect(items.filter(i => i.dueDate !== null)).toHaveLength(3);
    expect(eerste).toBeGreaterThan(laatste);
  });
});

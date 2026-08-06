import { describe, it, expect } from 'vitest';
import { addDaysKey, statesForHorizon } from '@/lib/session-horizon';
import { buildSession } from '@/lib/fsrs';
import type { FsrsState } from '@/lib/fsrs';

const TODAY    = '2026-06-15';
const TOMORROW = '2026-06-16';

function typed(dueDate: string, lastReviewedAt: string): { typed_nl_it: FsrsState } {
  return { typed_nl_it: { stability: 5, difficulty: 5, dueDate, lastReviewedAt } };
}

describe('addDaysKey', () => {
  it('telt dagen op binnen de maand', () => {
    expect(addDaysKey('2026-06-15', 1)).toBe('2026-06-16');
  });

  it('rolt over een maandgrens', () => {
    expect(addDaysKey('2026-06-30', 1)).toBe('2026-07-01');
  });

  it('rolt over een jaargrens', () => {
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('kent februari in een schrikkeljaar', () => {
    expect(addDaysKey('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('statesForHorizon', () => {
  it('laat alles ongemoeid zolang de horizon vandaag is', () => {
    const states = typed(TOMORROW, `${TODAY}T10:00:00.000Z`);
    expect(statesForHorizon(states, TODAY, TODAY)).toBe(states);
  });

  it('schuift een woord dat vandaag al beantwoord is buiten de horizon', () => {
    // Fout beantwoord vandaag → interval 1 dag → vervalt morgen. Zonder deze
    // filter zou vooruitwerken datzelfde woord meteen weer voorschotelen.
    const out = statesForHorizon(typed(TOMORROW, `${TODAY}T10:00:00.000Z`), TOMORROW, TODAY);
    expect(out.typed_nl_it!.dueDate! > TOMORROW).toBe(true);
  });

  it('laat een woord dat vandaag níét beantwoord is gewoon staan', () => {
    const out = statesForHorizon(typed(TOMORROW, '2026-06-10T10:00:00.000Z'), TOMORROW, TODAY);
    expect(out.typed_nl_it!.dueDate).toBe(TOMORROW);
  });

  it('houdt de state overeind, zodat het woord niet als gloednieuw telt', () => {
    const out = statesForHorizon(typed(TOMORROW, `${TODAY}T10:00:00.000Z`), TOMORROW, TODAY);
    expect(out.typed_nl_it).toBeDefined();
    expect(out.typed_nl_it!.stability).toBe(5);
  });
});

describe('samen met buildSession — dit is wat vooruitwerken oplevert', () => {
  const cards = {
    morgen: typed(TOMORROW, '2026-06-10T10:00:00.000Z'),
    vandaagGehad: typed(TOMORROW, `${TODAY}T10:00:00.000Z`),
  };

  function plan(horizon: string) {
    const states = Object.fromEntries(
      Object.entries(cards).map(([id, s]) => [id, statesForHorizon(s, horizon, TODAY)]),
    );
    return buildSession(states, horizon, 20).map(i => i.cardId);
  }

  it('vandaag valt er niets te doen', () => {
    expect(plan(TODAY)).toEqual([]);
  });

  it('een dag vooruit levert het woord van morgen op', () => {
    expect(plan(TOMORROW)).toEqual(['morgen']);
  });

  it('maar niet het woord dat vandaag al beantwoord is', () => {
    expect(plan(TOMORROW)).not.toContain('vandaagGehad');
  });
});

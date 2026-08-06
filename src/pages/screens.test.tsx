import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Word } from '@/types/word';

/**
 * Rookproef voor de herontworpen schermen: rendert elk scherm met een
 * realistische woordenschat en controleert dat de afgeleide cijfers — vervallen
 * vandaag, toestandsbalk, houdbaarheid — daadwerkelijk op het scherm staan.
 */

const TODAY = '2026-07-30';

function makeWord(over: Partial<Word> & { id: string }): Word {
  return {
    original: 'la chiave', translation: 'de sleutel',
    easeFactor: 2.5, interval: 0, repetitions: 0,
    nextReview: `${TODAY}T00:00:00.000Z`, createdAt: '2026-01-01T00:00:00.000Z',
    status: 'review', autoTranslated: false, consecutiveErrors: 0,
    ...over,
  };
}

const H = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock('@/components/StoreProvider', () => ({ useStore: () => H.store }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }), signOut: () => Promise.resolve() },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock('@/lib/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/store')>()),
  localDateKey: () => TODAY,
}));

import Dashboard from '@/pages/Dashboard';
import WordBank from '@/pages/WordBank';
import Menu from '@/pages/Menu';
import AddWords from '@/pages/AddWords';

/** Eén vervallen woord, één actief, één verankerd, één gloednieuw. */
function seedStore() {
  const words = [
    makeWord({ id: 'w1', original: 'la soglia',    translation: 'de drempel' }),
    makeWord({ id: 'w2', original: 'sciupare',     translation: 'verkwisten' }),
    makeWord({ id: 'w3', original: 'sfiorare',     translation: 'aanstippen' }),
    makeWord({ id: 'w4', original: 'il rimpianto', translation: 'de spijt', status: 'new' }),
  ];
  H.store = {
    words,
    fsrsStates: {
      // 20 dagen niet gezien bij stabiliteit 3 → retrievability ~62% → wankel.
      w1: { typed_nl_it: { stability: 3,   difficulty: 5, dueDate: '2026-07-20', lastReviewedAt: '2026-07-10T10:00:00.000Z' } },
      // Vervalt vandaag.
      w2: { typed_nl_it: { stability: 12,  difficulty: 5, dueDate: TODAY,        lastReviewedAt: '2026-07-18T10:00:00.000Z' } },
      // Ruim boven de verankerdrempel van 90 dagen.
      w3: { typed_nl_it: { stability: 140, difficulty: 4, dueDate: '2026-11-01', lastReviewedAt: '2026-07-29T10:00:00.000Z' } },
    },
    sessions: [{ id: 's1', date: `${TODAY}T09:00:00.000Z`, wordsStudied: 10, correct: 8, incorrect: 2, duration: 300 }],
    reviewLogs: [
      { cardId: 'w3', mode: 'typed_nl_it', grade: 3, sBefore: 70, sAfter: 140, reviewedAt: '2026-07-29T10:00:00.000Z', responseMs: 4800 },
    ],
    stats: {
      currentStreak: 1, longestStreak: 3, lastStudyDate: TODAY, totalWordsLearned: 8,
      totalSessions: 1, dailyGoal: 24, streakFreezes: 0, freezesEarnedAtStreak: 0,
    },
    updateWord: vi.fn(), addWords: vi.fn(), updateStats: vi.fn(), autoTranslate: vi.fn(),
  };
}

const renderAt = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('overzicht', () => {
  it('toont wat er vandaag vervalt, de toestandsbalk en de houdbaarheid', () => {
    seedStore();
    const { container } = renderAt(<Dashboard />);

    // Het kopgetal is het eerste dat je ziet; "1" staat ook in de balk, dus scope het.
    expect(container.querySelector('.text-\\[108px\\]')).toHaveTextContent('1');
    expect(screen.getByText('woorden te herhalen vandaag')).toBeInTheDocument();
    expect(screen.getByText(/1 stonden er al/)).toBeInTheDocument(); // w1 stond al open

    // Toestandsbalk: wankel 1 · actief 1 · vast 1 · nieuw 1, samen 4 woorden.
    expect(screen.getByText('wankel')).toBeInTheDocument();
    expect(screen.getByText('25% vast · 4 woorden')).toBeInTheDocument();

    // Houdbaarheid = gemiddelde stabiliteit over de drie woorden met een state.
    expect(screen.getByText(String(Math.round((3 + 12 + 140) / 3)))).toBeInTheDocument();
    expect(screen.getByText(/dagen houdbaarheid/)).toBeInTheDocument();

    // Wankelst eerst, en de gemiddelde tijd tot de eerste toets uit de logs.
    expect(screen.getByText('la soglia')).toBeInTheDocument();
    expect(screen.getByText('4,8 s')).toBeInTheDocument();
    expect(screen.getByText(/^Begin — /)).toBeInTheDocument();
  });

  it('meldt bij niets te doen wat er morgen staat, zonder aanmoediging', () => {
    seedStore();
    (H.store.fsrsStates as Record<string, unknown>) = {
      w2: { typed_nl_it: { stability: 12, difficulty: 5, dueDate: '2026-07-31', lastReviewedAt: '2026-07-29T10:00:00.000Z' } },
    };
    renderAt(<Dashboard />);

    // Alle vier de woorden zijn nieuw op w2 na, dus er valt wel iets te leren.
    expect(screen.getByText(/Niets te herhalen vandaag\./)).toBeInTheDocument();
    expect(screen.getByText(/nieuwe woorden klaar/)).toBeInTheDocument();
  });
});

describe('woordenbank', () => {
  it('toont elk woord met zijn stabiliteit, gesorteerd op laatst geoefend', () => {
    seedStore();
    renderAt(<WordBank />);

    expect(screen.getByText('Woordenbank')).toBeInTheDocument();
    expect(screen.getByText('4 woorden')).toBeInTheDocument();
    expect(screen.getByText('140 d')).toBeInTheDocument();
    expect(screen.getByText('sfiorare')).toBeInTheDocument();
  });
});

describe('menu', () => {
  it('draagt inhoud én instellingen, want de hamburger is de enige navigatie', () => {
    seedStore();
    renderAt(<Menu />);

    expect(screen.getByText('Woordenbank')).toBeInTheDocument();
    expect(screen.getByText('Woorden toevoegen')).toBeInTheDocument();
    expect(screen.getByText('Dagdoel')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('Drempel vast')).toBeInTheDocument();
    expect(screen.getByText('90 d')).toBeInTheDocument();
  });
});

describe('woorden toevoegen', () => {
  it('telt de regels die je typt in de knop', () => {
    seedStore();
    renderAt(<AddWords />);

    expect(screen.getByText('Woorden toevoegen')).toBeInTheDocument();
    expect(screen.getByText(/Toevoegen — 0 woorden/)).toBeInTheDocument();
    expect(screen.getByText('automatisch vertalen')).toBeInTheDocument();
  });
});

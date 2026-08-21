import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
        // Het diepere review-venster van de statistiekenpagina; null laat hem
        // terugvallen op wat de store al heeft.
        order: () => ({ limit: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
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
import Stats from '@/pages/Stats';

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

    // Het kopgetal telt alles wat klaarligt: w2 vervalt vandaag, w1 stond al open.
    expect(container.querySelector('.text-\\[108px\\]')).toHaveTextContent('2');
    expect(screen.getByText('woorden staan open')).toBeInTheDocument();
    expect(screen.getByText('1 van eerder')).toBeInTheDocument(); // w1 stond al open

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

  it('zet de vervalstrook onder het kopgetal, met de achterstand op vandaag', () => {
    seedStore();
    renderAt(<Dashboard />);

    // Twee woorden binnen het venster (w1 achterstallig, w2 vandaag); w3 valt in
    // november en telt dus niet mee.
    expect(screen.getByText('wat er vervalt · lijn is één sessie')).toBeInTheDocument();
    expect(screen.getByText('2 in 14 dagen')).toBeInTheDocument();
  });

  it('opent een dag als blad, want een staaf is te smal om aan te wijzen', () => {
    seedStore();
    renderAt(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Toon een dag' }));

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('vandaag')).toBeInTheDocument();
    expect(within(sheet).getByText('2 woorden')).toBeInTheDocument();
    // Zwakste eerst: w1 (stabiliteit 3) boven w2 (12).
    expect(within(sheet).getByText('la soglia')).toBeInTheDocument();
    expect(within(sheet).getByText('3 d')).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: /morgen/ }));
    expect(within(screen.getByRole('dialog')).getByText('Deze dag is leeg.')).toBeInTheDocument();
  });

  it('meldt bij niets te doen wat er morgen staat, zonder aanmoediging', () => {
    seedStore();
    (H.store.fsrsStates as Record<string, unknown>) = {
      w2: { typed_nl_it: { stability: 12, difficulty: 5, dueDate: '2026-07-31', lastReviewedAt: '2026-07-29T10:00:00.000Z' } },
    };
    renderAt(<Dashboard />);

    expect(screen.getByText(/Niets vervalt vandaag\./)).toBeInTheDocument();
    expect(screen.getByText(/Morgen vervallen er 1\./)).toBeInTheDocument();
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
    expect(screen.getByText('Sessiegrootte')).toBeInTheDocument();
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

describe('statistieken', () => {
  it('toont wat vast staat, de vorm van de woordenschat en het ritme', () => {
    seedStore();
    renderAt(<Stats />);

    // w3 staat op 140 dagen en is als enige vast.
    const vast = screen.getByText('woorden vast').previousElementSibling;
    expect(vast).toHaveTextContent('1');

    // De banden: w1 op 3 dagen, w2 op 12, w3 op 140. w4 heeft geen houdbaarheid.
    expect(screen.getByText('1–7 d')).toBeInTheDocument();
    expect(screen.getByText('90–365 d')).toBeInTheDocument();
    expect(screen.getByText('365+ is het plafond · daar blijft alles staan')).toBeInTheDocument();

    // Ritme over een kwartaal, niet over veertien dagen zoals het overzicht.
    expect(screen.getByText('ritme over 90 dagen')).toBeInTheDocument();
    expect(screen.getByText(/1 van 90 dagen/)).toBeInTheDocument();

    // Voetregel: context, geen prestatie.
    expect(screen.getByText(/4 woorden/)).toBeInTheDocument();
  });

  it('zwijgt over denktijd zolang er te weinig gemeten is', () => {
    seedStore();
    renderAt(<Stats />);
    expect(screen.getByText(/De meting begint/)).toBeInTheDocument();
    expect(screen.queryByText('tijd tot het eerste teken · mediaan')).not.toBeInTheDocument();
  });

  it('draagt geen streak, geen vlam en geen freezes', () => {
    seedStore();
    const { container } = renderAt(<Stats />);
    expect(container.textContent).not.toMatch(/streak|freeze|🔥|🎉/i);
    // Het oude scherm leidde met een voorspelde einddatum uit eigen wegingen.
    expect(container.textContent).not.toMatch(/Mastery/i);
  });

  it('meldt een lege woordenbank in plaats van lege grafieken', () => {
    seedStore();
    H.store = { ...H.store, words: [], fsrsStates: {}, sessions: [], reviewLogs: [] };
    renderAt(<Stats />);
    expect(screen.getByText('Nog geen woorden.')).toBeInTheDocument();
    expect(screen.queryByText('de vorm van je woordenschat')).not.toBeInTheDocument();
  });

  it('meldt woorden zonder houdbaarheid in plaats van vijf lege banden', () => {
    seedStore();
    H.store = { ...H.store, fsrsStates: {}, reviewLogs: [] };
    renderAt(<Stats />);
    expect(screen.getByText('4 woorden, geen houdbaarheid.')).toBeInTheDocument();
    expect(screen.getByText('Nog niets gemeten.')).toBeInTheDocument();
  });
});

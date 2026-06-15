import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Integratietest voor de oefen-flow rond foute antwoorden.
 *
 * Doel (zie taak): een fout antwoord mag NIET worden overgeslagen. De
 * gebruiker moet het juiste antwoord zien én kunnen kiezen om het toch goed
 * te rekenen of het woord aan te passen, met directe herbeoordeling.
 */

const H = vi.hoisted(() => {
  const makeWord = (over: Record<string, unknown> = {}) => ({
    id: 'w1',
    original: 'parlare',
    translation: 'praten',
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: '2026-06-15T00:00:00.000Z',
    createdAt: '2026-06-15T00:00:00.000Z',
    status: 'new',
    autoTranslated: false,
    consecutiveErrors: 0,
    ...over,
  });
  const state = {
    words: [makeWord()] as ReturnType<typeof makeWord>[],
    queue: [{ cardId: 'w1', mode: 'typed_nl_it', dueDate: null }] as
      { cardId: string; mode: string; dueDate: string | null }[],
    updateWord: vi.fn(() => Promise.resolve()),
    upsertFsrsState: vi.fn(() => Promise.resolve()),
    addReviewLog: vi.fn(() => Promise.resolve()),
    updateStreak: vi.fn(() => Promise.resolve()),
    addSession: vi.fn(() => Promise.resolve()),
  };
  return { makeWord, state };
});

vi.mock('@/components/StoreProvider', () => ({
  useStore: () => ({
    words: H.state.words,
    fsrsStates: {},
    upsertFsrsState: H.state.upsertFsrsState,
    addReviewLog: H.state.addReviewLog,
    updateStreak: H.state.updateStreak,
    addSession: H.state.addSession,
    updateWord: H.state.updateWord,
    stats: {
      currentStreak: 0, longestStreak: 0, lastStudyDate: null,
      totalWordsLearned: 0, totalSessions: 0, dailyGoal: 20,
      streakFreezes: 0, freezesEarnedAtStreak: 0,
    },
  }),
}));

// Maak de wachtrij deterministisch; laat de rest van fsrs (grading) echt.
vi.mock('@/lib/fsrs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fsrs')>();
  return { ...actual, buildSession: () => H.state.queue };
});

import Study from '@/pages/Study';

function renderStudy() {
  return render(<MemoryRouter><Study /></MemoryRouter>);
}

const IT_INPUT = 'Typ het Italiaanse woord...';
const NL_INPUT = 'Typ de Nederlandse vertaling...';

beforeEach(() => {
  H.state.words = [H.makeWord()];
  H.state.queue = [{ cardId: 'w1', mode: 'typed_nl_it', dueDate: null }];
  H.state.updateWord.mockClear();
  H.state.upsertFsrsState.mockClear();
  H.state.addReviewLog.mockClear();
  H.state.updateStreak.mockClear();
  H.state.addSession.mockClear();
});

describe('Study – foute antwoorden worden niet overgeslagen', () => {
  it('toont bij een fout antwoord de feedback en correctie-opties, zonder door te springen', () => {
    renderStudy();

    const input = screen.getByPlaceholderText(IT_INPUT);
    fireEvent.change(input, { target: { value: 'fout-antwoord' } });
    fireEvent.click(screen.getByText('Controleer'));

    // Feedback zichtbaar, inclusief het juiste antwoord
    expect(screen.getByText('Fout')).toBeInTheDocument();
    expect(screen.getByText('parlare')).toBeInTheDocument();

    // Correctie-opties aanwezig — de oefening is NIET doorgesprongen
    expect(screen.getByText('Toch goed rekenen')).toBeInTheDocument();
    expect(screen.getByText('Woord aanpassen')).toBeInTheDocument();
    expect(screen.getByText('Verder')).toBeInTheDocument();
    expect(screen.queryByText('Sessie Voltooid!')).not.toBeInTheDocument();
  });

  it('"Toch goed rekenen" rekent het antwoord goed en gaat door (zonder het woord te wijzigen)', () => {
    renderStudy();

    fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'fout' } });
    fireEvent.click(screen.getByText('Controleer'));
    fireEvent.click(screen.getByText('Toch goed rekenen'));

    // Sessie afgerond met 1 goed woord; het woord zelf is niet aangepast
    expect(screen.getByText('Sessie Voltooid!')).toBeInTheDocument();
    expect(H.state.updateWord).not.toHaveBeenCalledWith('w1', expect.objectContaining({ original: expect.anything() }));
    expect(H.state.addSession).toHaveBeenCalledTimes(1);
    const session = H.state.addSession.mock.calls[0][0] as { correct: number; incorrect: number };
    expect(session.correct).toBe(1);
    expect(session.incorrect).toBe(0);
  });

  it('het woord aanpassen ("mijn antwoord overnemen") herbeoordeelt het antwoord meteen als goed', () => {
    // Opgeslagen Italiaans is fout; de gebruiker typt het juiste woord.
    H.state.words = [H.makeWord({ original: 'verkeerd-opgeslagen' })];
    renderStudy();

    fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
    fireEvent.click(screen.getByText('Controleer'));
    expect(screen.getByText('Fout')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Woord aanpassen'));
    fireEvent.click(screen.getByText(/Mijn antwoord overnemen/));
    fireEvent.click(screen.getByText('Opslaan'));

    // Direct verwerkt: woord opgeslagen + beoordeling bijgewerkt naar Goed
    expect(H.state.updateWord).toHaveBeenCalledWith('w1', { original: 'parlare', translation: 'praten' });
    const banner = screen.getByText(/beoordeling bijgewerkt naar/i);
    expect(within(banner).getByText('Goed')).toBeInTheDocument();
    // "Toch goed rekenen" is weg omdat het al goed staat
    expect(screen.queryByText('Toch goed rekenen')).not.toBeInTheDocument();
  });

  it('bij IT→NL voegt "mijn antwoord toevoegen als betekenis" een vertaling toe en rekent goed', () => {
    H.state.queue = [{ cardId: 'w1', mode: 'typed_it_nl', dueDate: null }];
    renderStudy();

    // Prompt toont het Italiaans; gebruiker typt een geldig synoniem dat nog niet opgeslagen is
    fireEvent.change(screen.getByPlaceholderText(NL_INPUT), { target: { value: 'kletsen' } });
    fireEvent.click(screen.getByText('Controleer'));
    expect(screen.getByText('Fout')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Woord aanpassen'));
    fireEvent.click(screen.getByText(/Mijn antwoord toevoegen als betekenis/));
    fireEvent.click(screen.getByText('Opslaan'));

    expect(H.state.updateWord).toHaveBeenCalledWith('w1', { original: 'parlare', translation: 'praten; kletsen' });
    const banner = screen.getByText(/beoordeling bijgewerkt naar/i);
    expect(within(banner).getByText('Goed')).toBeInTheDocument();
  });

  it('"Verder" na een fout antwoord laat het woord terugkomen als herkansing (niet verloren)', () => {
    renderStudy();

    fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'fout' } });
    fireEvent.click(screen.getByText('Controleer'));
    fireEvent.click(screen.getByText('Verder'));

    // Niet afgerond: hetzelfde woord komt terug om opnieuw te oefenen
    expect(screen.queryByText('Sessie Voltooid!')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(IT_INPUT)).toBeInTheDocument();
  });

  it('een correct antwoord gaat na de feedback nog steeds automatisch door (geen regressie)', () => {
    vi.useFakeTimers();
    try {
      renderStudy();

      fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
      fireEvent.click(screen.getByText('Controleer'));

      // Correct: feedback zichtbaar, geen correctie-pauze
      expect(screen.getByText('Goed!')).toBeInTheDocument();
      expect(screen.queryByText('Verder')).not.toBeInTheDocument();
      expect(screen.queryByText('Sessie Voltooid!')).not.toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(1600); });
      expect(screen.getByText('Sessie Voltooid!')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
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
    addSession: vi.fn((_session: {
      date: string; wordsStudied: number; correct: number; incorrect: number; duration: number;
    }) => Promise.resolve()),
  };
  return { makeWord, state };
});

vi.mock('@/components/StoreProvider', () => ({
  useStore: () => ({
    words: H.state.words,
    fsrsStates: {},
    sessions: [],
    reviewLogs: [],
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

// Study leest `localDateKey` uit `@/lib/store`, dat bij import de echte
// Supabase-client opbouwt. Zonder deze mock valt de suite om op ontbrekende
// omgevingsvariabelen.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

// Maak de wachtrij deterministisch; laat de rest van fsrs (grading) echt.
vi.mock('@/lib/fsrs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fsrs')>();
  return { ...actual, buildSession: () => H.state.queue };
});

import Study from '@/pages/Study';

function renderStudy() {
  return render(<MemoryRouter><Study /></MemoryRouter>);
}

const IT_INPUT = 'typ het Italiaans';
const NL_INPUT = 'typ het Nederlands';

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
    expect(screen.getByText('Nog niet.')).toBeInTheDocument();
    expect(screen.getByText('parlare')).toBeInTheDocument();

    // Correctie-opties aanwezig — de oefening is NIET doorgesprongen
    expect(screen.getByText('Toch goed rekenen')).toBeInTheDocument();
    expect(screen.getByText('Aanpassen')).toBeInTheDocument();
    expect(screen.getByText('Verder')).toBeInTheDocument();
    expect(screen.queryByText('sessie afgerond')).not.toBeInTheDocument();
  });

  it('"Toch goed rekenen" rekent het antwoord goed en gaat door (zonder het woord te wijzigen)', () => {
    renderStudy();

    fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'fout' } });
    fireEvent.click(screen.getByText('Controleer'));
    fireEvent.click(screen.getByText('Toch goed rekenen'));

    // Sessie afgerond met 1 goed woord; het woord zelf is niet aangepast
    expect(screen.getByText('sessie afgerond')).toBeInTheDocument();
    expect(H.state.updateWord).not.toHaveBeenCalledWith('w1', expect.objectContaining({ original: expect.anything() }));
    expect(H.state.addSession).toHaveBeenCalledTimes(1);
    const session = H.state.addSession.mock.calls[0][0];
    expect(session.correct).toBe(1);
    expect(session.incorrect).toBe(0);
  });

  it('het woord aanpassen ("mijn antwoord overnemen") herbeoordeelt het antwoord meteen als goed', () => {
    // Opgeslagen Italiaans is fout; de gebruiker typt het juiste woord.
    H.state.words = [H.makeWord({ original: 'verkeerd-opgeslagen' })];
    renderStudy();

    fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
    fireEvent.click(screen.getByText('Controleer'));
    expect(screen.getByText('Nog niet.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Aanpassen'));
    fireEvent.click(screen.getByText(/Mijn antwoord overnemen/));
    fireEvent.click(screen.getByText('Opslaan'));

    // Direct verwerkt: woord opgeslagen + beoordeling bijgewerkt naar Goed
    expect(H.state.updateWord).toHaveBeenCalledWith('w1', { original: 'parlare', translation: 'praten' });
    expect(screen.getByText('Aangepast — nu goed gerekend.')).toBeInTheDocument();
    // "Toch goed rekenen" is weg omdat het al goed staat
    expect(screen.queryByText('Toch goed rekenen')).not.toBeInTheDocument();
  });

  it('bij IT→NL voegt "mijn antwoord toevoegen als betekenis" een vertaling toe en rekent goed', () => {
    H.state.queue = [{ cardId: 'w1', mode: 'typed_it_nl', dueDate: null }];
    renderStudy();

    // Prompt toont het Italiaans; gebruiker typt een geldig synoniem dat nog niet opgeslagen is
    fireEvent.change(screen.getByPlaceholderText(NL_INPUT), { target: { value: 'kletsen' } });
    fireEvent.click(screen.getByText('Controleer'));
    expect(screen.getByText('Nog niet.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Aanpassen'));
    fireEvent.click(screen.getByText(/Mijn antwoord toevoegen als betekenis/));
    fireEvent.click(screen.getByText('Opslaan'));

    expect(H.state.updateWord).toHaveBeenCalledWith('w1', { original: 'parlare', translation: 'praten; kletsen' });
    expect(screen.getByText('Aangepast — nu goed gerekend.')).toBeInTheDocument();
  });

  it('"Verder" na een fout antwoord laat het woord terugkomen als herkansing (niet verloren)', () => {
    renderStudy();

    fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'fout' } });
    fireEvent.click(screen.getByText('Controleer'));
    fireEvent.click(screen.getByText('Verder'));

    // Niet afgerond: hetzelfde woord komt terug om opnieuw te oefenen
    expect(screen.queryByText('sessie afgerond')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(IT_INPUT)).toBeInTheDocument();
  });

  it('meerkeuze: een fout antwoord pauzeert met correctie-opties (springt niet door)', () => {
    H.state.queue = [{ cardId: 'w1', mode: 'mc', dueDate: null }];
    renderStudy();

    // Kies een fout (altijd aanwezige) optie
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('onbekend'));
    act(() => { vi.advanceTimersByTime(800); });
    vi.useRealTimers();

    expect(screen.getByText('Toch goed rekenen')).toBeInTheDocument();
    expect(screen.getByText('Aanpassen')).toBeInTheDocument();
    expect(screen.getByText('Verder')).toBeInTheDocument();
    expect(screen.queryByText('sessie afgerond')).not.toBeInTheDocument();
  });

  it('meerkeuze: "Toch goed rekenen" telt het woord goed en gaat verder', () => {
    H.state.queue = [{ cardId: 'w1', mode: 'mc', dueDate: null }];
    renderStudy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByText('onbekend'));
    act(() => { vi.advanceTimersByTime(800); });
    vi.useRealTimers();
    fireEvent.click(screen.getByText('Toch goed rekenen'));

    // Doorgegaan: het woord komt als typ-oefening terug (geen MC-correctie meer)
    expect(screen.getByPlaceholderText(IT_INPUT)).toBeInTheDocument();
    expect(screen.queryByText('Toch goed rekenen')).not.toBeInTheDocument();
  });

  it('meerkeuze: het woord aanpassen wordt opgeslagen (geen "mijn antwoord"-snelkoppeling)', () => {
    H.state.queue = [{ cardId: 'w1', mode: 'mc', dueDate: null }];
    renderStudy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByText('onbekend'));
    act(() => { vi.advanceTimersByTime(800); });
    vi.useRealTimers();
    fireEvent.click(screen.getByText('Aanpassen'));

    // Bij meerkeuze is er geen "mijn antwoord overnemen"-knop
    expect(screen.queryByText(/Mijn antwoord/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('praten'), { target: { value: 'praten; babbelen' } });
    fireEvent.click(screen.getByText('Opslaan'));

    expect(H.state.updateWord).toHaveBeenCalledWith('w1', { original: 'parlare', translation: 'praten; babbelen' });
    expect(screen.getByText(/woord aangepast/)).toBeInTheDocument();
  });

  it('een correct antwoord gaat na de feedback nog steeds automatisch door (geen regressie)', () => {
    vi.useFakeTimers();
    try {
      renderStudy();

      fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
      fireEvent.click(screen.getByText('Controleer'));

      // Correct: geen verdict-tekst, alleen de flits — en geen correctie-pauze
      expect(screen.queryByText('Nog niet.')).not.toBeInTheDocument();
      expect(screen.queryByText('Verder')).not.toBeInTheDocument();
      expect(screen.queryByText('sessie afgerond')).not.toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(1000); });
      expect(screen.getByText('sessie afgerond')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Bij een goed antwoord toont de app geen feedbackscherm, dus het briefje op
   * het veld is de enige plek waar staat wanneer het woord terugkomt. 'parlare'
   * telt 7 tekens: de ijkdrempel ligt op 4000 + 7 x 300 = 6100 ms.
   */
  describe('het briefje toont wanneer het woord terugkomt', () => {
    const T = 6100;

    /** Beantwoordt goed na `elapsed` ms en geeft de tekst van het briefje terug. */
    function answerAfter(elapsed: number): string | null {
      // Zelfstandig aanroepbaar: ruim een eventuele vorige render eerst op.
      cleanup();
      renderStudy();
      act(() => { vi.advanceTimersByTime(elapsed); });

      fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
      fireEvent.click(screen.getByText('Controleer'));
      // Het briefje komt met een korte vertraging op, zodat het niet met de
      // flits vecht.
      act(() => { vi.advanceTimersByTime(200); });

      const note = screen.queryByText(/^over /);
      return note ? note.textContent : null;
    }

    /**
     * "over 3 weken" -> 21; "over 4 dagen" -> 4.
     * Let op: "weken" bevat "week" niet — week/weken, met wegvallende e.
     */
    function toDays(text: string): number {
      const n = Number(text.match(/\d+/)![0]);
      if (/weken|week/.test(text))   return n * 7;
      if (/maanden|maand/.test(text)) return n * 30;
      return n;
    }

    it('verschijnt na een goed antwoord', () => {
      vi.useFakeTimers();
      try {
        expect(answerAfter(3000)).toMatch(/^over /);
      } finally {
        vi.useRealTimers();
      }
    });

    it('belooft een langere periode naarmate je sneller antwoordt', () => {
      vi.useFakeTimers();
      try {
        const snel  = answerAfter(0.5 * T)!;
        const traag = answerAfter(1.5 * T)!;
        expect(toDays(snel)).toBeGreaterThan(toDays(traag));
      } finally {
        vi.useRealTimers();
      }
    });

    it('verschijnt niet na een fout antwoord — daar is het feedbackscherm voor', () => {
      vi.useFakeTimers();
      try {
        renderStudy();
        fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'fout' } });
        fireEvent.click(screen.getByText('Controleer'));
        act(() => { vi.advanceTimersByTime(300); });
        expect(screen.queryByText(/^over /)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('slaat de gebroken beoordeling op, niet alleen de afgeronde', async () => {
      vi.useFakeTimers();
      try {
        answerAfter(T); // precies op de drempel = halverwege
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

        const log = H.state.addReviewLog.mock.calls[0][0];
        expect(log.effectiveGrade).toBeCloseTo(3.5, 6);
        expect(log.grade).toBe(4); // afgerond, want de kolom is een SMALLINT
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('Study – elke les wordt opgeslagen', () => {
  it('slaat een halverwege afgebroken les alsnog op bij het verlaten van de pagina', () => {
    // Twee kaarten: na één antwoord is de sessie nog niet afgerond.
    H.state.words = [H.makeWord(), H.makeWord({ id: 'w2', original: 'mangiare', translation: 'eten' })];
    H.state.queue = [
      { cardId: 'w1', mode: 'typed_nl_it', dueDate: null },
      { cardId: 'w2', mode: 'typed_nl_it', dueDate: null },
    ];

    // Houd de shuffle van de wachtrij deterministisch: w1 blijft vooraan.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    vi.useFakeTimers();
    try {
      const { unmount } = renderStudy();

      fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
      fireEvent.click(screen.getByText('Controleer'));
      act(() => { vi.advanceTimersByTime(1000); });

      // Nog midden in de les: nog niets weggeschreven.
      expect(H.state.addSession).not.toHaveBeenCalled();

      unmount();

      expect(H.state.addSession).toHaveBeenCalledTimes(1);
      const session = H.state.addSession.mock.calls[0][0];
      expect(session.wordsStudied).toBe(1);
      expect(session.correct).toBe(1);
    } finally {
      vi.useRealTimers();
      random.mockRestore();
    }
  });

  it('slaat een afgeronde les precies één keer op, ook na het verlaten van de pagina', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderStudy();

      fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
      fireEvent.click(screen.getByText('Controleer'));
      act(() => { vi.advanceTimersByTime(1000); });

      expect(screen.getByText('sessie afgerond')).toBeInTheDocument();
      expect(H.state.addSession).toHaveBeenCalledTimes(1);

      unmount();
      expect(H.state.addSession).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('slaat niets op als er geen enkel woord is beantwoord', () => {
    const { unmount } = renderStudy();
    unmount();
    expect(H.state.addSession).not.toHaveBeenCalled();
  });
});

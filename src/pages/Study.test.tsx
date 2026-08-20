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
    fsrsStates: {} as Record<string, Record<string, unknown>>,
    queue: [{ cardId: 'w1', mode: 'typed_nl_it', dueDate: null }] as
      { cardId: string; mode: string; dueDate: string | null }[],
    updateWord: vi.fn(() => Promise.resolve()),
    upsertFsrsState: vi.fn(() => Promise.resolve()),
    addReviewLog: vi.fn((_log: Record<string, unknown>) => Promise.resolve()),
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
    fsrsStates: H.state.fsrsStates,
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
  H.state.fsrsStates = {};
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
   * het veld is de enige plek waar staat wanneer het woord terugkomt.
   *
   * De denktijd is de tijd tot de eerste toetsaanslag, dus de klok die deze
   * tests vooruitzetten loopt vóór het `change`-event, niet vóór het versturen.
   * De band loopt van 1 tot 15 seconden; daarbinnen schuift de beoordeling met
   * hooguit 0,3 rond 'goed'.
   */
  describe('het briefje toont wanneer het woord terugkomt', () => {
    /** Een dagsleutel zoals `localDateKey` hem maakt: lokaal, niet UTC. */
    const dayKey = (offsetDays: number) => {
      const d = new Date(Date.now() - offsetDays * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    /**
     * Een woord dat al loopt. De snelheidsbijstelling geldt niet bij de
     * allereerste beurt in een modus — die zet het startpunt, niet een stap —
     * dus zonder bestaande state valt er niets te zien.
     */
    const running = () => ({
      w1: {
        typed_nl_it: {
          stability: 10, difficulty: 5,
          dueDate: dayKey(0), lastReviewedAt: `${dayKey(10)}T10:00:00.000Z`,
        },
      },
    });

    /** Denkt `thinkMs`, typt dan goed, en geeft de tekst van het briefje terug. */
    function answerAfter(thinkMs: number): string | null {
      // Zelfstandig aanroepbaar: ruim een eventuele vorige render eerst op.
      cleanup();
      renderStudy();
      // Deze tijd valt vóór de eerste aanslag en is dus de denktijd.
      act(() => { vi.advanceTimersByTime(thinkMs); });

      fireEvent.change(screen.getByPlaceholderText(IT_INPUT), { target: { value: 'parlare' } });
      fireEvent.click(screen.getByText('Controleer'));
      // Het briefje komt met een korte vertraging op, zodat het niet met de
      // flits vecht.
      act(() => { vi.advanceTimersByTime(300); });

      const note = screen.queryByText(/^\+\d/);
      return note ? note.textContent : null;
    }

    /** "+3 wk" -> 21; "+4 d" -> 4. */
    function toDays(text: string): number {
      const n = Number(text.match(/\d+/)![0]);
      if (text.includes('wk'))  return n * 7;
      if (text.includes('mnd')) return n * 30;
      return n;
    }

    it('verschijnt na een goed antwoord, bondig', () => {
      vi.useFakeTimers();
      try {
        expect(answerAfter(3000)).toMatch(/^\+\d+ (d|wk|mnd)$/);
      } finally {
        vi.useRealTimers();
      }
    });

    it('belooft een langere periode naarmate je sneller antwoordt', () => {
      vi.useFakeTimers();
      try {
        H.state.fsrsStates = running();
        const snel  = answerAfter(500)!;
        const traag = answerAfter(20_000)!;
        expect(toDays(snel)).toBeGreaterThan(toDays(traag));
      } finally {
        vi.useRealTimers();
      }
    });

    it('de allereerste beurt in een modus laat snelheid niet meetellen', () => {
      vi.useFakeTimers();
      try {
        // Geen bestaande state: dit is de beurt die het startpunt zet, en die
        // ankers liggen te ver uit elkaar om aan een klok op te hangen.
        const snel  = answerAfter(500)!;
        const traag = answerAfter(20_000)!;
        expect(snel).toBe(traag);
      } finally {
        vi.useRealTimers();
      }
    });

    it('tikken telt niet als denken — traag typen kost de bonus niet', () => {
      vi.useFakeTimers();
      try {
        H.state.fsrsStates = running();
        cleanup();
        renderStudy();
        act(() => { vi.advanceTimersByTime(500); }); // vlot bedacht

        const field = screen.getByPlaceholderText(IT_INPUT);
        fireEvent.change(field, { target: { value: 'par' } });
        act(() => { vi.advanceTimersByTime(30_000); }); // daarna traag getikt
        fireEvent.change(field, { target: { value: 'parlare' } });
        fireEvent.click(screen.getByText('Controleer'));
        act(() => { vi.advanceTimersByTime(300); });

        const traagGetikt = screen.queryByText(/^\+\d/)!.textContent!;
        expect(toDays(traagGetikt)).toBe(toDays(answerAfter(500)!));
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
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('verschijnt niet bij meerkeuze — dat woord komt deze sessie nog terug', () => {
      H.state.queue = [{ cardId: 'w1', mode: 'mc', dueDate: null }];
      vi.useFakeTimers();
      try {
        renderStudy();
        fireEvent.click(screen.getByText('praten'));
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('slaat de gebroken beoordeling, de denktijd en het medium op', async () => {
      vi.useFakeTimers();
      try {
        H.state.fsrsStates = running();
        // 4500 ms denken is precies halverwege de band van 1 tot 8 seconden,
        // dus de helft van de zwaai omhoog: 3 + 0,3 x 0,5.
        answerAfter(4500);
        await act(async () => { await vi.advanceTimersByTimeAsync(1200); });

        const log = H.state.addReviewLog.mock.calls[0][0];
        expect(log.effectiveGrade).toBeCloseTo(3.15, 6);
        expect(log.grade).toBe(3); // afgerond, want de kolom is een SMALLINT
        expect(log.thinkMs).toBe(4500);
        // De reactietijd bevat ook het tikken en blijft apart bewaard.
        expect(log.responseMs).toBeGreaterThanOrEqual(4500);
        expect(log.inputMedium).toBe('keyboard');
      } finally {
        vi.useRealTimers();
      }
    });

    it('een moeizaam antwoord zakt onder goed, zonder als fout te tellen', async () => {
      vi.useFakeTimers();
      try {
        H.state.fsrsStates = running();
        answerAfter(20_000);
        await act(async () => { await vi.advanceTimersByTimeAsync(1200); });

        const log = H.state.addReviewLog.mock.calls[0][0];
        expect(log.effectiveGrade).toBeCloseTo(2.7, 6);
        expect(log.grade).toBe(3);
        // Zakken is geen fout: de stabiliteit groeit nog steeds, alleen minder.
        expect(log.sAfter).toBeGreaterThan(log.sBefore as number);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

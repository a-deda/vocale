import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Tests voor het wegschrijven van voortgang.
 *
 * Achtergrond: de streak werd niet altijd verlengd en sommige lessen kwamen
 * niet in de database terecht. Oorzaken waren (1) een kale UPDATE op user_stats
 * die nul rijen raakte zonder fout te geven wanneer de rij ontbrak, (2) streak-
 * berekening op een verouderde kopie van de stats, en (3) een sessie-insert die
 * bij een netwerkfout gewoon verloren ging.
 */

type Row = Record<string, unknown>;
type Result = {
  data: Row | Row[] | null;
  error: { message: string; code?: string } | null;
  /** Het totaal dat PostgREST meldt bij `count: 'exact'`. */
  count?: number | null;
};
type Call = {
  table: string; op: string; payload: Row; filters: Row; single: boolean;
  /** Het gevraagde bereik, als de aanroeper pagineert. */
  range: [number, number] | null;
};
type Handler = (call: Call) => Result;

interface Builder extends PromiseLike<Result> {
  select(): Builder;
  insert(payload: Row): Builder;
  update(payload: Row): Builder;
  upsert(payload: Row): Builder;
  delete(): Builder;
  eq(column: string, value: unknown): Builder;
  order(): Builder;
  limit(n: number): Builder;
  range(from: number, to: number): Builder;
  single(): Builder;
  maybeSingle(): Builder;
}

const H = vi.hoisted(() => {
  const calls: Call[] = [];
  let handler: Handler = () => ({ data: null, error: null });

  function builder(table: string): Builder {
    const call: Call = {
      table, op: 'select', payload: {}, filters: {}, single: false, range: null,
    };
    const b: Builder = {
      select:      () => b,
      insert:      (p) => { call.op = 'insert'; call.payload = p; return b; },
      update:      (p) => { call.op = 'update'; call.payload = p; return b; },
      upsert:      (p) => { call.op = 'upsert'; call.payload = p; return b; },
      delete:      () => { call.op = 'delete'; return b; },
      eq:          (k, v) => { call.filters[k] = v; return b; },
      order:       () => b,
      limit:       () => b,
      range:       (from, to) => { call.range = [from, to]; return b; },
      single:      () => { call.single = true; return b; },
      maybeSingle: () => { call.single = true; return b; },
      then: (resolve, reject) => {
        calls.push(call);
        return Promise.resolve(handler(call)).then(resolve, reject);
      },
    };
    return b;
  }

  const supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (table: string) => builder(table),
  };

  return {
    calls,
    supabase,
    toast: vi.fn(),
    setHandler: (h: Handler) => { handler = h; },
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: H.supabase }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: H.toast }) }));

import { useWordStore, localDateKey } from '@/lib/store';
import { queuePendingFsrsState, readPendingFsrsStates } from '@/lib/session-outbox';

/** Standaardantwoorden; per test aan te passen via `rows`/`fail`. */
const rows: { userStats: Row | null } = { userStats: null };
const fail = { studySessions: false };

function defaultHandler(call: Call): Result {
  if (call.table === 'user_stats') {
    if (call.op === 'select') return { data: rows.userStats, error: null };
    return { data: [{ ...call.payload }], error: null };
  }
  if (call.table === 'study_sessions') {
    if (call.op === 'select') return { data: [], error: null };
    // PGRST-code = permanente fout, dus geen retry-vertraging in de test.
    if (fail.studySessions) return { data: null, error: { message: 'offline', code: 'PGRST301' } };
    return { data: { id: 's1', ...call.payload }, error: null };
  }
  return { data: [], error: null };
}

function statsWrites() {
  return H.calls.filter(c => c.table === 'user_stats' && c.op !== 'select');
}

async function renderStore() {
  const hook = renderHook(() => useWordStore());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  H.calls.length = 0;
  rows.userStats = null;
  fail.studySessions = false;
  H.setHandler(defaultHandler);
  H.toast.mockClear();
  localStorage.clear();
});

describe('user_stats zonder bestaande rij', () => {
  it('maakt de rij aan bij het laden in plaats van naar nul rijen te schrijven', async () => {
    await renderStore();

    const writes = statsWrites();
    expect(writes.length).toBeGreaterThan(0);
    // Geen kale UPDATE meer: die raakte nul rijen én gaf geen fout terug.
    expect(writes.every(w => w.op === 'upsert')).toBe(true);
    expect(writes[0].payload.user_id).toBe('user-1');
  });

  it('bewaart een nieuwe streak ook als de rij nog niet bestond', async () => {
    const { result } = await renderStore();
    H.calls.length = 0;

    await act(async () => { await result.current.updateStreak(); });

    const write = statsWrites().at(-1)!;
    expect(write.op).toBe('upsert');
    expect(write.payload.current_streak).toBe(1);
    expect(write.payload.last_study_date).toBe(localDateKey(0));
    expect(result.current.stats.currentStreak).toBe(1);
  });
});

describe('streak verlengen', () => {
  it('telt door op de streak van gisteren', async () => {
    rows.userStats = {
      current_streak: 4, longest_streak: 9, last_study_date: localDateKey(1),
      total_words_learned: 100, total_sessions: 12, daily_goal: 20,
      streak_freezes: 0, freezes_earned_at_streak: 0,
    };
    const { result } = await renderStore();

    await act(async () => { await result.current.updateStreak(); });

    expect(result.current.stats.currentStreak).toBe(5);
    expect(statsWrites().at(-1)!.payload.current_streak).toBe(5);
  });

  it('verhoogt de streak niet nogmaals bij meerdere reviews op dezelfde dag', async () => {
    rows.userStats = {
      current_streak: 4, longest_streak: 9, last_study_date: localDateKey(1),
      total_words_learned: 100, total_sessions: 12, daily_goal: 20,
      streak_freezes: 0, freezes_earned_at_streak: 0,
    };
    const { result } = await renderStore();

    // Elke kaart in een sessie roept updateStreak aan; die aanroepen lopen door
    // elkaar heen. Ze moeten samen precies één verhoging opleveren.
    await act(async () => {
      await Promise.all([
        result.current.updateStreak(),
        result.current.updateStreak(),
        result.current.updateStreak(),
      ]);
    });

    expect(result.current.stats.currentStreak).toBe(5);
    expect(statsWrites().filter(w => w.payload.last_study_date === localDateKey(0))).toHaveLength(1);
  });

  it('valt terug op 1 na een onderbroken streak', async () => {
    rows.userStats = {
      current_streak: 7, longest_streak: 9, last_study_date: localDateKey(5),
      total_words_learned: 100, total_sessions: 12, daily_goal: 20,
      streak_freezes: 0, freezes_earned_at_streak: 0,
    };
    const { result } = await renderStore();

    await act(async () => { await result.current.updateStreak(); });

    expect(result.current.stats.currentStreak).toBe(1);
    expect(result.current.stats.longestStreak).toBe(9);
  });
});

describe('sessies opslaan', () => {
  const lesson = { date: new Date().toISOString(), wordsStudied: 8, correct: 6, incorrect: 2, duration: 240 };

  it('verlengt de streak zodra een les is afgerond', async () => {
    rows.userStats = {
      current_streak: 2, longest_streak: 2, last_study_date: localDateKey(1),
      total_words_learned: 10, total_sessions: 1, daily_goal: 20,
      streak_freezes: 0, freezes_earned_at_streak: 0,
    };
    const { result } = await renderStore();

    await act(async () => { await result.current.addSession(lesson); });

    expect(result.current.stats.currentStreak).toBe(3);
    expect(result.current.stats.lastStudyDate).toBe(localDateKey(0));
    expect(result.current.stats.totalSessions).toBe(2);
    expect(result.current.stats.totalWordsLearned).toBe(16);
  });

  it('houdt een mislukte les vast en verstuurt hem later alsnog', async () => {
    fail.studySessions = true;
    const { result } = await renderStore();

    await act(async () => { await result.current.addSession(lesson); });

    // Niet verloren: de les staat in de outbox voor een volgende poging.
    const stored = JSON.parse(localStorage.getItem('vocale.pendingSessions.user-1') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].wordsStudied).toBe(8);
    expect(result.current.sessions).toHaveLength(0);

    fail.studySessions = false;
    await act(async () => { await result.current.flushPendingSessions(); });

    expect(localStorage.getItem('vocale.pendingSessions.user-1')).toBeNull();
    expect(result.current.sessions).toHaveLength(1);
  });

  it('stuurt bij het opnieuw versturen dezelfde client_id mee, zodat er geen dubbele rij ontstaat', async () => {
    fail.studySessions = true;
    const { result } = await renderStore();
    await act(async () => { await result.current.addSession(lesson); });

    fail.studySessions = false;
    H.calls.length = 0;
    await act(async () => { await result.current.flushPendingSessions(); });

    const write = H.calls.find(c => c.table === 'study_sessions' && c.op !== 'select')!;
    expect(write.op).toBe('upsert');
    expect(typeof write.payload.client_id).toBe('string');
  });

  it('valt terug op een gewone insert als de database client_id nog niet kent', async () => {
    H.setHandler((call) => {
      if (call.table === 'study_sessions' && call.op === 'upsert') {
        return { data: null, error: { message: "Could not find the 'client_id' column", code: 'PGRST204' } };
      }
      return defaultHandler(call);
    });
    const { result } = await renderStore();

    await act(async () => { await result.current.addSession(lesson); });

    const sessionWrites = H.calls.filter(c => c.table === 'study_sessions' && c.op !== 'select');
    expect(sessionWrites.map(w => w.op)).toEqual(['upsert', 'insert']);
    expect(sessionWrites[1].payload).not.toHaveProperty('client_id');
    expect(localStorage.getItem('vocale.pendingSessions.user-1')).toBeNull();
    expect(result.current.sessions).toHaveLength(1);
  });
});


describe('FSRS-state opslaan — een write die niets doet is geen succes', () => {
  /**
   * De melding die dit bewaakt: een woord stond na de sessie in het overzicht,
   * en was de volgende dag weer weg. De upsert kwam terug zonder fout, maar had
   * nul rijen geraakt — een rij die je door RLS niet mag zien bezet nog wel de
   * primaire sleutel. Dat was niet te onderscheiden van opgeslagen.
   */
  const geenRijen = (call: Call): Result => {
    if (call.table === 'card_fsrs_states') return { data: [], error: null };
    return defaultHandler(call);
  };
  const welEenRij = (call: Call): Result => {
    if (call.table === 'card_fsrs_states') return { data: [{ ...call.payload }], error: null };
    return defaultHandler(call);
  };

  const state = {
    stability: 12, difficulty: 5,
    dueDate: '2026-09-01', lastReviewedAt: '2026-08-20T10:00:00.000Z',
  };

  it('meldt het en houdt de beoordeling vast als er geen rij terugkomt', async () => {
    const { result } = await renderStore();
    H.setHandler(geenRijen);

    await act(async () => {
      await result.current.upsertFsrsState('w1', 'typed_nl_it', state);
    });

    expect(H.toast).toHaveBeenCalled();
    // In de outbox, zodat hij bij de volgende start alsnog meegaat.
    expect(readPendingFsrsStates('user-1')).toHaveLength(1);
  });

  it('vraagt de rij ook echt op, anders valt nul rijen niet op', async () => {
    const { result } = await renderStore();
    H.calls.length = 0;
    H.setHandler(welEenRij);

    await act(async () => {
      await result.current.upsertFsrsState('w1', 'typed_nl_it', state);
    });

    const write = H.calls.find(c => c.table === 'card_fsrs_states' && c.op === 'upsert');
    expect(write).toBeDefined();
    expect(write!.payload.card_id).toBe('w1');
    expect(write!.payload.user_id).toBe('user-1');
  });

  it('ruimt de outbox op zodra de rij wél is aangekomen', async () => {
    const { result } = await renderStore();
    H.setHandler(welEenRij);

    await act(async () => {
      await result.current.upsertFsrsState('w1', 'typed_nl_it', state);
    });

    expect(readPendingFsrsStates('user-1')).toHaveLength(0);
    expect(result.current.fsrsStates.w1?.typed_nl_it?.stability).toBe(12);
  });

  it('stuurt bij de volgende start alsnog wat er is blijven staan', async () => {
    queuePendingFsrsState('user-1', { cardId: 'w9', mode: 'typed_nl_it', state });
    H.setHandler(welEenRij);

    await renderStore();
    await waitFor(() => expect(readPendingFsrsStates('user-1')).toHaveLength(0));

    const write = H.calls.find(c => c.table === 'card_fsrs_states' && c.op === 'upsert');
    expect(write!.payload.card_id).toBe('w9');
  });
});


describe('FSRS-states laden — een half antwoord is geen antwoord', () => {
  /**
   * De melding die dit bewaakt: woorden die gisteren beoordeeld waren stonden
   * vandaag weer open en kregen opnieuw "+3 dagen". Oorzaak was de leeskant.
   * Supabase geeft per verzoek hooguit `max-rows` rijen terug — standaard
   * duizend — zonder dat te melden, en de kale select vroeg er nooit meer op.
   * De states die buiten dat antwoord vielen lieten hun woord gloednieuw lijken,
   * waarna de eerstvolgende beurt de opgebouwde geschiedenis overschreef.
   */
  const PAGE = 1000;

  function fsrsRow(i: number): Row {
    return {
      card_id: `w${String(i).padStart(4, '0')}`,
      mode: 'typed_nl_it',
      stability: 90 + i,
      difficulty: 5,
      due_date: '2026-11-01',
      last_reviewed_at: '2026-08-27T10:00:00.000Z',
    };
  }

  /** Een server met `total` states die er nooit meer dan `cap` per keer geeft. */
  function paged(total: number, cap = PAGE): Handler {
    return (call: Call): Result => {
      if (call.table !== 'card_fsrs_states' || call.op !== 'select') {
        return defaultHandler(call);
      }
      const [from, to] = call.range ?? [0, total - 1];
      const end = Math.min(to + 1, from + cap, total);
      const page: Row[] = [];
      for (let i = from; i < end; i++) page.push(fsrsRow(i));
      return { data: page, error: null, count: total };
    };
  }

  function stateSelects() {
    return H.calls.filter(c => c.table === 'card_fsrs_states' && c.op === 'select');
  }

  it('haalt de tweede pagina op zodra de eerste vol is', async () => {
    H.setHandler(paged(1200));
    const { result } = await renderStore();

    await waitFor(() => expect(Object.keys(result.current.fsrsStates)).toHaveLength(1200));
    expect(stateSelects()).toHaveLength(2);
    expect(stateSelects()[0].range).toEqual([0, 999]);
    // Een volle pagina blijven vragen mag: een bereik dat begint binnen de
    // tabel en verder reikt dan de laatste rij levert gewoon de rest op.
    expect(stateSelects()[1].range).toEqual([1000, 1999]);

    // De laatste rij is precies degene die vroeger wegviel.
    expect(result.current.fsrsStates.w1199?.typed_nl_it?.stability).toBe(90 + 1199);
    expect(H.toast).not.toHaveBeenCalled();
  });

  it('vraagt één pagina op als de tabel daarin past', async () => {
    H.setHandler(paged(40));
    const { result } = await renderStore();

    await waitFor(() => expect(Object.keys(result.current.fsrsStates)).toHaveLength(40));
    expect(stateSelects()).toHaveLength(1);
    expect(H.toast).not.toHaveBeenCalled();
  });

  it('waarschuwt als er minder states binnenkomen dan de database meldt', async () => {
    // Een server die na de eerste pagina niets meer teruggeeft: dan is de kaart
    // onvolledig, en oefenen zou geschiedenis wissen.
    H.setHandler((call: Call): Result => {
      if (call.table !== 'card_fsrs_states' || call.op !== 'select') {
        return defaultHandler(call);
      }
      const [from] = call.range ?? [0, 0];
      if (from > 0) return { data: [], error: null, count: 1200 };
      const page: Row[] = [];
      for (let i = 0; i < PAGE; i++) page.push(fsrsRow(i));
      return { data: page, error: null, count: 1200 };
    });

    await renderStore();

    await waitFor(() => expect(H.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Voortgang niet geladen' }),
    ));
  });

  it('haalt alles op ook als de server minder geeft dan gevraagd', async () => {
    // `max-rows` lager dan onze paginagrootte: elke pagina is kort. Zou een
    // korte pagina als einde gelden, dan bleef het bij de eerste 300.
    H.setHandler(paged(900, 300));
    const { result } = await renderStore();

    await waitFor(() => expect(Object.keys(result.current.fsrsStates)).toHaveLength(900));
    expect(H.toast).not.toHaveBeenCalled();
  });
});

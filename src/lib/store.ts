import { useState, useEffect, useCallback, useRef } from 'react';
import { Word, UserStats, StudySession } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { FsrsMode, FsrsState, FsrsReviewLog } from '@/lib/fsrs';
import { FSRS_MODES, cappedDueDate, emptyFsrsState } from '@/lib/fsrs';
import { fetchAll, isComplete } from '@/lib/fetch-all';
import {
  PendingSession, makeClientId, readPendingSessions,
  queuePendingSession, unqueuePendingSession,
  queuePendingFsrsState,
  readPendingFsrsStates,
  unqueuePendingFsrsState,
} from '@/lib/session-outbox';

export type FsrsStatesMap = Record<string, Partial<Record<FsrsMode, FsrsState>>>;

/** Een gelezen review-log; het overzicht leidt hier houdbaarheid en tempo uit af. */
export type ReviewLogRow = Pick<
  FsrsReviewLog,
  | 'cardId' | 'mode' | 'grade' | 'effectiveGrade' | 'inputMedium'
  | 'sBefore' | 'sAfter' | 'reviewedAt' | 'responseMs' | 'thinkMs'
>;

/** Zoveel recente reviews zijn genoeg voor de cijfers op het overzicht. */
const REVIEW_LOG_WINDOW = 500;

const DEFAULT_STATS: UserStats = {
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: null,
  totalWordsLearned: 0,
  totalSessions: 0,
  dailyGoal: 20,
  streakFreezes: 0,
  freezesEarnedAtStreak: 0,
};

const MAX_FREEZES    = 3;
const FREEZE_INTERVAL = 10;

/** Wachttijden tussen pogingen bij een tijdelijke (netwerk)fout. */
const RETRY_DELAYS = [400, 1200, 3000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Datumsleutel in de lokale tijdzone (yyyy-mm-dd), niet in UTC. */
export function localDateKey(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Alleen netwerk-/serverstoringen zijn het opnieuw proberen waard. Fouten van
 * PostgREST of Postgres zelf (schema, rechten, constraints) blijven falen.
 */
function isTransientError(error: { code?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (!code) return true; // fetch-fout zonder code → waarschijnlijk offline
  return !(code.startsWith('PGRST') || /^[0-9]{2}[0-9A-Z]{3}$/.test(code));
}

type QueryError  = { message: string; code?: string; details?: string };
type QueryResult<T> = { data: T | null; error: QueryError | null };

/**
 * Voer een Supabase-query uit en probeer het bij een tijdelijke storing opnieuw.
 * Zonder deze herkansing ging een review of sessie bij één netwerkhikje verloren.
 */
async function withRetry<T = Record<string, unknown>>(op: () => PromiseLike<unknown>): Promise<QueryResult<T>> {
  let result: QueryResult<T> = { data: null, error: null };
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      result = await (op() as PromiseLike<QueryResult<T>>);
    } catch (e) {
      result = { data: null, error: { message: e instanceof Error ? e.message : 'Netwerkfout' } };
    }
    if (!result.error) return result;
    if (!isTransientError(result.error) || attempt === RETRY_DELAYS.length) break;
    await sleep(RETRY_DELAYS[attempt]);
  }
  return result;
}

/**
 * Oudere databases kennen de kolom `client_id` op study_sessions nog niet.
 * Dan vallen we terug op een gewone insert (zonder idempotentie).
 */
function needsClientIdFallback(error: QueryError | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST204' || code === '42703' || code === '42P10') return true;
  return `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase().includes('client_id');
}

/**
 * Ontbreekt een kolom nog op de database? Dan meldt PostgREST dat met een
 * schema-fout. De aanroeper kan dan opnieuw proberen zonder die kolom.
 */
function needsColumnFallback(error: QueryError | null, ...columns: string[]): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST204' || code === '42703') return true;
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return columns.some(column => text.includes(column));
}

// Map DB row to Word type
function dbToWord(row: any): Word {
  return {
    id: row.id,
    original: row.original,
    translation: row.translation,
    phonetic: row.phonetic || undefined,
    category: row.category || undefined,
    partOfSpeech: row.part_of_speech || undefined,
    exampleSentence: row.example_sentence || undefined,
    notes: row.notes || undefined,
    easeFactor: row.ease_factor,
    interval: row.interval,
    repetitions: row.repetitions,
    nextReview: row.next_review,
    lastReview: row.last_review || undefined,
    createdAt: row.created_at,
    status: row.status as Word['status'],
    autoTranslated: row.auto_translated,
    consecutiveErrors: row.consecutive_errors ?? 0,
  };
}

function dbToStats(row: any): UserStats {
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastStudyDate: row.last_study_date,
    totalWordsLearned: row.total_words_learned,
    totalSessions: row.total_sessions,
    dailyGoal: row.daily_goal,
    streakFreezes: row.streak_freezes ?? 0,
    freezesEarnedAtStreak: row.freezes_earned_at_streak ?? 0,
  };
}

/** Volledige user_stats-rij, zodat een upsert ook een ontbrekende rij aanmaakt. */
function statsToRow(userId: string, stats: UserStats) {
  return {
    user_id:                  userId,
    current_streak:           stats.currentStreak,
    longest_streak:           stats.longestStreak,
    last_study_date:          stats.lastStudyDate,
    total_words_learned:      stats.totalWordsLearned,
    total_sessions:           stats.totalSessions,
    daily_goal:               stats.dailyGoal,
    streak_freezes:           stats.streakFreezes,
    freezes_earned_at_streak: stats.freezesEarnedAtStreak,
  };
}

function dbToSession(row: any): StudySession {
  return {
    id: row.id,
    date: row.date,
    wordsStudied: row.words_studied,
    correct: row.correct,
    incorrect: row.incorrect,
    duration: row.duration,
  };
}

function dbToReviewLog(row: any): ReviewLogRow {
  return {
    cardId:     row.card_id,
    mode:       row.mode as FsrsMode,
    grade:      row.grade,
    effectiveGrade: row.effective_grade ?? row.grade,
    inputMedium:    row.input_medium ?? null,
    sBefore:    row.s_before,
    sAfter:     row.s_after,
    reviewedAt: row.reviewed_at,
    responseMs: row.response_ms ?? null,
    thinkMs:    row.think_ms ?? null,
  };
}

function dbToFsrsState(row: any): { cardId: string; mode: FsrsMode; state: FsrsState } {
  const state: FsrsState = {
    stability:      row.stability,
    difficulty:     row.difficulty,
    dueDate:        row.due_date,
    lastReviewedAt: row.last_reviewed_at,
  };
  return {
    cardId: row.card_id,
    mode:   row.mode as FsrsMode,
    // Rijen van vóór het intervalplafond staan soms jaren vooruit; die worden
    // hier teruggehaald. De database blijft ongemoeid tot de volgende review.
    state:  { ...state, dueDate: cappedDueDate(state) },
  };
}

export function useWordStore() {
  const [words, setWords]       = useState<Word[]>([]);
  const [stats, setStats]       = useState<UserStats>(DEFAULT_STATS);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [fsrsStates, setFsrsStates] = useState<FsrsStatesMap>({});
  const [reviewLogs, setReviewLogs] = useState<ReviewLogRow[]>([]);
  const [userId, setUserId]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const { toast } = useToast();
  /**
   * `loadAll` hangt in een effect-afhankelijkheid, dus moet stabiel zijn. Een
   * `toast` die per render van identiteit wisselt zou dat effect elke render
   * opnieuw laten draaien — en daarmee het laden eindeloos herstarten.
   */
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Spiegels van state die schrijfacties nodig hebben. Callbacks worden vaak
  // via setTimeout of een oude closure aangeroepen; via een ref rekenen ze
  // altijd met de actuele waarden in plaats van met een verouderde snapshot.
  const userIdRef = useRef<string | null>(null);
  const statsRef  = useRef<UserStats>(DEFAULT_STATS);
  /** Is de user_stats-rij daadwerkelijk uit de database gelezen (of aangemaakt)? */
  const statsLoadedRef = useRef(false);
  /** Velden die lokaal al zijn gewijzigd; die mogen niet door een herlees worden overschreven. */
  const dirtyStatsRef  = useRef(new Set<keyof UserStats>());
  /** Serialiseert schrijfacties naar user_stats zodat ze elkaar niet overschrijven. */
  const statsWriteRef  = useRef<Promise<unknown>>(Promise.resolve());

  const applyStats = useCallback((next: UserStats) => {
    statsRef.current = next;
    setStats(next);
  }, []);

  /**
   * Stuur één sessie naar de database en haal hem uit de outbox zodra dat lukt.
   * Retourneert de opgeslagen sessie, of null als het (nog) niet gelukt is.
   */
  const sendPendingSession = useCallback(async (
    uid: string,
    pending: PendingSession,
  ): Promise<StudySession | null> => {
    const base = {
      user_id:       uid,
      date:          pending.date,
      words_studied: pending.wordsStudied,
      correct:       pending.correct,
      incorrect:     pending.incorrect,
      duration:      pending.duration,
    };

    // client_id maakt opnieuw versturen idempotent: een sessie die al aankwam
    // maar waarvan het antwoord verloren ging, wordt geen tweede rij.
    let res = await withRetry(() => supabase
      .from('study_sessions')
      .upsert({ ...base, client_id: pending.clientId }, { onConflict: 'user_id,client_id' })
      .select()
      .maybeSingle());

    if (res.error && needsClientIdFallback(res.error)) {
      res = await withRetry(() => supabase
        .from('study_sessions')
        .insert(base)
        .select()
        .maybeSingle());
    }

    if (res.error) {
      console.error('Sessie opslaan mislukt:', res.error.message);
      return null;
    }

    unqueuePendingSession(uid, pending.clientId);
    return res.data ? dbToSession(res.data) : null;
  }, []);

  const mergeSessions = useCallback((incoming: StudySession[]) => {
    if (incoming.length === 0) return;
    setSessions(prev => {
      const known = new Set(prev.map(s => s.id));
      const fresh = incoming.filter(s => !known.has(s.id));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].sort((a, b) => b.date.localeCompare(a.date));
    });
  }, []);

  /** Verstuur alles wat nog in de outbox staat (bij opstarten en na herstel van de verbinding). */
  const flushPendingSessions = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const queued = readPendingSessions(uid);
    if (queued.length === 0) return;

    const delivered: StudySession[] = [];
    for (const pending of queued) {
      const saved = await sendPendingSession(uid, pending);
      if (saved) delivered.push(saved);
    }
    mergeSessions(delivered);
  }, [sendPendingSession, mergeSessions]);

  /**
   * Stuur één FSRS-state naar de database en controleer dat hij is aangekomen.
   *
   * `.select()` is hier geen luxe. Een upsert die in de conflict-tak valt op een
   * rij die je door RLS niet mag zien, raakt nul rijen en meldt geen fout. Dat
   * was niet te onderscheiden van succes: het scherm beloofde "+3 dagen", de
   * lokale kaart werd bijgewerkt, en de volgende dag was het woord weer nieuw.
   * Geen teruggekomen rij is vanaf nu een mislukking.
   */
  const sendFsrsState = useCallback(async (
    uid: string, cardId: string, mode: FsrsMode, state: FsrsState,
  ): Promise<{ ok: boolean; reason?: string }> => {
    const row = {
      card_id:          cardId,
      user_id:          uid,
      mode,
      stability:        state.stability,
      difficulty:       state.difficulty,
      due_date:         state.dueDate,
      last_reviewed_at: state.lastReviewedAt,
    };

    const { data, error } = await withRetry<Record<string, unknown>[]>(() => supabase
      .from('card_fsrs_states')
      .upsert(row, { onConflict: 'card_id,mode' })
      .select());

    if (error) return { ok: false, reason: error.message };
    if (!Array.isArray(data) || data.length === 0) {
      return { ok: false, reason: 'de database nam de rij niet aan' };
    }
    return { ok: true };
  }, []);

  /** Stuur alsnog wat er van eerdere sessies is blijven staan. */
  const flushPendingFsrsStates = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    for (const pending of readPendingFsrsStates(uid)) {
      const { ok } = await sendFsrsState(uid, pending.cardId, pending.mode, pending.state);
      if (ok) unqueuePendingFsrsState(uid, pending.cardId, pending.mode);
    }
  }, [sendFsrsState]);

  /**
   * De voortgang is niet (volledig) binnen. Niet oefenen: elke beurt op een
   * woord waarvan de state ontbreekt wordt als eerste beurt geboekt en zet de
   * opgebouwde geschiedenis terug op drie dagen.
   */
  const warnStatesIncomplete = useCallback(() => {
    toastRef.current({
      title: 'Voortgang niet geladen',
      description: 'Oefen nu niet — je geschiedenis zou overschreven worden. Probeer het later opnieuw.',
      variant: 'destructive',
    });
  }, []);

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    userIdRef.current = user.id;

    // Woorden, sessies en states worden gepagineerd opgehaald: een kale select
    // levert bij Supabase hooguit `max-rows` rijen op — standaard duizend, stil
    // afgekapt. Zie `fetchAll`. De sortering is niet cosmetisch maar de
    // voorwaarde voor betrouwbare paginering.
    const [wordsRes, statsRes, sessionsRes, fsrsRes, logsRes] = await Promise.all([
      fetchAll((from, to) => supabase.from('words').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id').range(from, to)),
      // maybeSingle i.p.v. single: een ontbrekende rij is geen fout maar iets
      // dat we hier aanmaken. Met single bleef stats op de defaults staan en
      // schreef elke latere update naar nul rijen — zonder foutmelding.
      supabase.from('user_stats').select('*').eq('user_id', user.id).maybeSingle(),
      fetchAll((from, to) => supabase.from('study_sessions').select('*', { count: 'exact' })
        .order('date', { ascending: false }).order('id').range(from, to)),
      // Op de primaire sleutel gesorteerd: (card_id, mode).
      fetchAll((from, to) => supabase.from('card_fsrs_states').select('*', { count: 'exact' })
        .order('card_id').order('mode').range(from, to)),
      // Dit venster is een keuze en geen afkapping: het overzicht heeft niet
      // meer nodig, en het statistiekenscherm haalt zelf dieper op.
      supabase.from('review_logs').select('*')
        .order('reviewed_at', { ascending: false }).limit(REVIEW_LOG_WINDOW),
    ]);

    if (wordsRes.error)    console.error('Laden woorden mislukt:', wordsRes.error.message);
    if (sessionsRes.error) console.error('Laden sessies mislukt:', sessionsRes.error.message);

    if (wordsRes.data)    setWords(wordsRes.data.map(dbToWord));
    if (sessionsRes.data) setSessions(sessionsRes.data.map(dbToSession));
    if (logsRes.data)     setReviewLogs(logsRes.data.map(dbToReviewLog));

    if (statsRes.data) {
      applyStats(dbToStats(statsRes.data));
      dirtyStatsRef.current.clear();
      statsLoadedRef.current = true;
    } else if (!statsRes.error) {
      // Nog geen statistiekenrij (bijv. na een handmatige datamigratie waarbij
      // de signup-trigger niet liep). Maak hem nu aan, anders landt er nooit
      // een streak-update.
      const { error } = await withRetry(() => supabase
        .from('user_stats')
        .upsert(statsToRow(user.id, statsRef.current), { onConflict: 'user_id' })
        .select());
      statsLoadedRef.current = !error;
      if (error) console.error('Aanmaken user_stats mislukt:', error.message);
    } else {
      console.error('Laden user_stats mislukt:', statsRes.error.message);
    }

    // Zonder states lijkt de hele woordenschat gloednieuw, en overschrijft een
    // sessie de echte geschiedenis. Een half geladen kaart doet dat net zo goed,
    // alleen voor minder woorden — dus geldt dezelfde waarschuwing.
    if (fsrsRes.error) {
      console.error('Laden FSRS-states mislukt:', fsrsRes.error.message);
      warnStatesIncomplete();
    } else if (!isComplete(fsrsRes)) {
      console.error(
        `Laden FSRS-states onvolledig: ${fsrsRes.data?.length ?? 0} van ${fsrsRes.total}`,
      );
      warnStatesIncomplete();
    }

    if (fsrsRes.data) {
      const map: FsrsStatesMap = {};
      for (const row of fsrsRes.data) {
        const { cardId, mode, state } = dbToFsrsState(row);
        if (!map[cardId]) map[cardId] = {};
        map[cardId][mode] = state;
      }
      setFsrsStates(map);
    }

    setLoading(false);
    void flushPendingSessions();
    void flushPendingFsrsStates();
  }, [applyStats, flushPendingSessions, flushPendingFsrsStates, warnStatesIncomplete]);

  useEffect(() => {
    loadAll();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadAll();
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        userIdRef.current = null;
        statsLoadedRef.current = false;
        dirtyStatsRef.current.clear();
        setWords([]);
        applyStats(DEFAULT_STATS);
        setSessions([]);
        setFsrsStates({});
        setReviewLogs([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAll, applyStats]);

  // Zodra de verbinding terug is of de app weer op de voorgrond komt: alsnog
  // versturen wat er blijven staan is.
  useEffect(() => {
    const retry = () => { void flushPendingSessions(); };
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flushPendingSessions]);

  const addWords = useCallback(async (newWords: Omit<Word, 'id'>[]) => {
    if (!userId) return;
    const rows = newWords.map(w => ({
      user_id: userId,
      original: w.original,
      translation: w.translation,
      phonetic: w.phonetic || null,
      category: w.category || null,
      part_of_speech: w.partOfSpeech || null,
      example_sentence: w.exampleSentence || null,
      notes: w.notes || null,
      ease_factor: w.easeFactor,
      interval: w.interval,
      repetitions: w.repetitions,
      next_review: w.nextReview,
      status: w.status,
      auto_translated: w.autoTranslated,
    }));

    const { data, error } = await supabase.from('words').insert(rows).select();
    if (error) {
      toast({ title: 'Fout bij opslaan', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) setWords(prev => [...data.map(dbToWord), ...prev]);
  }, [userId, toast]);

  const updateWord = useCallback(async (id: string, updates: Partial<Word>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.easeFactor       !== undefined) dbUpdates.ease_factor        = updates.easeFactor;
    if (updates.interval         !== undefined) dbUpdates.interval           = updates.interval;
    if (updates.repetitions      !== undefined) dbUpdates.repetitions        = updates.repetitions;
    if (updates.nextReview       !== undefined) dbUpdates.next_review        = updates.nextReview;
    if (updates.lastReview       !== undefined) dbUpdates.last_review        = updates.lastReview;
    if (updates.status           !== undefined) dbUpdates.status             = updates.status;
    if (updates.translation      !== undefined) dbUpdates.translation        = updates.translation;
    if (updates.original         !== undefined) dbUpdates.original           = updates.original;
    if (updates.consecutiveErrors !== undefined) dbUpdates.consecutive_errors = updates.consecutiveErrors;
    if (updates.partOfSpeech     !== undefined) dbUpdates.part_of_speech     = updates.partOfSpeech;
    if (updates.exampleSentence  !== undefined) dbUpdates.example_sentence   = updates.exampleSentence;
    if (updates.notes            !== undefined) dbUpdates.notes              = updates.notes;

    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await withRetry(() => supabase.from('words').update(dbUpdates).eq('id', id));
    if (error) {
      toast({ title: 'Fout bij bijwerken', description: error.message, variant: 'destructive' });
      return;
    }
    setWords(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  }, [toast]);

  const deleteWord = useCallback(async (id: string) => {
    const { error } = await supabase.from('words').delete().eq('id', id);
    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
      return;
    }
    setWords(prev => prev.filter(w => w.id !== id));
    setFsrsStates(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [toast]);

  /** Sla FSRS-state op voor één (kaart, modus) paar. */
  const upsertFsrsState = useCallback(async (
    cardId: string,
    mode:   FsrsMode,
    state:  FsrsState,
  ) => {
    const uid = userIdRef.current;
    if (!uid) return;

    // Eerst in de outbox, dan pas versturen — zoals bij sessies. Sluit de app
    // halverwege, dan gaat de beoordeling bij de volgende start alsnog mee.
    queuePendingFsrsState(uid, { cardId, mode, state });

    // De lokale kaart gaat meteen bij: de sessie loopt door en het overzicht
    // moet kloppen zodra je terug bent. De outbox bewaakt de database-kant.
    setFsrsStates(prev => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? {}), [mode]: state },
    }));

    const { ok, reason } = await sendFsrsState(uid, cardId, mode, state);
    if (ok) {
      unqueuePendingFsrsState(uid, cardId, mode);
      return;
    }
    toast({
      title: 'Beoordeling nog niet opgeslagen',
      description: `${reason} — hij wordt bij de volgende start opnieuw geprobeerd.`,
      variant: 'destructive',
    });
  }, [sendFsrsState, toast]);

  /** Schrijf een FSRS review-log naar de database. */
  const addReviewLog = useCallback(async (log: FsrsReviewLog) => {
    const uid = userIdRef.current;
    if (!uid) return;

    // Meteen lokaal bijhouden: het overzicht leest houdbaarheid en tempo uit
    // deze logs, en die moeten kloppen zodra je terug bent van een sessie.
    setReviewLogs(prev => [{
      cardId:     log.cardId,
      mode:       log.mode,
      grade:      log.grade,
      effectiveGrade: log.effectiveGrade,
      inputMedium: log.inputMedium,
      sBefore:    log.sBefore,
      sAfter:     log.sAfter,
      reviewedAt: log.reviewedAt,
      responseMs: log.responseMs,
      thinkMs:    log.thinkMs,
    }, ...prev].slice(0, REVIEW_LOG_WINDOW));

    const row = {
      card_id:       log.cardId,
      user_id:       uid,
      mode:          log.mode,
      grade:         log.grade,
      r_at_review:   log.rAtReview,
      s_before:      log.sBefore,
      s_after:       log.sAfter,
      d_before:      log.dBefore,
      d_after:       log.dAfter,
      interval_days: log.intervalDays,
      reviewed_at:   log.reviewedAt,
      response_ms:   log.responseMs,
    };

    // Kolommen die pas later zijn toegevoegd; de rij zonder deze drie is nog
    // steeds een bruikbare log.
    const extras = {
      effective_grade: log.effectiveGrade,
      input_medium:    log.inputMedium,
      think_ms:        log.thinkMs,
    };

    const insert = (payload: typeof row & Partial<typeof extras>) =>
      withRetry(() => supabase.from('review_logs').insert(payload));

    let res = await insert({ ...row, ...extras });

    // Staan ze nog niet op de database, dan is een kalere log beter dan geen.
    if (res.error
      && needsColumnFallback(res.error, 'effective_grade', 'input_medium', 'think_ms')) {
      res = await insert(row);
    }
    if (res.error) console.error('Review log opslaan mislukt:', res.error.message);
  }, []);

  /**
   * Zorg dat we de werkelijke user_stats-rij kennen voordat we hem overschrijven.
   * Mislukte de eerste load, dan lezen we hem hier alsnog en nemen we alleen de
   * velden over die lokaal nog niet zijn aangepast.
   */
  const ensureStatsLoaded = useCallback(async (uid: string) => {
    if (statsLoadedRef.current) return;

    const { data, error } = await withRetry(() => supabase
      .from('user_stats').select('*').eq('user_id', uid).maybeSingle());
    if (error) return; // laat de upsert het proberen; die maakt de rij desnoods aan

    if (data) {
      const remote = dbToStats(data);
      const merged: UserStats = { ...statsRef.current };
      for (const field of Object.keys(remote) as (keyof UserStats)[]) {
        if (!dirtyStatsRef.current.has(field)) Object.assign(merged, { [field]: remote[field] });
      }
      applyStats(merged);
    }
    statsLoadedRef.current = true;
  }, [applyStats]);

  const updateStats = useCallback(async (updates: Partial<UserStats>) => {
    const uid = userIdRef.current;
    if (!uid) return false;

    // Direct lokaal doorvoeren, zodat een volgende aanroep (bijv. de volgende
    // kaart in dezelfde sessie) al met de nieuwe waarden rekent.
    for (const field of Object.keys(updates) as (keyof UserStats)[]) {
      if (updates[field] !== undefined) dirtyStatsRef.current.add(field);
    }
    applyStats({ ...statsRef.current, ...updates });

    // Serialiseer de schrijfacties: parallelle updates zouden elkaars waarden
    // anders overschrijven met een oudere snapshot.
    const write = statsWriteRef.current.then(async () => {
      try {
        await ensureStatsLoaded(uid);

        // Upsert i.p.v. update: ontbreekt de rij, dan wordt hij aangemaakt. Een
        // kale update raakte in dat geval nul rijen én gaf geen fout terug, dus
        // leek de streak opgeslagen terwijl er niets werd bewaard.
        const { data, error } = await withRetry<Record<string, unknown>[]>(() => supabase
          .from('user_stats')
          .upsert(statsToRow(uid, statsRef.current), { onConflict: 'user_id' })
          .select());

        if (error) {
          toast({ title: 'Fout bij bijwerken stats', description: error.message, variant: 'destructive' });
          return false;
        }
        if (!data || data.length === 0) {
          // Een upsert die niets teruggeeft betekent dat de rij is geweigerd
          // (bijv. door RLS). Vroeger bleef dat volledig onopgemerkt.
          toast({
            title: 'Voortgang niet opgeslagen',
            description: 'De database accepteerde de wijziging niet. Controleer je toegangsrechten.',
            variant: 'destructive',
          });
          return false;
        }
        statsLoadedRef.current = true;
        return true;
      } catch (e) {
        console.error('Stats opslaan mislukt:', e);
        return false;
      }
    });

    statsWriteRef.current = write;
    return write;
  }, [applyStats, ensureStatsLoaded, toast]);

  const updateStreak = useCallback(async () => {
    const today      = localDateKey(0);
    const yesterday  = localDateKey(1);
    const twoDaysAgo = localDateKey(2);

    // Lees uit de ref, niet uit de closure: deze callback wordt vanuit oude
    // renders en vanuit setTimeout aangeroepen. Met een verouderde snapshot
    // werd de streak op een oude waarde herberekend of onnodig opnieuw gezet.
    const newStats = { ...statsRef.current };
    if (newStats.lastStudyDate === today) return;

    let newStreak: number;
    let freezeUsed  = false;
    let newFreezes  = newStats.streakFreezes;

    if (newStats.lastStudyDate === yesterday) {
      newStreak = newStats.currentStreak + 1;
    } else if (newStats.lastStudyDate === twoDaysAgo && newStats.streakFreezes > 0) {
      newStreak  = newStats.currentStreak + 1;
      newFreezes = newStats.streakFreezes - 1;
      freezeUsed = true;
    } else {
      newStreak = 1;
    }

    let newEarnedAt  = newStats.freezesEarnedAtStreak;
    let freezeEarned = false;
    const milestone  = Math.floor(newStreak / FREEZE_INTERVAL) * FREEZE_INTERVAL;
    if (milestone > 0 && milestone > newStats.freezesEarnedAtStreak && newFreezes < MAX_FREEZES) {
      newFreezes   = Math.min(newFreezes + 1, MAX_FREEZES);
      newEarnedAt  = milestone;
      freezeEarned = true;
    } else if (milestone > newStats.freezesEarnedAtStreak) {
      newEarnedAt = milestone;
    }
    if (newStreak < newStats.freezesEarnedAtStreak) newEarnedAt = 0;

    await updateStats({
      currentStreak:        newStreak,
      longestStreak:        Math.max(newStats.longestStreak, newStreak),
      lastStudyDate:        today,
      streakFreezes:        newFreezes,
      freezesEarnedAtStreak: newEarnedAt,
    });

    if (freezeUsed)  toast({ title: '❄️ Streak freeze gebruikt!', description: `Je streak loopt door. Je hebt nog ${newFreezes} freeze${newFreezes === 1 ? '' : 's'} over.` });
    if (freezeEarned) toast({ title: '❄️ Freeze verdiend!',       description: `${newStreak} dagen streak — je hebt nu ${newFreezes} freeze${newFreezes === 1 ? '' : 's'}.` });
  }, [updateStats, toast]);

  const addSession = useCallback(async (session: Omit<StudySession, 'id'>) => {
    const uid = userIdRef.current;
    if (!uid) return;

    // Eerst synchroon in de outbox. Gaat het versturen mis — of sluit de
    // gebruiker de app voordat het antwoord binnen is — dan wordt de sessie
    // bij de volgende start alsnog verstuurd in plaats van verloren te gaan.
    const pending: PendingSession = { ...session, clientId: makeClientId() };
    queuePendingSession(uid, pending);

    const saved = await sendPendingSession(uid, pending);
    if (saved) {
      mergeSessions([saved]);
    } else {
      toast({
        title: 'Les nog niet opgeslagen',
        description: 'Geen verbinding met de server. We proberen het automatisch opnieuw.',
      });
    }

    // Tellers bijwerken vanuit de ref: `stats` uit de closure kon achterlopen
    // waardoor het totaal terugsprong naar een oudere waarde.
    await updateStats({
      totalSessions:     statsRef.current.totalSessions + 1,
      totalWordsLearned: statsRef.current.totalWordsLearned + session.correct,
    });

    // Een afgeronde les telt altijd voor de streak, ook als het per kaart
    // wegschrijven eerder mislukte.
    await updateStreak();
  }, [sendPendingSession, mergeSessions, updateStats, updateStreak, toast]);

  return {
    words, stats, sessions, fsrsStates, reviewLogs, userId, loading,
    addWords, updateWord, deleteWord,
    upsertFsrsState, addReviewLog,
    updateStats, updateStreak, addSession, flushPendingSessions,
  };
}

// Real AI translation via edge function
export async function autoTranslate(words: string[]): Promise<Record<string, string>> {
  console.log('Calling translate function with:', words);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken || supabaseKey}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ words }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Translate error response:', response.status, errorData);
      throw new Error(errorData.error || `Vertaalfout (${response.status})`);
    }

    const data = await response.json();
    if (data?.error) throw new Error(data.error);
    return data.translations || {};
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Vertaling duurde te lang, probeer opnieuw.');
    throw e;
  }
}

import { useState, useEffect, useCallback } from 'react';
import { Word, UserStats, StudySession } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { FsrsMode, FsrsState, FsrsReviewLog } from '@/lib/fsrs';
import { FSRS_MODES, emptyFsrsState } from '@/lib/fsrs';

export type FsrsStatesMap = Record<string, Partial<Record<FsrsMode, FsrsState>>>;

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

function dbToFsrsState(row: any): { cardId: string; mode: FsrsMode; state: FsrsState } {
  return {
    cardId: row.card_id,
    mode:   row.mode as FsrsMode,
    state: {
      stability:      row.stability,
      difficulty:     row.difficulty,
      dueDate:        row.due_date,
      lastReviewedAt: row.last_reviewed_at,
    },
  };
}

export function useWordStore() {
  const [words, setWords]       = useState<Word[]>([]);
  const [stats, setStats]       = useState<UserStats>(DEFAULT_STATS);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [fsrsStates, setFsrsStates] = useState<FsrsStatesMap>({});
  const [userId, setUserId]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const { toast } = useToast();

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const [wordsRes, statsRes, sessionsRes, fsrsRes] = await Promise.all([
      supabase.from('words').select('*').order('created_at', { ascending: false }),
      supabase.from('user_stats').select('*').single(),
      supabase.from('study_sessions').select('*').order('date', { ascending: false }),
      supabase.from('card_fsrs_states').select('*'),
    ]);

    if (wordsRes.data)    setWords(wordsRes.data.map(dbToWord));
    if (statsRes.data)    setStats(dbToStats(statsRes.data));
    if (sessionsRes.data) setSessions(sessionsRes.data.map(dbToSession));

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
  }, []);

  useEffect(() => {
    loadAll();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadAll();
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        setWords([]);
        setStats(DEFAULT_STATS);
        setSessions([]);
        setFsrsStates({});
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAll]);

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

    const { error } = await supabase.from('words').update(dbUpdates).eq('id', id);
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
    if (!userId) return;
    const row = {
      card_id:          cardId,
      user_id:          userId,
      mode,
      stability:        state.stability,
      difficulty:       state.difficulty,
      due_date:         state.dueDate,
      last_reviewed_at: state.lastReviewedAt,
    };

    const { error } = await supabase
      .from('card_fsrs_states')
      .upsert(row, { onConflict: 'card_id,mode' });

    if (error) {
      toast({ title: 'Fout bij FSRS opslaan', description: error.message, variant: 'destructive' });
      return;
    }

    setFsrsStates(prev => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? {}), [mode]: state },
    }));
  }, [userId, toast]);

  /** Schrijf een FSRS review-log naar de database. */
  const addReviewLog = useCallback(async (log: FsrsReviewLog) => {
    if (!userId) return;
    const { error } = await supabase.from('review_logs').insert({
      card_id:       log.cardId,
      user_id:       userId,
      mode:          log.mode,
      grade:         log.grade,
      r_at_review:   log.rAtReview,
      s_before:      log.sBefore,
      s_after:       log.sAfter,
      d_before:      log.dBefore,
      d_after:       log.dAfter,
      interval_days: log.intervalDays,
      reviewed_at:   log.reviewedAt,
    });
    if (error) console.error('Review log opslaan mislukt:', error.message);
  }, [userId]);

  const updateStats = useCallback(async (updates: Partial<UserStats>) => {
    if (!userId) return;
    const dbUpdates: Record<string, any> = {};
    if (updates.currentStreak          !== undefined) dbUpdates.current_streak           = updates.currentStreak;
    if (updates.longestStreak          !== undefined) dbUpdates.longest_streak           = updates.longestStreak;
    if (updates.lastStudyDate          !== undefined) dbUpdates.last_study_date          = updates.lastStudyDate;
    if (updates.totalWordsLearned      !== undefined) dbUpdates.total_words_learned      = updates.totalWordsLearned;
    if (updates.totalSessions          !== undefined) dbUpdates.total_sessions           = updates.totalSessions;
    if (updates.dailyGoal              !== undefined) dbUpdates.daily_goal               = updates.dailyGoal;
    if (updates.streakFreezes          !== undefined) dbUpdates.streak_freezes           = updates.streakFreezes;
    if (updates.freezesEarnedAtStreak  !== undefined) dbUpdates.freezes_earned_at_streak = updates.freezesEarnedAtStreak;

    const { error } = await supabase.from('user_stats').update(dbUpdates).eq('user_id', userId);
    if (error) {
      toast({ title: 'Fout bij bijwerken stats', description: error.message, variant: 'destructive' });
      return;
    }
    setStats(prev => ({ ...prev, ...updates }));
  }, [userId, toast]);

  const updateStreak = useCallback(async () => {
    const localDate = (offset = 0) => {
      const d = new Date(Date.now() - offset * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const today      = localDate(0);
    const yesterday  = localDate(1);
    const twoDaysAgo = localDate(2);

    const newStats = { ...stats };
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
  }, [stats, updateStats, toast]);

  const addSession = useCallback(async (session: Omit<StudySession, 'id'>) => {
    if (!userId) return;
    const { data, error } = await supabase.from('study_sessions').insert({
      user_id:       userId,
      date:          session.date,
      words_studied: session.wordsStudied,
      correct:       session.correct,
      incorrect:     session.incorrect,
      duration:      session.duration,
    }).select().single();

    if (error) {
      toast({ title: 'Fout bij opslaan sessie', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) setSessions(prev => [dbToSession(data), ...prev]);

    await updateStats({
      totalSessions:    stats.totalSessions + 1,
      totalWordsLearned: stats.totalWordsLearned + session.correct,
    });
  }, [userId, stats, updateStats, toast]);

  return {
    words, stats, sessions, fsrsStates, userId, loading,
    addWords, updateWord, deleteWord,
    upsertFsrsState, addReviewLog,
    updateStats, updateStreak, addSession,
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

import { useState, useEffect, useCallback } from 'react';
import { Word, UserStats, StudySession } from '@/types/word';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_STATS: UserStats = {
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: null,
  totalWordsLearned: 0,
  totalSessions: 0,
  dailyGoal: 20,
};

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

export function useWordStore() {
  const [words, setWords] = useState<Word[]>([]);
  const [stats, setStats] = useState<UserStats>(DEFAULT_STATS);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load data when user is authenticated
  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const [wordsRes, statsRes, sessionsRes] = await Promise.all([
        supabase.from('words').select('*').order('created_at', { ascending: false }),
        supabase.from('user_stats').select('*').single(),
        supabase.from('study_sessions').select('*').order('date', { ascending: false }),
      ]);

      if (wordsRes.data) setWords(wordsRes.data.map(dbToWord));
      if (statsRes.data) setStats(dbToStats(statsRes.data));
      if (sessionsRes.data) setSessions(sessionsRes.data.map(dbToSession));
      setLoading(false);
    };

    loadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUserId(session.user.id);
        // Reload data
        const [wordsRes, statsRes, sessionsRes] = await Promise.all([
          supabase.from('words').select('*').order('created_at', { ascending: false }),
          supabase.from('user_stats').select('*').single(),
          supabase.from('study_sessions').select('*').order('date', { ascending: false }),
        ]);
        if (wordsRes.data) setWords(wordsRes.data.map(dbToWord));
        if (statsRes.data) setStats(dbToStats(statsRes.data));
        if (sessionsRes.data) setSessions(sessionsRes.data.map(dbToSession));
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        setWords([]);
        setStats(DEFAULT_STATS);
        setSessions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
    if (updates.easeFactor !== undefined) dbUpdates.ease_factor = updates.easeFactor;
    if (updates.interval !== undefined) dbUpdates.interval = updates.interval;
    if (updates.repetitions !== undefined) dbUpdates.repetitions = updates.repetitions;
    if (updates.nextReview !== undefined) dbUpdates.next_review = updates.nextReview;
    if (updates.lastReview !== undefined) dbUpdates.last_review = updates.lastReview;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.translation !== undefined) dbUpdates.translation = updates.translation;
    if (updates.original !== undefined) dbUpdates.original = updates.original;

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
  }, [toast]);

  const updateStats = useCallback(async (updates: Partial<UserStats>) => {
    if (!userId) return;
    const dbUpdates: Record<string, any> = {};
    if (updates.currentStreak !== undefined) dbUpdates.current_streak = updates.currentStreak;
    if (updates.longestStreak !== undefined) dbUpdates.longest_streak = updates.longestStreak;
    if (updates.lastStudyDate !== undefined) dbUpdates.last_study_date = updates.lastStudyDate;
    if (updates.totalWordsLearned !== undefined) dbUpdates.total_words_learned = updates.totalWordsLearned;
    if (updates.totalSessions !== undefined) dbUpdates.total_sessions = updates.totalSessions;
    if (updates.dailyGoal !== undefined) dbUpdates.daily_goal = updates.dailyGoal;

    const { error } = await supabase.from('user_stats').update(dbUpdates).eq('user_id', userId);
    if (error) {
      toast({ title: 'Fout bij bijwerken stats', description: error.message, variant: 'destructive' });
      return;
    }
    setStats(prev => ({ ...prev, ...updates }));
  }, [userId, toast]);

  const updateStreak = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const newStats = { ...stats };
    if (newStats.lastStudyDate === today) return;
    const newStreak = newStats.lastStudyDate === yesterday ? newStats.currentStreak + 1 : 1;
    const updates = {
      currentStreak: newStreak,
      longestStreak: Math.max(newStats.longestStreak, newStreak),
      lastStudyDate: today,
    };
    await updateStats(updates);
  }, [stats, updateStats]);

  const addSession = useCallback(async (session: Omit<StudySession, 'id'>) => {
    if (!userId) return;
    const { data, error } = await supabase.from('study_sessions').insert({
      user_id: userId,
      date: session.date,
      words_studied: session.wordsStudied,
      correct: session.correct,
      incorrect: session.incorrect,
      duration: session.duration,
    }).select().single();

    if (error) {
      toast({ title: 'Fout bij opslaan sessie', description: error.message, variant: 'destructive' });
      return;
    }
    if (data) setSessions(prev => [dbToSession(data), ...prev]);

    await updateStats({
      totalSessions: stats.totalSessions + 1,
      totalWordsLearned: stats.totalWordsLearned + session.correct,
    });
  }, [userId, stats, updateStats, toast]);

  return { words, stats, sessions, userId, loading, addWords, updateWord, deleteWord, updateStats, updateStreak, addSession };
}

// Real AI translation via edge function
export async function autoTranslate(words: string[]): Promise<Record<string, string>> {
  const { data, error } = await supabase.functions.invoke('translate', {
    body: { words },
  });
  if (error) throw new Error(error.message || 'Vertaalfout');
  if (data?.error) throw new Error(data.error);
  return data.translations || {};
}

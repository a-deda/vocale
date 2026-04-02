import { useState, useEffect, useCallback } from 'react';
import { Word, UserStats, StudySession } from '@/types/word';

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

const DEFAULT_STATS: UserStats = {
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: '',
  totalWordsLearned: 0,
  totalSessions: 0,
  dailyGoal: 20,
};

export function useWordStore() {
  const [words, setWords] = useState<Word[]>(() => loadFromStorage('lexis-words', []));
  const [stats, setStats] = useState<UserStats>(() => loadFromStorage('lexis-stats', DEFAULT_STATS));
  const [sessions, setSessions] = useState<StudySession[]>(() => loadFromStorage('lexis-sessions', []));

  useEffect(() => { saveToStorage('lexis-words', words); }, [words]);
  useEffect(() => { saveToStorage('lexis-stats', stats); }, [stats]);
  useEffect(() => { saveToStorage('lexis-sessions', sessions); }, [sessions]);

  const addWords = useCallback((newWords: Word[]) => {
    setWords(prev => [...prev, ...newWords]);
  }, []);

  const updateWord = useCallback((id: string, updates: Partial<Word>) => {
    setWords(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  }, []);

  const deleteWord = useCallback((id: string) => {
    setWords(prev => prev.filter(w => w.id !== id));
  }, []);

  const updateStats = useCallback((updates: Partial<UserStats>) => {
    setStats(prev => ({ ...prev, ...updates }));
  }, []);

  const updateStreak = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    setStats(prev => {
      if (prev.lastStudyDate === today) return prev;
      const newStreak = prev.lastStudyDate === yesterday ? prev.currentStreak + 1 : 1;
      return {
        ...prev,
        currentStreak: newStreak,
        longestStreak: Math.max(prev.longestStreak, newStreak),
        lastStudyDate: today,
      };
    });
  }, []);

  const addSession = useCallback((session: StudySession) => {
    setSessions(prev => [...prev, session]);
    setStats(prev => ({
      ...prev,
      totalSessions: prev.totalSessions + 1,
      totalWordsLearned: prev.totalWordsLearned + session.correct,
    }));
  }, []);

  return { words, stats, sessions, addWords, updateWord, deleteWord, updateStats, updateStreak, addSession };
}

// Mock AI translation (Italian → Dutch)
const MOCK_TRANSLATIONS: Record<string, string> = {
  'effimero': 'vluchtig',
  'resilienza': 'veerkracht',
  'serenità': 'sereniteit',
  'eloquenza': 'welsprekendheid',
  'luminescente': 'lichtgevend',
  'ambivalenza': 'ambivalentie',
  'ineffabile': 'onuitsprekelijk',
  'quintessenza': 'kwintessens',
};

export async function autoTranslate(word: string): Promise<string> {
  // Simulate API delay
  await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  const lower = word.toLowerCase().trim();
  if (MOCK_TRANSLATIONS[lower]) return MOCK_TRANSLATIONS[lower];
  // Fallback: return placeholder
  return `[vertaling van "${word}"]`;
}

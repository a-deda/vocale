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
  currentStreak: 7,
  longestStreak: 12,
  lastStudyDate: new Date().toISOString().split('T')[0],
  totalWordsLearned: 48,
  totalSessions: 14,
  dailyGoal: 20,
};

const SAMPLE_WORDS: Word[] = [
  { id: '1', original: 'Effimero', translation: 'Vluchtig, vergankelijk', phonetic: '/ef.ˈfi.me.ro/', category: 'Academisch', partOfSpeech: 'bijvoeglijk naamwoord', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'new', autoTranslated: false },
  { id: '2', original: 'Resilienza', translation: 'Veerkracht', phonetic: '/re.zi.ˈljɛn.tsa/', category: 'Psychologie', partOfSpeech: 'zelfstandig naamwoord', easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), status: 'learning', autoTranslated: false },
  { id: '3', original: 'Serenità', translation: 'Sereniteit, kalmte', phonetic: '/se.re.ni.ˈta/', category: 'Filosofie', partOfSpeech: 'zelfstandig naamwoord', easeFactor: 2.6, interval: 3, repetitions: 2, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000 * 7).toISOString(), status: 'review', autoTranslated: false },
  { id: '4', original: 'Eloquenza', translation: 'Welsprekendheid', phonetic: '/e.lo.ˈkwɛn.tsa/', category: 'Literatuur', partOfSpeech: 'zelfstandig naamwoord', easeFactor: 2.8, interval: 14, repetitions: 4, nextReview: new Date(Date.now() + 86400000 * 5).toISOString(), createdAt: new Date(Date.now() - 86400000 * 14).toISOString(), status: 'stable', autoTranslated: false },
  { id: '5', original: 'Luminescente', translation: 'Lichtgevend', phonetic: '/lu.mi.neʃ.ˈʃɛn.te/', category: 'Academisch', partOfSpeech: 'bijvoeglijk naamwoord', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000).toISOString(), status: 'new', autoTranslated: true },
  { id: '6', original: 'Ambivalenza', translation: 'Ambivalentie, tegenstrijdigheid', category: 'Psychologie', partOfSpeech: 'zelfstandig naamwoord', easeFactor: 2.4, interval: 1, repetitions: 1, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), status: 'learning', autoTranslated: false },
  { id: '7', original: 'Quintessenza', translation: 'Kwintessens, essentie', category: 'Filosofie', partOfSpeech: 'zelfstandig naamwoord', easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000 * 1).toISOString(), status: 'new', autoTranslated: false },
  { id: '8', original: 'Ineffabile', translation: 'Onuitsprekelijk', phonetic: '/i.nef.ˈfa.bi.le/', category: 'Academisch', partOfSpeech: 'bijvoeglijk naamwoord', easeFactor: 2.3, interval: 2, repetitions: 1, nextReview: new Date().toISOString(), createdAt: new Date(Date.now() - 86400000 * 4).toISOString(), status: 'learning', autoTranslated: true },
];

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

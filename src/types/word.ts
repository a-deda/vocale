export interface Word {
  id: string;
  original: string; // Italian word
  translation: string; // Dutch translation
  phonetic?: string;
  category?: string;
  partOfSpeech?: string;
  exampleSentence?: string;
  notes?: string;
  // SM-2 velden (legacy, niet meer gebruikt voor planning)
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReview?: string;
  // Meta
  createdAt: string;
  status: 'new' | 'learning' | 'review' | 'stable';
  autoTranslated: boolean;
  consecutiveErrors: number;
}

export interface StudySession {
  id: string;
  date: string;
  wordsStudied: number;
  correct: number;
  incorrect: number;
  duration: number; // seconds
}

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  totalWordsLearned: number;
  totalSessions: number;
  dailyGoal: number;
  streakFreezes: number;
  freezesEarnedAtStreak: number;
}

export type Difficulty = 'easy' | 'good' | 'hard' | 'again';

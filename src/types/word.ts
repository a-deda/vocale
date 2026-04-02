export interface Word {
  id: string;
  original: string; // Italian word
  translation: string; // Dutch translation
  phonetic?: string;
  category?: string;
  partOfSpeech?: string;
  exampleSentence?: string;
  notes?: string;
  // SRS fields
  easeFactor: number; // SM-2 ease factor (default 2.5)
  interval: number; // days until next review
  repetitions: number; // consecutive correct answers
  nextReview: string; // ISO date
  lastReview?: string;
  // Meta
  createdAt: string;
  status: 'new' | 'learning' | 'review' | 'stable';
  autoTranslated: boolean;
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
  lastStudyDate: string;
  totalWordsLearned: number;
  totalSessions: number;
  dailyGoal: number;
}

export type Difficulty = 'hard' | 'good' | 'easy';

import { Word, Difficulty } from '@/types/word';

/**
 * SM-2 Spaced Repetition Algorithm
 * Based on SuperMemo 2 with modifications for vocabulary learning
 */

const QUALITY_MAP: Record<Difficulty, number> = {
  hard: 2,   // Barely recalled
  good: 4,   // Recalled with effort  
  easy: 5,   // Perfect recall
};

export function calculateNextReview(word: Word, difficulty: Difficulty): Partial<Word> {
  const quality = QUALITY_MAP[difficulty];
  let { easeFactor, interval, repetitions } = word;

  // Update ease factor (minimum 1.3)
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  if (quality < 3) {
    // Failed: reset
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // Adjust interval based on difficulty
  if (difficulty === 'hard') interval = Math.max(1, Math.round(interval * 0.6));
  if (difficulty === 'easy') interval = Math.round(interval * 1.3);

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  let status: Word['status'] = 'learning';
  if (interval >= 21) status = 'stable';
  else if (repetitions >= 2) status = 'review';

  return {
    easeFactor,
    interval,
    repetitions,
    nextReview: nextReview.toISOString(),
    lastReview: new Date().toISOString(),
    status,
  };
}

export function createNewWord(original: string, translation: string, autoTranslated = false): Word {
  return {
    id: crypto.randomUUID(),
    original: original.trim(),
    translation: translation.trim(),
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: 'new',
    autoTranslated,
  };
}

export function getWordsForReview(words: Word[], limit = 20): Word[] {
  const now = new Date();
  const due = words
    .filter(w => new Date(w.nextReview) <= now)
    .sort((a, b) => {
      // Prioritize: new > learning > review
      const priority = { new: 0, learning: 1, review: 2, stable: 3 };
      if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
      return new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime();
    });
  return due.slice(0, limit);
}

export function getReviewIntervalText(difficulty: Difficulty, word: Word): string {
  const result = calculateNextReview(word, difficulty);
  const days = result.interval || 1;
  if (days === 1) return '1 dag';
  if (days < 7) return `${days} dagen`;
  if (days < 30) return `${Math.round(days / 7)} weken`;
  return `${Math.round(days / 30)} maanden`;
}

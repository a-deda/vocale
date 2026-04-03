import { Word } from '@/types/word';

/**
 * SM-2 Spaced Repetition Algorithm
 * Two-phase review: Introduction (multiple choice) → Production (typed input)
 */

export type ReviewRating = 'good' | 'almost' | 'wrong';

// SM-2 ease factor adjustments per rating
const EF_DELTA: Record<ReviewRating, number> = {
  good: +0.1,
  almost: -0.15,
  wrong: -0.2,
};

/**
 * Calculate next review after a production review.
 * "almost" counts as wrong for interval purposes.
 */
export function calculateNextReview(word: Word, rating: ReviewRating): Partial<Word> {
  let { easeFactor, interval, repetitions } = word;

  // Adjust ease factor (min 1.3)
  easeFactor = Math.max(1.3, easeFactor + EF_DELTA[rating]);

  if (rating === 'good') {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  } else {
    // "almost" and "wrong" both reset interval
    repetitions = 0;
    interval = 1;
  }

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

/**
 * After introduction phase, mark word as 'learning' with interval=1 day.
 */
export function markIntroduced(word: Word): Partial<Word> {
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + 1);
  return {
    status: 'learning',
    interval: 1,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: nextReview.toISOString(),
    lastReview: new Date().toISOString(),
  };
}

export function createNewWord(original: string, translation: string, autoTranslated = false): Omit<Word, 'id'> {
  return {
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
      // Prioritize: new > learning > review > stable
      const priority = { new: 0, learning: 1, review: 2, stable: 3 };
      if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
      return new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime();
    });
  return due.slice(0, limit);
}

/**
 * Fuzzy match: normalize accents, compare with Levenshtein distance.
 * Returns 'correct' | 'almost' | 'wrong'
 */
export function fuzzyMatch(input: string, correct: string): 'correct' | 'almost' | 'wrong' {
  const normalize = (s: string) => s.trim().toLowerCase();
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const a = normalize(input);
  const b = normalize(correct);

  if (a === b) return 'correct';
  if (stripAccents(a) === stripAccents(b)) return 'correct'; // accents optional

  // Levenshtein distance
  const dist = levenshtein(a, b);
  if (dist <= 1) return 'almost';

  // Also check without accents
  const distNoAccent = levenshtein(stripAccents(a), stripAccents(b));
  if (distNoAccent <= 1) return 'almost';

  return 'wrong';
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function getReviewIntervalText(rating: ReviewRating, word: Word): string {
  const result = calculateNextReview(word, rating);
  const days = result.interval || 1;
  if (days === 1) return '1 dag';
  if (days < 7) return `${days} dagen`;
  if (days < 30) return `${Math.round(days / 7)} weken`;
  return `${Math.round(days / 30)} maanden`;
}

/**
 * Generate 3 wrong multiple-choice options from a word pool.
 */
export function generateMCOptions(correct: Word, allWords: Word[]): string[] {
  const others = allWords
    .filter(w => w.id !== correct.id && w.translation !== correct.translation)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(w => w.translation);

  // If not enough words, fill with placeholders
  const fallbacks = ['onbekend', 'geen vertaling', 'anders'];
  while (others.length < 3) {
    others.push(fallbacks[others.length]);
  }

  // Insert correct answer at random position
  const options = [...others];
  const insertAt = Math.floor(Math.random() * 4);
  options.splice(insertAt, 0, correct.translation);
  return options;
}

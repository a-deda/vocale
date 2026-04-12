import { Word } from '@/types/word';

/**
 * SM-2 Spaced Repetition Algorithm
 * Three-phase review: Introduction (MC) → Production (typed) → Flashcard (self-rated)
 */

export type ReviewRating = 'good' | 'almost' | 'wrong' | 'easy' | 'hard';

const MAX_INTERVAL = 180; // days

/**
 * Calculate next review based on rating.
 * 'hard' does NOT reset — it slightly increases the interval.
 * 'easy' gives a bonus multiplier.
 */
export function calculateNextReview(word: Word, rating: ReviewRating): Partial<Word> {
  let { easeFactor, interval, repetitions } = word;
  let consecutiveErrors = word.consecutiveErrors ?? 0;

  switch (rating) {
    case 'easy':
      easeFactor = Math.max(1.3, easeFactor + 0.15);
      repetitions += 1;
      interval = repetitions <= 1 ? 3 : Math.round(interval * easeFactor * 1.3);
      consecutiveErrors = 0;
      break;
    case 'good':
      easeFactor = Math.max(1.3, easeFactor + 0.1);
      repetitions += 1;
      if (repetitions === 1) interval = 1;
      else if (repetitions === 2) interval = 3;
      else interval = Math.round(interval * easeFactor);
      consecutiveErrors = 0;
      break;
    case 'hard':
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      repetitions += 1;
      interval = Math.max(1, Math.round(interval * 1.2));
      consecutiveErrors = 0;
      break;
    case 'almost':
    case 'wrong':
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      repetitions = 0;
      interval = 1;
      consecutiveErrors += 1;
      break;
  }

  interval = Math.min(interval, MAX_INTERVAL);

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  let status: Word['status'] = 'learning';
  if (interval >= 21) status = 'stable';
  else if (repetitions >= 2) status = 'review';

  return {
    easeFactor,
    interval,
    repetitions,
    consecutiveErrors,
    nextReview: nextReview.toISOString(),
    lastReview: new Date().toISOString(),
    status,
  };
}

/**
 * After introduction phase, mark word as 'learning' with nextReview = NOW
 * so it comes back in the same session for production.
 */
export function markIntroduced(word: Word): Partial<Word> {
  return {
    status: 'learning',
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReview: new Date().toISOString(), // NOW, not tomorrow
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
    consecutiveErrors: 0,
  };
}

export function getWordsForReview(words: Word[], limit = 20): Word[] {
  const now = new Date();

  const due = words
    .filter(w => {
      const reviewDate = new Date(w.nextReview);
      // Strictly due
      if (reviewDate <= now) return true;
      // Learning words with few reps: always available (they need more practice)
      if (w.status === 'learning' && w.repetitions < 3) return true;
      // New words are always available
      if (w.status === 'new') return true;
      return false;
    })
    .sort((a, b) => {
      // Prioritize: new > learning > review > stable, then shuffle within same priority
      const priority = { new: 0, learning: 1, review: 2, stable: 3 };
      if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
      return Math.random() - 0.5;
    });
  return due.slice(0, limit);
}

/**
 * Fuzzy match: normalize accents, compare with Levenshtein distance.
 */
export function fuzzyMatch(input: string, correct: string): 'correct' | 'almost' | 'wrong' {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[\u2018\u2019\u201B\u0060\u00B4\u02BC\u02BB\u2032\uFF07''`ʼ´]/g, "'");
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const stripApostrophes = (s: string) => s.replace(/'/g, '');

  const a = normalize(input);
  const b = normalize(correct);

  if (a === b) return 'correct';
  if (stripAccents(a) === stripAccents(b)) return 'correct';
  if (stripApostrophes(stripAccents(a)) === stripApostrophes(stripAccents(b))) return 'correct';

  // Check Italian morphological variants (gender/number endings)
  const variants = generateItalianVariants(b);
  for (const v of variants) {
    if (a === v || stripAccents(a) === stripAccents(v)) return 'correct';
  }

  const dist = levenshtein(a, b);
  if (dist <= 1) return 'almost';

  const distNoAccent = levenshtein(stripAccents(a), stripAccents(b));
  if (distNoAccent <= 1) return 'almost';

  // Check variants with levenshtein too
  for (const v of variants) {
    if (levenshtein(stripAccents(a), stripAccents(v)) <= 1) return 'almost';
  }

  return 'wrong';
}

/**
 * Generate common Italian morphological variants (gender/number).
 * e.g. "capaci" → ["capace", "capaco", "capaca"]
 *      "bella" → ["bello", "belli", "belle"]
 */
function generateItalianVariants(normalized: string): string[] {
  const variants: string[] = [];
  const words = normalized.split(/\s+/);

  // For multi-word expressions, generate variants for each word and combine
  const wordVariants = words.map(w => [w, ...getWordVariants(w)]);

  // Generate combinations (only vary one word at a time to keep it manageable)
  for (let i = 0; i < words.length; i++) {
    for (const variant of wordVariants[i]) {
      if (variant === words[i]) continue;
      const combo = [...words];
      combo[i] = variant;
      variants.push(combo.join(' '));
    }
  }

  return variants;
}

function getWordVariants(word: string): string[] {
  const endings: Record<string, string[]> = {
    'o': ['a', 'i', 'e'],    // masc.sing → fem.sing, masc.pl, fem.pl
    'a': ['o', 'i', 'e'],    // fem.sing → masc.sing, masc.pl, fem.pl
    'i': ['o', 'a', 'e'],    // masc.pl → masc.sing, fem.sing, fem.pl
    'e': ['o', 'a', 'i'],    // fem.pl / adj → other forms
  };

  const variants: string[] = [];
  const lastChar = word.slice(-1);

  if (word.length >= 3 && endings[lastChar]) {
    const stem = word.slice(0, -1);
    for (const alt of endings[lastChar]) {
      variants.push(stem + alt);
    }
  }

  return variants;
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

/**
 * Calculate a mastery score (0–100) for a word based on SRS metrics.
 * Factors: repetitions, interval, easeFactor, status.
 */
export function getMasteryScore(word: Word): number {
  if (word.status === 'new') return 0;

  // Repetitions component (max 40 points at 6+ reps)
  const repScore = Math.min(word.repetitions / 6, 1) * 40;

  // Interval component (max 50 points at 90+ days)
  const intervalScore = Math.min(word.interval / 90, 1) * 50;

  // Status bonus (max 10 points)
  const statusBonus = word.status === 'stable' ? 10 : word.status === 'review' ? 5 : 0;

  return Math.round(repScore + intervalScore + statusBonus);
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

  const fallbacks = ['onbekend', 'geen vertaling', 'anders'];
  while (others.length < 3) {
    others.push(fallbacks[others.length]);
  }

  const options = [...others];
  const insertAt = Math.floor(Math.random() * 4);
  options.splice(insertAt, 0, correct.translation);
  return options;
}

export type ExerciseType = 'mc' | 'production' | 'listening' | 'fillblank' | 'flashcard';

/**
 * Pick exercise type based on word status, consecutive errors, and available data.
 */
export function pickExerciseType(word: Word): ExerciseType {
  const pick = (options: ExerciseType[]) => options[Math.floor(Math.random() * options.length)];

  if (word.status === 'new') return 'mc';

  if (word.status === 'learning') {
    if ((word.consecutiveErrors ?? 0) >= 2) return 'mc';
    return pick(['production', 'listening']);
  }

  // review / stable
  const options: ExerciseType[] = ['flashcard', 'listening'];
  if (word.exampleSentence) options.push('fillblank');
  return pick(options);
}

/**
 * Heuristic validation for Italian-Dutch word pairs.
 * No AI needed — uses language patterns and article rules.
 */

const ITALIAN_ARTICLES = ['il', 'lo', 'la', "l'", 'i', 'gli', 'le', 'un', 'uno', 'una', "un'"];
const DUTCH_ARTICLES = ['de', 'het', 'een'];

// Common Italian patterns (letter combos rare/absent in Dutch)
const ITALIAN_SIGNALS = [
  /(?:zz|gn|gl[ie]|cc[ie]|gg[ie]|sc[ie]|ch[ie])/, // digraphs
  /(?:zione|mente|ità|aggio|ezza|ura|ismo|ista)$/, // suffixes
  /(?:are|ere|ire|ato|ito|uto|ando|endo)$/, // verb forms
  /(?:ello|ella|etto|etta|ino|ina|one|ona)$/, // diminutives/augmentatives
  /[àèéìòù]/, // accented vowels
];

// Common Dutch patterns (letter combos rare/absent in Italian)
const DUTCH_SIGNALS = [
  /(?:ij|eu|oe|ui|uu|aa|oo|ee)/, // vowel combos
  /(?:sch|cht|nk|ng|wr|dw|tw)/, // consonant clusters
  /(?:lijk|heid|baar|zaam|ting|sel|nis)$/, // suffixes
  /(?:ge\w+(?:d|t|en))$/, // past participles
  /(?:ver|ont|be)\w{3,}/, // common prefixes
];

function stripArticle(text: string): { bare: string; article: string | null } {
  const lower = text.toLowerCase().trim();
  for (const art of [...ITALIAN_ARTICLES, ...DUTCH_ARTICLES]) {
    const prefix = art.endsWith("'") ? art : art + ' ';
    if (lower.startsWith(prefix)) {
      return { bare: text.slice(prefix.length).trim(), article: art };
    }
  }
  return { bare: text.trim(), article: null };
}

function countSignals(text: string, patterns: RegExp[]): number {
  const lower = text.toLowerCase();
  return patterns.filter(p => p.test(lower)).length;
}

function looksItalian(text: string): number {
  return countSignals(text, ITALIAN_SIGNALS);
}

function looksDutch(text: string): number {
  return countSignals(text, DUTCH_SIGNALS);
}

function hasItalianArticle(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return ITALIAN_ARTICLES.some(a => lower.startsWith(a.endsWith("'") ? a : a + ' '));
}

function hasDutchArticle(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return DUTCH_ARTICLES.some(a => lower.startsWith(a + ' '));
}

function looksLikeNoun(word: string): boolean {
  const bare = stripArticle(word).bare.toLowerCase();
  // Italian nouns typically end in a vowel and don't look like verbs
  const verbEndings = /(?:are|ere|ire|ando|endo)$/;
  const endsInVowel = /[aeiou]$/;
  return endsInVowel.test(bare) && !verbEndings.test(bare);
}

export interface WordWarning {
  type: 'swapped' | 'missing-article';
  message: string;
}

/**
 * Validate an Italian→Dutch word pair and return warnings (not errors).
 */
export function validateWordPair(original: string, translation: string): WordWarning[] {
  const warnings: WordWarning[] = [];
  if (!original.trim() || !translation.trim()) return warnings;

  const origBare = stripArticle(original).bare;
  const transBare = stripArticle(translation).bare;

  // --- Check if words might be swapped ---
  const origItalianScore = looksItalian(original);
  const origDutchScore = looksDutch(original);
  const transItalianScore = looksItalian(translation);
  const transDutchScore = looksDutch(translation);

  // Only warn if there's a clear signal in both directions
  if (
    origDutchScore >= 2 && transItalianScore >= 1 &&
    origDutchScore > origItalianScore && transItalianScore > transDutchScore
  ) {
    warnings.push({
      type: 'swapped',
      message: 'Staan Italiaans en Nederlands in het juiste veld?',
    });
  }

  // --- Check for missing Italian article on nouns ---
  if (
    !hasItalianArticle(original) &&
    looksLikeNoun(original) &&
    origItalianScore >= 1 &&
    // If the Dutch side has an article, the Italian side probably should too
    (hasDutchArticle(translation) || transBare.length <= 15)
  ) {
    // Only suggest if it really looks like a standalone noun (single word or two words)
    const wordCount = original.trim().split(/\s+/).length;
    if (wordCount <= 2) {
      warnings.push({
        type: 'missing-article',
        message: 'Mist er een Italiaans lidwoord? (il/la/lo/...)',
      });
    }
  }

  return warnings;
}

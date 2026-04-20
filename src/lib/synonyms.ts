import { Word } from '@/types/word';
import { splitTranslations } from '@/lib/translation-utils';

/**
 * Find other Italian words in the user's word bank that share at least one
 * Dutch translation with the given word. Used to accept synonyms during
 * production exercises (NL → IT) where multiple Italian words can map to
 * the same Dutch meaning.
 */
export function findSynonymWords(word: Word, allWords: Word[]): Word[] {
  const targetTranslations = splitTranslations(word.translation).map(t => t.toLowerCase());
  if (targetTranslations.length === 0) return [];

  return allWords.filter(w => {
    if (w.id === word.id) return false;
    if (w.original.trim().toLowerCase() === word.original.trim().toLowerCase()) return false;
    const wTranslations = splitTranslations(w.translation).map(t => t.toLowerCase());
    return wTranslations.some(t => targetTranslations.includes(t));
  });
}

/** Just the Italian forms (originals) of synonym words */
export function findSynonymOriginals(word: Word, allWords: Word[]): string[] {
  return findSynonymWords(word, allWords).map(w => w.original);
}

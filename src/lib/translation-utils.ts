/**
 * Utilities for handling multi-translation words (semicolon-separated).
 * e.g. "langzaam; zachtjes" represents two meanings.
 */

/** Split a semicolon-separated translation string into individual translations */
export function splitTranslations(translation: string): string[] {
  return translation.split(';').map(t => t.trim()).filter(Boolean);
}

/** Format multiple translations for display (separated by " / ") */
export function formatTranslations(translation: string): string {
  return splitTranslations(translation).join(' / ');
}

/** Check if a specific translation already exists in a semicolon-separated string */
export function hasTranslation(existing: string, newTranslation: string): boolean {
  const translations = splitTranslations(existing);
  return translations.some(t => t.toLowerCase() === newTranslation.toLowerCase().trim());
}

/** Merge a new translation into an existing semicolon-separated string */
export function mergeTranslation(existing: string, newTranslation: string): string {
  if (hasTranslation(existing, newTranslation)) return existing;
  return `${existing}; ${newTranslation.trim()}`;
}

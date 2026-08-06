/**
 * Utilities for handling multi-translation words (semicolon-separated).
 * e.g. "langzaam; zachtjes" represents two meanings.
 */

/**
 * Bekende Italiaanse grammaticale afkortingen die als annotatie in
 * vertalingen/woorden kunnen voorkomen, bijv. "mooi (agg.)".
 * Deze worden voor antwoord-vergelijking weggehaald en apart getoond.
 */
const ANNOTATION_PATTERN = /\s*\((agg\.|avv\.|s\.m\.|s\.f\.|s\.n\.|v\.|v\.tr\.|v\.intr\.|v\.rifl\.|prep\.|cong\.|inter\.|pron\.|art\.|num\.|loc\.|inv\.)\)/gi;

/** Haal annotaties (zoals "(agg.)") weg uit een tekst. */
export function stripAnnotations(text: string): string {
  return text.replace(ANNOTATION_PATTERN, '').trim();
}

/**
 * Extraheer annotaties uit een tekst.
 * Geeft de gevonden annotaties terug als leesbare strings, bijv. ["agg.", "avv."].
 */
export function extractAnnotations(text: string): string[] {
  const matches: string[] = [];
  const re = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Alleen bekende grammaticale afkortingen
    if (ANNOTATION_PATTERN.test(`(${m[1]})`)) {
      matches.push(m[1]);
      ANNOTATION_PATTERN.lastIndex = 0; // reset stateful regex
    }
    ANNOTATION_PATTERN.lastIndex = 0;
  }
  return matches;
}

/** Split a semicolon-separated translation string into individual translations */
export function splitTranslations(translation: string): string[] {
  return translation.split(';').map(t => t.trim()).filter(Boolean);
}

/**
 * Het kortste geaccepteerde antwoord, in tekens: zoveel moet je minstens typen.
 *
 * `fuzzyMatch` rekent elke variant goed, dus de gebruiker mag de goedkoopste
 * kiezen. Het rauwe veld tellen zou "praten; kletsen" op 15 zetten terwijl er
 * 6 tekens nodig zijn. Annotaties als "(agg.)" typ je niet en tellen niet mee.
 */
export function answerLength(expected: string): number {
  const options = splitTranslations(expected)
    .map(t => stripAnnotations(t))
    .filter(Boolean);
  if (options.length === 0) return stripAnnotations(expected).length;
  return Math.min(...options.map(o => o.length));
}

/** Format multiple translations for display (separated by " / ") */
export function formatTranslations(translation: string): string {
  return splitTranslations(translation).join(' / ');
}

/**
 * Formateer vertalingen voor weergave en strip annotaties
 * (de annotaties worden apart getoond als tags).
 */
export function formatTranslationsClean(translation: string): string {
  return splitTranslations(translation)
    .map(t => stripAnnotations(t))
    .join(' / ');
}

/**
 * Geef alle unieke annotaties terug uit een vertaling.
 * Bijv. "mooi (agg.); snel (avv.)" → ["agg.", "avv."]
 */
export function getUniqueAnnotations(translation: string): string[] {
  const annotations: string[] = [];
  const re = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(translation)) !== null) {
    const candidate = m[1].trim();
    if (ANNOTATION_PATTERN.test(`(${candidate})`)) {
      ANNOTATION_PATTERN.lastIndex = 0;
      if (!annotations.includes(candidate)) annotations.push(candidate);
    }
    ANNOTATION_PATTERN.lastIndex = 0;
  }
  return annotations;
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

/**
 * Text normalization helpers used across the app.
 *
 * Keep regexes here Babel/jest friendly (avoid Unicode property escapes
 * such as \p{M} which Next's babel preset cannot compile in test runs).
 */

/**
 * Remove combining diacritical marks after NFD decomposition.
 * Covers the Basic Multilingual Plane combining mark ranges used by
 * Latin, Greek, Cyrillic and common symbols.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripDiacritics(text) {
  if (typeof text !== 'string') return '';
  return (
    text
      .normalize('NFD')
      // eslint-disable-next-line no-misleading-character-class -- BMP combining mark ranges after NFD
      .replace(/[\u0300-\u036f\u0483-\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, '')
  );
}

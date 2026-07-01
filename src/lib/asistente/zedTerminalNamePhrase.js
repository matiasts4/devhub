/**
 * Extract terminal name candidates from "en Chase" / "en el ex" STT phrases.
 */

import { resolveTerminalByName } from './zedTerminalResolver';
import { stripDiacritics } from '../text';

const EN_STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'the',
  'a',
  'un',
  'una',
  'de',
  'del',
  'al',
  'mi',
  'tu',
  'esa',
  'ese',
  'esta',
  'este',
]);

function normalizeText(text) {
  return stripDiacritics(text).toLowerCase();
}

/**
 * @param {string} phrase raw text after "en/in/a/al"
 * @returns {string[]}
 */
export function nameCandidatesFromEnPhrase(phrase) {
  const raw = typeof phrase === 'string' ? phrase.trim() : '';
  if (!raw) return [];

  const tokens = raw.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((t) => !EN_STOP_WORDS.has(normalizeText(t)));
  const candidates = [];

  if (filtered.length > 0) {
    candidates.push(filtered.join(' '));
    candidates.push(filtered[filtered.length - 1]);
    if (filtered.length > 1) candidates.push(filtered[0]);
  }
  if (tokens.length > 0) {
    candidates.push(tokens[tokens.length - 1]);
  }

  const seen = new Set();
  return candidates.filter((c) => {
    const key = c.toLowerCase();
    if (!c || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Pull "en …" name phrase(s) from a user message (dictation tolerant).
 *
 * @param {string} message
 * @returns {string[]}
 */
export function extractEnTerminalPhrases(message) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return [];

  const phrases = [];
  const patterns = [
    /(?:opencode|codex|hermes|open\s+code)[^\n]{0,48}?(?:en|in|a|al|dentro de?)\s+(.+?)(?:\s+(?:por favor|please)|$)/iu,
    /(?:en|in|a|al)\s+(.+?)(?:\s+(?:opencode|codex|hermes|open\s+code)|$)/iu,
    /(?:en|in|a|al)\s+(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) phrases.push(match[1].trim());
  }

  return [...new Set(phrases.filter(Boolean))];
}

/**
 * Resolve a named existing panel from message + terminal registry.
 *
 * @param {string} message
 * @param {Array<{ terminalId: string, displayName?: string }>} terminals
 * @returns {{ ok: true, displayName: string } | { code: 'ambiguous' } | null}
 */
export function resolveNamedTerminalFromMessage(message, terminals) {
  const phrases = extractEnTerminalPhrases(message);
  const tried = new Set();

  for (const phrase of phrases) {
    for (const cand of nameCandidatesFromEnPhrase(phrase)) {
      const key = cand.toLowerCase();
      if (tried.has(key)) continue;
      tried.add(key);
      const lookup = resolveTerminalByName(cand, terminals);
      if (lookup.ok) return { ok: true, displayName: lookup.displayName };
      if (lookup.code === 'ambiguous') return { code: 'ambiguous' };
    }
  }
  return null;
}

export default resolveNamedTerminalFromMessage;

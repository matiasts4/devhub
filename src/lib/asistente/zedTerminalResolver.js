/**
 * Pure name → terminalId resolver for ZED assistant.
 *
 * Matching (dictation-tolerant):
 *   1) Normalized exact (case + accent insensitive)
 *   2) Unique prefix (≥2 chars)
 *   3) Levenshtein within length-based threshold
 *   4) Ambiguity → candidates; no match → not_found
 */

import { DISPLAY_NAME_POOL } from '../terminal/displayNamePool';

const MAX_QUERY_LEN = 48;
const MIN_PREFIX_LEN = 2;

/**
 * Strip accents and normalize for fuzzy compare.
 * @param {string} name
 * @returns {string}
 */
function normalizeForLookup(name) {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');
}

/**
 * @param {number} len
 * @returns {number}
 */
function maxLevenshteinDistance(len) {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * Levenshtein distance — classic DP.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return b.length;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  let prev = new Array(shorter.length + 1);
  let curr = new Array(shorter.length + 1);
  for (let j = 0; j <= shorter.length; j++) prev[j] = j;

  for (let i = 1; i <= longer.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= shorter.length; j++) {
      const cost = longer.charCodeAt(i - 1) === shorter.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[shorter.length];
}

/**
 * @typedef {Object} TerminalLike
 * @property {string} terminalId
 * @property {string} [displayName]
 */

/**
 * @param {unknown} name
 * @param {TerminalLike[] | null | undefined} terminals
 * @returns {{ok: true, terminalId: string, displayName: string, match?: string}
 *          | {ok: false, code: 'not_found'}
 *          | {ok: false, code: 'ambiguous', candidates: Array<{terminalId: string, displayName: string}>}}
 */
function resolve(name, terminals) {
  if (typeof name !== 'string') return { ok: false, code: 'not_found' };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_QUERY_LEN) return { ok: false, code: 'not_found' };

  const queryNorm = normalizeForLookup(trimmed);
  if (!queryNorm) return { ok: false, code: 'not_found' };

  const list = Array.isArray(terminals) ? terminals : [];
  const entries = list
    .filter((t) => typeof t?.terminalId === 'string' && typeof t?.displayName === 'string')
    .map((t) => ({
      terminalId: t.terminalId,
      displayName: t.displayName,
      norm: normalizeForLookup(t.displayName),
    }))
    .filter((t) => t.norm.length > 0);

  if (entries.length === 0) return { ok: false, code: 'not_found' };

  // 1) Normalized exact
  const exact = entries.find((t) => t.norm === queryNorm);
  if (exact) {
    return {
      ok: true,
      terminalId: exact.terminalId,
      displayName: exact.displayName,
      match: 'exact',
    };
  }

  // 2) Substring / prefix (dictation truncates: "Ces" → Cesar, "ex" → Alex)
  if (queryNorm.length >= MIN_PREFIX_LEN) {
    const prefixOrContains = entries.filter(
      (t) =>
        t.norm.startsWith(queryNorm) || queryNorm.startsWith(t.norm) || t.norm.includes(queryNorm)
    );
    if (prefixOrContains.length === 1) {
      const t = prefixOrContains[0];
      return { ok: true, terminalId: t.terminalId, displayName: t.displayName, match: 'prefix' };
    }
    if (prefixOrContains.length > 1) {
      return {
        ok: false,
        code: 'ambiguous',
        candidates: prefixOrContains.map(({ terminalId, displayName }) => ({
          terminalId,
          displayName,
        })),
      };
    }
  }

  // 2b) Single active terminal: tolerate dictation when unambiguous
  if (entries.length === 1) {
    const t = entries[0];
    const d = _levenshtein(queryNorm, t.norm);
    const maxDist = Math.ceil(Math.max(queryNorm.length, t.norm.length) / 2);
    if (d <= maxDist) {
      return {
        ok: true,
        terminalId: t.terminalId,
        displayName: t.displayName,
        match: 'fuzzy_single',
      };
    }
  }

  // 3) Levenshtein fuzzy (pronunciation / STT typos)
  const maxDist = maxLevenshteinDistance(queryNorm.length);
  const close = [];
  for (const t of entries) {
    const d = _levenshtein(queryNorm, t.norm);
    if (d <= maxDist) {
      close.push({ terminalId: t.terminalId, displayName: t.displayName, distance: d });
    }
  }

  if (close.length === 0) return { ok: false, code: 'not_found' };
  if (close.length === 1) {
    const { terminalId, displayName } = close[0];
    return { ok: true, terminalId, displayName, match: 'fuzzy' };
  }

  close.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });

  const bestDist = close[0].distance;
  const tied = close.filter((c) => c.distance === bestDist);
  if (tied.length === 1) {
    const { terminalId, displayName } = tied[0];
    return { ok: true, terminalId, displayName, match: 'fuzzy' };
  }

  return {
    ok: false,
    code: 'ambiguous',
    candidates: tied.map(({ terminalId, displayName }) => ({ terminalId, displayName })),
  };
}

function resolveTerminalByName(name, processes) {
  return resolve(name, processes);
}

function nameFromId(terminalId) {
  if (typeof terminalId !== 'string') return DISPLAY_NAME_POOL[0];
  const m = terminalId.match(/^[a-zA-Z]*(\d+)$/);
  if (!m) return DISPLAY_NAME_POOL[0];
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return DISPLAY_NAME_POOL[0];
  const idx = (n - 1) % DISPLAY_NAME_POOL.length;
  return DISPLAY_NAME_POOL[idx];
}

const _NAME_RE = /^[a-zA-Z0-9_-]{1,24}$/;
const _MAX_NAME_LEN = 24;

export {
  resolve,
  resolveTerminalByName,
  nameFromId,
  normalizeForLookup,
  _levenshtein,
  _NAME_RE,
  _MAX_NAME_LEN,
};

/**
 * Pure name → terminalId resolver for ZED assistant.
 *
 * Implements ZTT-001:
 *   1) Case-insensitive exact match against `displayName`.
 *   2) Levenshtein ≤ 1 fallback (closest match wins; tie → ambiguous).
 *   3) Ambiguity (multiple matches) → returns the candidates list, sorted
 *      by distance asc then by displayName alphabetical.
 *   4) No match → `not_found`.
 *
 * Pure, no side effects, no `process` / `fs` deps — safe to unit test in
 * isolation. The terminals array is the only source of truth; the caller
 * (e.g. `list_terminals` tool) decides how fresh the list is.
 *
 * Input validation: name must be a non-empty string matching the
 * `validateDisplayName` contract (max 24 chars, `[a-zA-Z0-9_-]`).
 * Anything that fails validation is treated as `not_found` — never
 * crashes, never throws.
 */

const { DISPLAY_NAME_POOL } = require('../terminal/displayNamePool');

const MAX_NAME_LEN = 24;
const NAME_RE = /^[a-zA-Z0-9_-]{1,24}$/;

/**
 * Local validator. The pool module does not export one yet, so we keep
 * a private one here and share the same regex. This matches the
 * `validateDisplayName` shape that ZTT-001 expects: max 24, charset
 * `[a-zA-Z0-9_-]`.
 *
 * @param {string} name
 * @returns {boolean}
 */
function validateDisplayName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

/**
 * Levenshtein distance with classic DP, O(n*m) time, O(min(n,m)) space.
 * Returns 0 when both strings are equal; returns input length when the
 * other string is empty.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  // Use the shorter string as the row to keep memory bounded.
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
 * Resolve a display name to a terminalId.
 *
 * @param {unknown} name
 * @param {TerminalLike[] | null | undefined} terminals
 * @returns {{ok: true, terminalId: string, displayName: string}
 *          | {ok: false, code: 'not_found'}
 *          | {ok: false, code: 'ambiguous', candidates: Array<{terminalId: string, displayName: string}>}}
 */
function resolve(name, terminals) {
  // Validate input shape — never throw on bad input.
  if (typeof name !== 'string') return { ok: false, code: 'not_found' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, code: 'not_found' };
  if (!validateDisplayName(trimmed)) return { ok: false, code: 'not_found' };

  const lower = trimmed.toLowerCase();
  const list = Array.isArray(terminals) ? terminals : [];

  // 1) Exact case-insensitive match.
  const exact = list.find(
    (t) => typeof t?.displayName === 'string' && t.displayName.toLowerCase() === lower
  );
  if (exact) {
    return { ok: true, terminalId: exact.terminalId, displayName: exact.displayName };
  }

  // 2) Levenshtein ≤ 1 fallback. Collect every close match, then decide
  //    between single-winner, ambiguity, and not_found.
  const close = [];
  for (const t of list) {
    if (typeof t?.displayName !== 'string' || typeof t.terminalId !== 'string') continue;
    const d = _levenshtein(lower, t.displayName.toLowerCase());
    if (d <= 1) {
      close.push({ terminalId: t.terminalId, displayName: t.displayName, distance: d });
    }
  }

  if (close.length === 0) return { ok: false, code: 'not_found' };
  if (close.length === 1) {
    const { terminalId, displayName } = close[0];
    return { ok: true, terminalId, displayName };
  }

  // Sort: distance asc, then displayName alpha (case-insensitive).
  close.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });

  return {
    ok: false,
    code: 'ambiguous',
    candidates: close.map(({ terminalId, displayName }) => ({ terminalId, displayName })),
  };
}

/**
 * Alias for `resolve` — matches the long-form design spec name.
 *
 * @param {unknown} name
 * @param {TerminalLike[] | null | undefined} processes
 */
function resolveTerminalByName(name, processes) {
  return resolve(name, processes);
}

/**
 * Derive a stable pool-style display name from a `terminalId` such as
 * "p7". Used by `list_terminals` when the API omits the displayName
 * field (ZTT-002 fallback). The id "p1" maps to the first pool entry,
 * "p7" to the seventh, etc. Unknown ids fall back to the first entry.
 *
 * @param {string} terminalId
 * @returns {string}
 */
function nameFromId(terminalId) {
  if (typeof terminalId !== 'string') return DISPLAY_NAME_POOL[0];
  const m = terminalId.match(/^[a-zA-Z]*(\d+)$/);
  if (!m) return DISPLAY_NAME_POOL[0];
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return DISPLAY_NAME_POOL[0];
  const idx = (n - 1) % DISPLAY_NAME_POOL.length;
  return DISPLAY_NAME_POOL[idx];
}

module.exports = {
  resolve,
  resolveTerminalByName,
  nameFromId,
  // Exported for test isolation and to keep the contract explicit.
  _levenshtein,
  _NAME_RE: NAME_RE,
  _MAX_NAME_LEN: MAX_NAME_LEN,
};

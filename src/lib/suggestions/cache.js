/**
 * src/lib/suggestions/cache.js
 * localStorage TTL cache for smart suggestions.
 *
 * BROWSER ONLY — never import from server/API routes.
 *
 * Key pattern:  ss_{projectId}
 * Entry format: { ts: number, data: Suggestion[] }
 * TTL:          30 minutes
 */

const PREFIX = 'ss_';
const TTL = 30 * 60 * 1000; // 30 min in ms

/**
 * Get cached suggestions for a project.
 * Returns null if: key absent, expired, or malformed JSON.
 *
 * @param {string} projectId
 * @returns {import('./rules').Suggestion[] | null}
 */
function get(projectId) {
  try {
    const raw = localStorage.getItem(PREFIX + projectId);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!entry || typeof entry.ts !== 'number' || !Array.isArray(entry.data)) return null;

    const isExpired = Date.now() - entry.ts > TTL;
    if (isExpired) return null;

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store suggestions for a project.
 *
 * @param {string} projectId
 * @param {import('./rules').Suggestion[]} suggestions
 */
function set(projectId, suggestions) {
  try {
    const entry = { ts: Date.now(), data: suggestions };
    localStorage.setItem(PREFIX + projectId, JSON.stringify(entry));
  } catch {
    // localStorage can fail in private mode or when full — fail silently
  }
}

/**
 * Remove cached suggestions for a project.
 *
 * @param {string} projectId
 */
function invalidate(projectId) {
  try {
    localStorage.removeItem(PREFIX + projectId);
  } catch {
    // fail silently
  }
}

const suggestionsCache = { get, set, invalidate };

module.exports = suggestionsCache;
module.exports.get = get;
module.exports.set = set;
module.exports.invalidate = invalidate;

/**
 * timelineRedaction.js — redaction level processing (D-2, OET-5)
 *
 * Implements the redaction matrix:
 *   redaction_level = 'none'   → params stored as-is (JSON string)
 *   redaction_level = 'params_only' → params stored as '{"__redacted__": true}'
 *   redaction_level = 'full'  → params stored as null; next_step_hint cleared
 *
 * This module is isolated — timelineStore.js delegates params processing here.
 *
 * @module lib/operators/timelineRedaction
 */

/**
 * Process params value for storage based on redaction level.
 * Returns the value to store in the `params` column of operator_timeline.
 *
 * @param {object|null|undefined} params
 * @param {'none'|'params_only'|'full'} redactionLevel
 * @returns {string|null} JSON string (or null) ready to store in SQLite params column
 */
function applyRedactionLevel(params, redactionLevel) {
  if (redactionLevel === 'params_only') {
    return JSON.stringify({ __redacted__: true });
  }
  if (redactionLevel === 'full') {
    return null;
  }
  // 'none' — store as-is
  if (params == null) return null;
  return typeof params === 'string' ? params : JSON.stringify(params);
}

/**
 * Returns the processed next_step_hint based on redaction level.
 * next_step_hint is cleared (→ null) when redaction_level === 'full'.
 *
 * @param {string|null} nextStepHint
 * @param {'none'|'params_only'|'full'} redactionLevel
 * @returns {string|null}
 */
function processNextStepHint(nextStepHint, redactionLevel) {
  if (redactionLevel === 'full') return null;
  return nextStepHint || null;
}

module.exports = {
  applyRedactionLevel,
  processNextStepHint,
};

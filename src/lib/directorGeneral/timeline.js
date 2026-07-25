/**
 * @module directorGeneral/timeline
 * Pure utility: builds and POSTs a DG timeline row to the mission inbox.
 * All authority combinations are validated against DG MUST NOT rules.
 */

'use strict';

// Inlined authority map — avoids importing swarmMissions.js (server-only, has fs require)
// DG MUST NOT rules: authority must match initiator
const VALID_AUTHORITY_FOR_INITIATOR = Object.freeze({
  operator: new Set(['operator', 'operator-initiated']),
  'director-general': new Set(['operator', 'operator-initiated']),
  'swarm-director': new Set(['director', 'director-escalated', 'operator']),
});

const VALID_ACTIONS = new Set([
  'mission-request',
  'status-poll',
  'approval-required',
  'mission-result',
]);
const VALID_STATUSES = new Set([
  'pending',
  'waiting',
  'in-progress',
  'awaiting-approval',
  'completed',
  'rejected',
  'failed',
]);
const VALID_FRESHNESS = new Set(['just_now', 'stale', 'unknown']);

/**
 * Derives the base URL for API calls — works in browser and Node.
 */
function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

/**
 * Validates authority against initiator (DG MUST NOT enforcement).
 * @throws Error if the authority is not valid for the given initiator.
 */
function validateAuthority(initiator, authority) {
  const validSet = VALID_AUTHORITY_FOR_INITIATOR[initiator];
  if (!validSet || !validSet.has(authority)) {
    const allowed = validSet ? [...validSet].join(', ') : 'none';
    throw new Error(
      `DG MUST NOT: authority "${authority}" no es válido para initiator "${initiator}". ` +
        `Permitidos: ${allowed}.`
    );
  }
}

/**
 * Builds a validated timeline row object (does NOT persist).
 * @param {string} action — mission-request | status-poll | approval-required | mission-result
 * @param {string} status — pending | waiting | in-progress | awaiting-approval | completed | rejected | failed
 * @param {Object} opts
 * @param {string}   opts.missionId
 * @param {string}   [opts.initiator='director-general']
 * @param {string}   [opts.target='swarm-director']
 * @param {string}   [opts.authority='operator-initiated']
 * @param {string}   [opts.freshness='just_now']
 * @param {string}   [opts.fallback='']
 * @returns {Object} row — the validated row object (not yet persisted)
 */
function buildTimelineRow(action, status, opts = {}) {
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(
      `action inválido: ${action}. Valores válidos: ${[...VALID_ACTIONS].join(', ')}`
    );
  }
  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      `status inválido: ${status}. Valores válidos: ${[...VALID_STATUSES].join(', ')}`
    );
  }

  const missionId = opts.missionId;
  if (!missionId) throw new Error('missionId es requerido.');

  const initiator = opts.initiator || 'director-general';
  const target = opts.target || 'swarm-director';
  const authority = opts.authority || 'operator-initiated';
  const freshness = opts.freshness || 'just_now';
  const fallback = opts.fallback !== undefined ? String(opts.fallback) : '';

  validateAuthority(initiator, authority);

  if (!VALID_FRESHNESS.has(freshness)) {
    throw new Error(
      `freshness inválido: ${freshness}. Valores válidos: ${[...VALID_FRESHNESS].join(', ')}`
    );
  }

  const id = crypto.randomUUID();
  const timestamp = Date.now();

  return {
    id,
    missionId,
    timestamp,
    initiator,
    target,
    action,
    status,
    authority,
    freshness,
    fallback,
  };
}

/**
 * POSTs a timeline row to the mission inbox timeline endpoint.
 * @param {Object} row — validated row object from buildTimelineRow
 * @param {Object} [fetchImpl] — optional fetch for test injection
 * @returns {Promise<Object>} — server response row (with server-assigned id/timestamp)
 */
async function postTimelineRow(row, fetchImpl) {
  const base = getBaseUrl();
  const url = `${base}/api/agenthub/missions/${row.missionId}/timeline`;

  // Use injected fetch or fall back to global fetch at call time (not definition time)
  const fetcher = fetchImpl || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);

  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Timeline POST falló: ${response.status}`);
  }

  const payload = await response.json();
  return payload.row || row;
}

/**
 * Builds a validated timeline row and immediately POSTs it to the timeline endpoint.
 * Returns the server-persisted row (with server-assigned id and timestamp).
 *
 * @param {string} action
 * @param {string} status
 * @param {Object} opts
 * @param {Function} [fetchImpl] — optional fetch for test injection
 * @returns {Promise<Object>}
 */
async function emitRow(action, status, opts = {}, fetchImpl) {
  const row = buildTimelineRow(action, status, opts);
  return postTimelineRow(row, fetchImpl);
}

module.exports = {
  buildTimelineRow,
  postTimelineRow,
  emitRow,
  // exported for testing
  validateAuthority,
  VALID_ACTIONS,
  VALID_STATUSES,
  VALID_FRESHNESS,
};

/**
 * @module directorGeneral/bridge
 * Mission inbox client for DG bridge.
 * All external calls go exclusively to /api/agenthub/missions/*.
 * DG NEVER imports or calls worker roster functions.
 */

'use strict';

function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

// Module-level active mission tracking (session scope)
let _activeMissionId = null;
let _activeMissionTerminal = false;

function setActiveMission(missionId, terminal = false) {
  _activeMissionId = missionId;
  _activeMissionTerminal = terminal;
}

function clearActiveMission() {
  _activeMissionId = null;
  _activeMissionTerminal = false;
}

function getActiveMissionId() {
  return _activeMissionId;
}

function isActiveMissionTerminal() {
  return _activeMissionTerminal;
}

/**
 * Submits a DG mission request to the mission inbox.
 * Throws if a non-terminal mission is already active (duplicate guard).
 *
 * @param {Object} intent — { action, params, humanReadableSummary }
 * @param {Object} [config]
 * @param {Function} [config.fetchImpl]
 * @returns {Promise<{missionId, status}>}
 */
async function submitMissionRequest(intent, config = {}) {
  const fetcher = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  const base = getBaseUrl();

  // Duplicate submission guard — check BEFORE any network call
  const activeId = config.activeMissionId || _activeMissionId;
  if (activeId && !_activeMissionTerminal) {
    const error = new Error('Hay una misión activa — esperá a que finalize o cancelala primero.');
    error.code = 'DUPLICATE_MISSION';
    throw error;
  }

  const missionId = crypto.randomUUID();
  const payload = {
    type: 'director-general-mission-request',
    missionId,
    intent,
    authority: 'operator',
    initiator: 'director-general',
    target: 'swarm-director',
    requestedAt: Date.now(),
    followUpIntervalMs: 1000,
  };

  const response = await fetcher(`${base}/api/agenthub/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (body.status === 'director-offline') {
    setActiveMission(missionId, true);
    return { missionId, status: 'director-offline' };
  }

  if (!response.ok) {
    throw new Error(body.error || `Mission request falló: ${response.status}`);
  }

  setActiveMission(missionId, false);
  return { missionId, status: body.status || 'pending' };
}

/**
 * Posts an approval reply to the mission inbox.
 *
 * @param {string} missionId
 * @param {string} approvalItemId
 * @param {string} decision — 'approved' | 'rejected'
 * @param {Object} [config]
 * @param {Function} [config.fetchImpl]
 * @returns {Promise<Object>}
 */
async function postApprovalReply(missionId, approvalItemId, decision, config = {}) {
  const fetcher = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  const base = getBaseUrl();

  const payload = {
    type: 'director-general-approval-reply',
    missionId,
    approvalItemId,
    decision,
    decidedBy: 'operator',
    decidedAt: Date.now(),
    authority: 'operator',
  };

  const response = await fetcher(`${base}/api/agenthub/missions/${missionId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 409) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(
      body.error || 'La aprobación expiró. Volvé a intentar desde el Director.'
    );
    error.code = 'APPROVAL_EXPIRED';
    error.status = 409;
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Approval reply falló: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches current mission status for polling.
 *
 * @param {string} missionId
 * @param {Object} [config]
 * @param {Function} [config.fetchImpl]
 * @returns {Promise<Object>}
 */
async function getMissionStatus(missionId, config = {}) {
  const fetcher = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  const base = getBaseUrl();

  const response = await fetcher(`${base}/api/agenthub/missions/${missionId}/status`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Status fetch falló: ${response.status}`);
  }

  const payload = await response.json();

  // Parse freshness from updatedAt
  const updatedAt = payload.updatedAt ? Number(payload.updatedAt) : 0;
  const ageMs = updatedAt ? Date.now() - updatedAt : Infinity;
  const freshness = ageMs <= 5_000 ? 'just_now' : 'stale';

  return { ...payload, freshness };
}

/**
 * Fetches all DG timeline rows for a mission.
 *
 * @param {string} missionId
 * @param {Object} [config]
 * @param {Function} [config.fetchImpl]
 * @returns {Promise<{missionId, rows}>}
 */
async function getMissionTimeline(missionId, config = {}) {
  const fetcher = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  const base = getBaseUrl();

  const response = await fetcher(`${base}/api/agenthub/missions/${missionId}/timeline`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Timeline fetch falló: ${response.status}`);
  }

  return response.json();
}

module.exports = {
  submitMissionRequest,
  postApprovalReply,
  getMissionStatus,
  getMissionTimeline,
  // internal state management (for hook integration)
  getActiveMissionId,
  setActiveMission,
  clearActiveMission,
  isActiveMissionTerminal,
};

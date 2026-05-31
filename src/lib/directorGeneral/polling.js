/**
 * @module directorGeneral/polling
 * Polling loop with AbortController, exponential backoff, and terminal-state detection.
 * Per design Section 5: polling starts after config.pollIntervalMs delay.
 */

'use strict';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'rejected']);
const NON_TRANSIENT_STATUSES = new Set([403, 404, 409]);
const MAX_RETRIES = 3;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const STALE_THRESHOLD_MS = 30_000;

function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(status) {
  return status >= 500;
}

/**
 * Starts a polling loop for a DG mission.
 * Returns synchronously; polling runs in background.
 *
 * @param {string} missionId
 * @param {Object} config
 * @param {number} [config.pollIntervalMs=1000]
 * @param {Function} [config.fetchImpl] — optional fetch for test injection
 * @param {Object} callbacks
 * @param {Function} callbacks.onStatus — called with status object on each poll
 * @param {Function} callbacks.onFailure — called with failure info on terminal failure
 * @returns {{ stop: Function, done: Promise }}
 */
function startPolling(missionId, config = {}, callbacks = {}) {
  const { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, fetchImpl } = config;
  const { onStatus = () => {}, onFailure = () => {} } = callbacks;

  const abortController = new AbortController();
  const fetcher = fetchImpl || (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);
  const base = getBaseUrl();

  let interval = pollIntervalMs;
  let retries = 0;
  let stopped = false;
  let pollingStartTime = Date.now();
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  const stop = () => {
    stopped = true;
    abortController.abort();
    resolveDone();
  };

  // Background polling — runs without blocking the return
  runPollingLoop(missionId, abortController, fetcher, base, callbacks, {
    getInterval: () => interval,
    setInterval: (v) => { interval = v; },
    getRetries: () => retries,
    setRetries: (v) => { retries = v; },
    getStopped: () => stopped,
    getPollingStartTime: () => pollingStartTime,
    resolveDone,
  }, { pollIntervalMs, stop });

  return { stop, done };
}

async function runPollingLoop(missionId, abortController, fetcher, base, callbacks, state, config) {
  const { onStatus, onFailure } = callbacks;
  const { pollIntervalMs, stop } = config;

  while (!state.getStopped() && !abortController.signal.aborted) {
    // Polling starts after pollIntervalMs delay (per design Section 5)
    await sleep(state.getInterval());
    if (state.getStopped() || abortController.signal.aborted) break;

    let statusCode = 0;
    let payload = null;

    try {
      const response = await fetcher(
        `${base}/api/agenthub/missions/${missionId}/status`,
        {
          method: 'GET',
          signal: abortController.signal,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (abortController.signal.aborted || state.getStopped()) break;

      statusCode = response.status;

      if (!response.ok) {
        if (NON_TRANSIENT_STATUSES.has(statusCode)) {
          await onFailure({
            status: 'failed',
            fallback: `Error ${statusCode} del Director.`,
            statusCode,
          });
          break;
        }

        if (isTransientError(statusCode)) {
          state.setRetries(state.getRetries() + 1);
          if (state.getRetries() <= MAX_RETRIES) {
            state.setInterval(Math.min(state.getInterval() * 2, pollIntervalMs * Math.pow(2, MAX_RETRIES)));
            continue;
          }
          await onFailure({
            status: 'failed',
            fallback: 'Error de conexión con el Director tras múltiples intentos.',
            statusCode,
          });
          break;
        }
      }

      payload = await response.json();
      state.setRetries(0);
      state.setInterval(pollIntervalMs);

      // director-offline: emit failure immediately, do not continue polling
      if (payload.status === 'director-offline') {
        await onFailure({
          status: 'director-offline',
          fallback: 'El Director no está disponible. Verificá que el servicio esté corriendo.',
        });
        break; // loop exits immediately
      }

      const isStale = Date.now() - state.getPollingStartTime() > STALE_THRESHOLD_MS;
      const enriched = {
        ...payload,
        freshness: isStale ? 'stale' : (payload.freshness || 'just_now'),
      };

      if (TERMINAL_STATUSES.has(payload.status)) {
        await onStatus(enriched);
        break;
      }

      // approval-required: emit row but do NOT break (continue polling)
      await onStatus(enriched);
    } catch (_err) {
      if (abortController.signal.aborted || state.getStopped()) break;

      state.setRetries(state.getRetries() + 1);
      if (state.getRetries() <= MAX_RETRIES) {
        state.setInterval(Math.min(state.getInterval() * 2, pollIntervalMs * Math.pow(2, MAX_RETRIES)));
        continue;
      }
      await onFailure({
        status: 'failed',
        fallback: 'Error de conexión con el Director.',
        statusCode: null,
      });
      break;
    }
  }

  state.resolveDone();
}

module.exports = { startPolling, TERMINAL_STATUSES, STALE_THRESHOLD_MS };

/**
 * T1.3 / R-PERF-3 — Promise.race batch gate.
 *
 * The WIP launch path uses a `setTimeout(4500)` to flush the
 * swarm-launch batch. This module is the additive event-driven
 * replacement: a `Promise.race` between (a) the director's
 * `director.prompted` event and (b) an 8-second safety timer
 * that aborts with a typed `LaunchAbort({ reason: 'director_ready_timeout' })`.
 *
 * Worst-case gate: 8s timeout, typically the director event
 * arrives at < 200ms.
 *
 * @typedef {Object} SwarmLaunchBus
 * @property {(event: string, handler: (...args: any[]) => void) => Promise<any>} once
 * @property {(event: string, ...args: any[]) => void} emit
 */

export const DIRECTOR_PROMPTED_EVENT = 'director.prompted';
export const DEFAULT_BATCH_GATE_TIMEOUT_MS = 8000;

/**
 * Typed abort error. The reason is one of the constants below.
 */
export class LaunchAbort extends Error {
  constructor({ reason, event, timeoutMs } = {}) {
    super(`Launch aborted: ${reason}${event ? ` (waiting on ${event})` : ''}`);
    this.name = 'LaunchAbort';
    this.reason = reason;
    this.event = event || null;
    this.timeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : null;
  }
}

export const LAUNCH_ABORT_REASONS = Object.freeze({
  DIRECTOR_READY_TIMEOUT: 'director_ready_timeout',
  DIRECTOR_PROMPTED_TIMEOUT: 'director_prompted_timeout',
  BUS_EMIT_FAILED: 'bus_emit_failed',
});

/**
 * Helper: returns a promise that rejects with a typed LaunchAbort
 * after `timeoutMs`. The timer is exposed so the caller can clear
 * it on early resolution.
 *
 * @param {object} params
 * @param {number} params.timeoutMs
 * @param {string} params.reason
 * @param {string} [params.event]
 * @returns {Promise<never> & { __abortTimer?: NodeJS.Timeout }}
 */
export function abortAfter({ timeoutMs, reason, event = null } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(
      new LaunchAbort({ reason: LAUNCH_ABORT_REASONS.BUS_EMIT_FAILED, event })
    );
  }
  let timer;
  const promise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new LaunchAbort({ reason, event, timeoutMs }));
    }, timeoutMs);
  });
  promise.__abortTimer = timer;
  return promise;
}

/**
 * Race a bus event against a safety timer. Resolves with the bus
 * payload on event arrival, or rejects with a typed LaunchAbort
 * after the safety timer fires. The timer is cleared on early
 * resolution to avoid leaking handles.
 *
 * @param {object} params
 * @param {SwarmLaunchBus} params.bus
 * @param {string} [params.event='director.prompted']
 * @param {number} [params.timeoutMs=8000]
 * @param {string} [params.timeoutReason='director_ready_timeout']
 * @returns {Promise<any>}
 */
export function awaitBatchGateEvent({
  bus,
  event = DIRECTOR_PROMPTED_EVENT,
  timeoutMs = DEFAULT_BATCH_GATE_TIMEOUT_MS,
  timeoutReason = LAUNCH_ABORT_REASONS.DIRECTOR_READY_TIMEOUT,
} = {}) {
  if (!bus || typeof bus.once !== 'function') {
    return Promise.reject(
      new LaunchAbort({ reason: LAUNCH_ABORT_REASONS.BUS_EMIT_FAILED, event })
    );
  }

  // Wire the bus listener FIRST so the event cannot be lost
  // between timer setup and listener registration.
  let resolveOuter;
  let rejectOuter;
  const busPromise = new Promise((resolve, reject) => {
    resolveOuter = resolve;
    rejectOuter = reject;
  });
  const busCleanup = bus.once(event, (payload) => {
    resolveOuter(payload);
  });

  const timerPromise = abortAfter({ timeoutMs, reason: timeoutReason, event });

  return Promise.race([busPromise, timerPromise])
    .then((value) => {
      if (timerPromise.__abortTimer) clearTimeout(timerPromise.__abortTimer);
      if (typeof busCleanup === 'function') busCleanup();
      return value;
    })
    .catch((err) => {
      if (timerPromise.__abortTimer) clearTimeout(timerPromise.__abortTimer);
      if (typeof busCleanup === 'function') busCleanup();
      // Re-tag generic errors as LaunchAbort.
      if (err && err.name === 'LaunchAbort') throw err;
      if (rejectOuter) {
        // Fallback: surface the bus error if the abort path didn't.
        throw err;
      }
      throw err;
    });
}

export default {
  DIRECTOR_PROMPTED_EVENT,
  DEFAULT_BATCH_GATE_TIMEOUT_MS,
  LAUNCH_ABORT_REASONS,
  LaunchAbort,
  abortAfter,
  awaitBatchGateEvent,
};

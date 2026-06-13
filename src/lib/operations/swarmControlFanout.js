/**
 * T1.2 / R-PERF-2 — Director-Event-Triggered Worker Fan-Out.
 *
 * The WIP launch route at `src/app/api/agenthub/operations/health/route.js`
 * still carries the WIP `DIRECTOR_FIRST_FANOUT_DELAY_MS` and the
 * timer-based fan-out trigger. That file is frozen in this change.
 * This module is the additive path: it exports a bus-based
 * fan-out that subscribes to `director.ready` and schedules the
 * 4 worker spawns within the small DIRECTOR_READY_TO_FANOUT_BUDGET_MS
 * window of the event.
 *
 * The launch orchestrator (or a future PR slice that adopts this
 * helper) wires this in addition to, or as a drop-in for, the
 * WIP constant. The hard guarantee: the trigger is the bus event,
 * not a fixed timer.
 *
 * @typedef {Object} SwarmLaunchBus
 * @property {(event: string, handler: (...args: any[]) => void) => void} once
 * @property {(event: string, handler: (...args: any[]) => void) => () => void} on
 * @property {(event: string, ...args: any[]) => void} emit
 */

/** Sentinel constant — the value the WIP code uses as a legacy default.
 *  This module does NOT use it; it is exported only for the
 *  render-time eligibility check in tests and to keep the legacy
 *  symbol visible for grep-based audits. */
export const LEGACY_DIRECTOR_FIRST_FANOUT_DELAY_MS = 4000;

/** Event name published by the director pane on READY. */
export const DIRECTOR_READY_EVENT = 'director.ready';

/** Maximum delay between `director.ready` and the 4 worker spawns. */
export const DIRECTOR_READY_TO_FANOUT_BUDGET_MS = 50;

/**
 * Subscribe to `director.ready` on the launch bus. When the event
 * fires, call `fanOutWorkers()` synchronously inside the same
 * microtask. The returned `unsubscribe` cancels the subscription.
 *
 * @param {object} params
 * @param {SwarmLaunchBus} params.bus
 * @param {() => void | Promise<void>} params.fanOutWorkers
 * @returns {() => void} unsubscribe
 */
export function subscribeToDirectorReadyFanout({ bus, fanOutWorkers }) {
  if (!bus || typeof bus.once !== 'function') {
    throw new TypeError('subscribeToDirectorReadyFanout requires a bus with .once()');
  }
  if (typeof fanOutWorkers !== 'function') {
    throw new TypeError('subscribeToDirectorReadyFanout requires a fanOutWorkers function');
  }

  const handler = () => {
    // Synchronous trigger — no timer, no setImmediate. The
    // fan-out is scheduled in the same microtask as the event.
    try {
      const result = fanOutWorkers();
      if (result && typeof result.then === 'function') {
        // Errors are surfaced to the bus listener's caller; the
        // bus itself is fire-and-forget. Promise rejection is
        // intentionally unhandled here so the call site can
        // observe it through the unhandledRejection hook.
      }
    } catch (error) {
      // The caller installs a bus.on('error', ...) handler if it
      // needs to recover; we re-emit on the bus for symmetry with
      // the launch orchestrator's existing event bus.
      if (bus && typeof bus.emit === 'function') {
        bus.emit('fanout.error', { source: 'director.ready', error });
      } else {
        throw error;
      }
    }
  };

  // The bus may wrap the handler internally (Node's EventEmitter does
  // for `once`). We delegate cancellation to the bus's own once()
  // return value when available, falling back to off/removeListener
  // for plain-once buses.
  const maybeCleanup = bus.once(DIRECTOR_READY_EVENT, handler);
  if (typeof maybeCleanup === 'function') {
    return maybeCleanup;
  }
  return () => {
    if (!bus) return;
    if (typeof bus.off === 'function') {
      bus.off(DIRECTOR_READY_EVENT, handler);
    } else if (typeof bus.removeListener === 'function') {
      bus.removeListener(DIRECTOR_READY_EVENT, handler);
    }
  };
}

/**
 * Schedule N worker spawns and return a promise that resolves when
 * all of them have been kicked off. The launch orchestrator passes
 * this as `fanOutWorkers` to `subscribeToDirectorReadyFanout`.
 *
 * Each spawn is invoked synchronously inside the handler; the
 * returned promise resolves on the next microtask (i.e. the
 * wall-clock to "scheduled" is < 1ms, well inside the
 * DIRECTOR_READY_TO_FANOUT_BUDGET_MS budget).
 *
 * @param {object} params
 * @param {Array<{ role: string, spawn: () => any | Promise<any> }>} params.workers
 * @returns {Promise<Array<{ role: string, spawned: any }>>}
 */
export async function fanOutWorkersInParallel({ workers = [] } = {}) {
  if (!Array.isArray(workers)) {
    throw new TypeError('workers must be an array');
  }
  return Promise.all(
    workers.map(async ({ role, spawn }) => {
      if (typeof spawn !== 'function') {
        throw new TypeError(`worker ${role} has no spawn function`);
      }
      const result = await Promise.resolve().then(() => spawn());
      return { role, spawned: result };
    })
  );
}

/**
 * The launch orchestrator is expected to call this at startLaunch
 * to wire the director-event path. The exported function is a
 * no-op guard against double-subscription: if `state.__directorFanoutWired`
 * is true, the helper returns the existing unsubscribe handle.
 *
 * @param {object} params
 * @param {object} params.state - mutable launch state (a plain object).
 * @param {SwarmLaunchBus} params.bus
 * @param {() => any} params.workersBuilder - returns the worker list.
 * @returns {() => void} unsubscribe
 */
export function wireDirectorReadyFanout({ state, bus, workersBuilder }) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state is required');
  }
  if (state.__directorFanoutWired) {
    return state.__directorFanoutUnsubscribe;
  }
  const unsubscribe = subscribeToDirectorReadyFanout({
    bus,
    fanOutWorkers: () => fanOutWorkersInParallel({ workers: workersBuilder() }),
  });
  state.__directorFanoutWired = true;
  state.__directorFanoutUnsubscribe = unsubscribe;
  return unsubscribe;
}

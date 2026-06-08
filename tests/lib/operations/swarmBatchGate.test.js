/**
 * T1.3 / R-PERF-3 — Promise.race batch gate on director.prompted.
 *
 * The WIP launch path uses a flat 4500ms `setTimeout` to flush the
 * swarm-launch batch. This test asserts the new event-driven gate:
 * a `Promise.race` between the director's `director.prompted` event
 * and an 8s safety timer that aborts with a typed `LaunchAbort`.
 *
 * Worst-case = 8s timeout. Typical = director event at < 200ms.
 */

const {
  DIRECTOR_PROMPTED_EVENT,
  DEFAULT_BATCH_GATE_TIMEOUT_MS,
  LAUNCH_ABORT_REASONS,
  LaunchAbort,
  abortAfter,
  awaitBatchGateEvent,
} = require('../../../src/lib/operations/swarmBatchGate');

class FakeBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, handler) {
    this._add(event, handler);
    return () => this._remove(event, handler);
  }
  once(event, handler) {
    let called = false;
    const wrap = (...args) => {
      if (called) return;
      called = true;
      this._remove(event, wrap);
      handler(...args);
    };
    this._add(event, wrap);
    return () => this._remove(event, wrap);
  }
  emit(event, ...args) {
    const list = this.listeners.get(event) || [];
    for (const handler of [...list]) {
      try {
        handler(...args);
      } catch (err) {
        if (this.onError) this.onError(err);
        else throw err;
      }
    }
  }
  _add(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }
  _remove(event, handler) {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }
}

describe('swarm-launch-perf > R-PERF-3 > Promise.race batch gate', () => {
  test('batch gate releases on director.prompted event, not on flat timeout', async () => {
    const bus = new FakeBus();
    const gate = awaitBatchGateEvent({
      bus,
      event: DIRECTOR_PROMPTED_EVENT,
      timeoutMs: 8000,
    });

    // Emit director.prompted at t=180ms.
    setTimeout(() => bus.emit(DIRECTOR_PROMPTED_EVENT, { paneId: 'p-director' }), 180);

    const start = Date.now();
    const payload = await gate;
    const elapsed = Date.now() - start;

    expect(payload).toEqual({ paneId: 'p-director' });
    expect(elapsed).toBeGreaterThanOrEqual(170);
    expect(elapsed).toBeLessThan(500);
  });

  test('gate rejects with LaunchAbort when the bus stays silent', async () => {
    const bus = new FakeBus();
    const gate = awaitBatchGateEvent({
      bus,
      event: DIRECTOR_PROMPTED_EVENT,
      timeoutMs: 200, // tight budget for the test
      timeoutReason: LAUNCH_ABORT_REASONS.DIRECTOR_PROMPTED_TIMEOUT,
    });

    await expect(gate).rejects.toBeInstanceOf(LaunchAbort);
    await expect(gate).rejects.toMatchObject({
      reason: LAUNCH_ABORT_REASONS.DIRECTOR_PROMPTED_TIMEOUT,
      event: DIRECTOR_PROMPTED_EVENT,
      timeoutMs: 200,
    });
  });

  test('DEFAULT_BATCH_GATE_TIMEOUT_MS is the 8s safety budget', () => {
    expect(DEFAULT_BATCH_GATE_TIMEOUT_MS).toBe(8000);
  });

  test('LAUNCH_ABORT_REASONS covers the canonical abort cases', () => {
    expect(LAUNCH_ABORT_REASONS.DIRECTOR_READY_TIMEOUT).toBe('director_ready_timeout');
    expect(LAUNCH_ABORT_REASONS.DIRECTOR_PROMPTED_TIMEOUT).toBe('director_prompted_timeout');
  });

  test('abortAfter rejects with LaunchAbort carrying the supplied reason', async () => {
    await expect(
      abortAfter({ timeoutMs: 30, reason: 'tui_ready_timeout', event: 'TUI_READY' })
    ).rejects.toMatchObject({
      name: 'LaunchAbort',
      reason: 'tui_ready_timeout',
      event: 'TUI_READY',
    });
  });

  test('gate rejects with LaunchAbort when the bus is missing', async () => {
    const gate = awaitBatchGateEvent({ bus: null, event: 'director.prompted' });
    await expect(gate).rejects.toBeInstanceOf(LaunchAbort);
  });

  test('late bus event after timeout does not crash and the listener is cleaned up', async () => {
    const bus = new FakeBus();
    const gate = awaitBatchGateEvent({
      bus,
      event: DIRECTOR_PROMPTED_EVENT,
      timeoutMs: 50,
    });
    await expect(gate).rejects.toBeInstanceOf(LaunchAbort);
    // Emit after the gate already rejected. The listener was cleaned up.
    expect(() => bus.emit(DIRECTOR_PROMPTED_EVENT, { late: true })).not.toThrow();
    // No leak: the listeners map is empty for this event.
    expect((bus.listeners.get(DIRECTOR_PROMPTED_EVENT) || []).length).toBe(0);
  });
});

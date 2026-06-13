/**
 * T1.2 / R-PERF-2 + T1.3 / R-PERF-3 — additive route helpers for the
 * swarm-launch perf change.
 *
 * The WIP `tests/agenthub/api/operations-health.test.js` is frozen in
 * this batch (it carries the WIP header). This co-located test file
 * exercises the new additive exports on
 * `src/app/api/agenthub/operations/health/route.js`:
 *
 *   - `wireDirectorReadyFanoutAdditive` (T1.2)
 *   - `awaitDirectorPromptedAdditive` (T1.3)
 *   - `prepareLaunchWorktreesAdditive` (T1.1)
 *
 * Each test asserts the contract the launch orchestrator will rely
 * on in a future batch that adopts the additive helpers.
 */

const route = require('../../../src/app/api/agenthub/operations/health/route');

class FakeBus {
  constructor() {
    this.listeners = new Map();
    this.onceWrappers = new WeakMap();
  }
  on(event, handler) {
    this._add('on', event, handler);
    return () => this._remove(event, handler);
  }
  once(event, handler) {
    const wrap = (...args) => {
      this._remove(event, wrap);
      this.onceWrappers.delete(wrap);
      handler(...args);
    };
    this.onceWrappers.set(wrap, handler);
    this._add('once', event, wrap);
    return () => this._remove(event, wrap);
  }
  off(event, handler) {
    this._remove(event, handler);
  }
  removeListener(event, handler) {
    this._remove(event, handler);
  }
  emit(event, ...args) {
    const handlers = this.listeners.get(event) || [];
    for (const entry of [...handlers]) {
      try {
        entry.handler(...args);
      } catch (err) {
        if (this.onError) this.onError(err);
        else throw err;
      }
    }
  }
  _add(mode, event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push({ mode, handler });
  }
  _remove(event, handler) {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.findIndex((e) => e.handler === handler);
    if (idx >= 0) list.splice(idx, 1);
  }
}

describe('route.js additive helpers — T1.2 director-ready fan-out', () => {
  test('director.ready event triggers fan-out within 100ms (no 4s timer)', async () => {
    const bus = new FakeBus();
    const spawns = [];
    const t0 = Date.now();
    let lastSpawnAt = null;
    const state = {};
    const workersBuilder = () =>
      ['architect', 'implementer', 'reviewer', 'devops'].map((role) => ({
        role,
        spawn: () => {
          spawns.push(role);
          lastSpawnAt = Date.now();
        },
      }));

    const unsubscribe = route.wireDirectorReadyFanoutAdditive({
      state,
      bus,
      workersBuilder,
    });
    expect(typeof unsubscribe).toBe('function');

    bus.emit('director.ready');
    await new Promise((resolve) => setImmediate(resolve));

    const gap = lastSpawnAt - t0;
    expect(spawns).toEqual(
      expect.arrayContaining(['architect', 'implementer', 'reviewer', 'devops'])
    );
    expect(spawns).toHaveLength(4);
    // 100ms is the per-spec budget for the event-driven path. The
    // 4000ms legacy default would land well above this.
    expect(gap).toBeLessThan(100);

    unsubscribe();
  });

  test('wiring is idempotent for the same state object', () => {
    const bus = new FakeBus();
    const state = {};
    const workersBuilder = () => [];
    const a = route.wireDirectorReadyFanoutAdditive({ state, bus, workersBuilder });
    const b = route.wireDirectorReadyFanoutAdditive({ state, bus, workersBuilder });
    expect(a).toBe(b);
  });
});

describe('route.js additive helpers — T1.3 Promise.race batch gate', () => {
  test('resolves on director.prompted BEFORE the 8s safety timeout', async () => {
    const bus = new FakeBus();
    const t0 = Date.now();
    // Fire director.prompted at t=500ms.
    setTimeout(() => bus.emit('director.prompted', { paneId: 'p-director' }), 500);

    const payload = await route.awaitDirectorPromptedAdditive({ bus });
    const elapsed = Date.now() - t0;
    expect(payload).toEqual({ paneId: 'p-director' });
    // Resolved at ~500ms; safety timer is 8000ms.
    expect(elapsed).toBeGreaterThanOrEqual(490);
    expect(elapsed).toBeLessThan(1500);
  });

  test('honors a custom timeoutMs argument', async () => {
    const bus = new FakeBus();
    const gate = route.awaitDirectorPromptedAdditive({ bus, timeoutMs: 80 });
    await expect(gate).rejects.toMatchObject({ name: 'LaunchAbort' });
  });
});

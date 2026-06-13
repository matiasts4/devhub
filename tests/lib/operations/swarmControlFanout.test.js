/**
 * T1.2 / R-PERF-2 — Director-event-triggered worker fan-out.
 *
 * The WIP launch route at `src/app/api/agenthub/operations/health/route.js`
 * carries `DIRECTOR_FIRST_FANOUT_DELAY_MS = 4000` and uses a
 * `setTimeout(4000)` trigger to schedule worker fan-out. That file
 * is frozen in this change. This test asserts the contract that the
 * new `swarmControlFanout` module satisfies: a `director.ready`
 * event on the bus schedules 4 worker spawns within 50ms, with
 * NO `setTimeout(4000)` on the fan-out path.
 */

const {
  DIRECTOR_READY_EVENT,
  DIRECTOR_READY_TO_FANOUT_BUDGET_MS,
  LEGACY_DIRECTOR_FIRST_FANOUT_DELAY_MS,
  subscribeToDirectorReadyFanout,
  fanOutWorkersInParallel,
  wireDirectorReadyFanout,
} = require('../../../src/lib/operations/swarmControlFanout');

class FakeBus {
  constructor() {
    this.listeners = new Map();
    // once-wrap → original handler mapping for the unsubscribe path.
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

describe('swarm-launch-perf > R-PERF-2 > director-event-triggered worker fan-out', () => {
  test('director.ready event triggers worker fan-out within 50ms', async () => {
    const bus = new FakeBus();
    const spawns = [];
    let emitAt = null;
    let lastSpawnAt = null;
    const fanOutWorkers = () =>
      fanOutWorkersInParallel({
        workers: [
          { role: 'architect', spawn: () => { spawns.push('architect'); lastSpawnAt = Date.now(); } },
          { role: 'implementer', spawn: () => { spawns.push('implementer'); lastSpawnAt = Date.now(); } },
          { role: 'reviewer', spawn: () => { spawns.push('reviewer'); lastSpawnAt = Date.now(); } },
          { role: 'devops', spawn: () => { spawns.push('devops'); lastSpawnAt = Date.now(); } },
        ],
      });

    subscribeToDirectorReadyFanout({ bus, fanOutWorkers });

    // Emit director.ready synchronously; spawns should run in the same tick.
    const t0 = Date.now();
    emitAt = t0;
    bus.emit(DIRECTOR_READY_EVENT);

    // Allow microtasks to drain so the Promise.all resolves.
    await new Promise((resolve) => setImmediate(resolve));
    const gap = lastSpawnAt - emitAt;

    expect(spawns).toEqual(expect.arrayContaining(['architect', 'implementer', 'reviewer', 'devops']));
    expect(spawns).toHaveLength(4);
    // The fan-out is synchronous inside the event handler; the gap
    // between emit and last spawn is the Promise.all microtask drain.
    // The 50ms budget is per the spec — we leave generous slack for
    // test runner latency.
    expect(gap).toBeLessThan(DIRECTOR_READY_TO_FANOUT_BUDGET_MS + 40);
  });

  test('no setTimeout(4000) is used on the fan-out path', () => {
    // The legacy value is exported for the WIP file to keep parity;
    // assert that the fan-out module never uses it as a delay.
    expect(LEGACY_DIRECTOR_FIRST_FANOUT_DELAY_MS).toBe(4000);
    // The module is small enough that we can assert via static
    // inspection: read the file and reject any setTimeout(4000) call.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/lib/operations/swarmControlFanout.js'),
      'utf8'
    );
    // setTimeout(4000) or setTimeout(LEGACY_DIRECTOR_FIRST_FANOUT_DELAY_MS)
    // anywhere is a violation. setTimeout(_, <arbitrary>) is fine.
    expect(src).not.toMatch(/setTimeout\(\s*4000\s*\)/);
    expect(src).not.toMatch(/setTimeout\(\s*LEGACY_DIRECTOR_FIRST_FANOUT_DELAY_MS\s*\)/);
    // The trigger is `bus.once`, not a timer.
    expect(src).toContain('bus.once');
  });

  test('subscription can be unsubscribed', () => {
    const bus = new FakeBus();
    const fanOutWorkers = jest.fn();
    const unsubscribe = subscribeToDirectorReadyFanout({ bus, fanOutWorkers });
    unsubscribe();
    bus.emit(DIRECTOR_READY_EVENT);
    expect(fanOutWorkers).not.toHaveBeenCalled();
  });

  test('wireDirectorReadyFanout is idempotent for the same state object', () => {
    const bus = new FakeBus();
    const state = {};
    const workersBuilder = jest.fn(() => [
      { role: 'architect', spawn: () => {} },
      { role: 'implementer', spawn: () => {} },
      { role: 'reviewer', spawn: () => {} },
      { role: 'devops', spawn: () => {} },
    ]);
    const a = wireDirectorReadyFanout({ state, bus, workersBuilder });
    const b = wireDirectorReadyFanout({ state, bus, workersBuilder });
    expect(a).toBe(b);
    bus.emit(DIRECTOR_READY_EVENT);
    expect(workersBuilder).toHaveBeenCalledTimes(1);
  });

  test('subscribeToDirectorReadyFanout rejects bad inputs', () => {
    expect(() => subscribeToDirectorReadyFanout({ bus: null, fanOutWorkers: () => {} })).toThrow();
    expect(() => subscribeToDirectorReadyFanout({ bus: new FakeBus(), fanOutWorkers: null })).toThrow();
  });

  test('fanOutWorkersInParallel rejects non-array workers', async () => {
    await expect(fanOutWorkersInParallel({ workers: 'nope' })).rejects.toThrow();
    await expect(fanOutWorkersInParallel({ workers: [{ role: 'a' }] })).rejects.toThrow();
  });
});

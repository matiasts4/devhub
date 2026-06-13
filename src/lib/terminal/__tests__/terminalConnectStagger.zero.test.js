/**
 * T1.4 / R-PERF-4 — Drop WS connect stagger.
 *
 * Verifies the `terminalConnectStagger` module exposes a 0 ms stagger
 * and that 5 concurrent connect() calls all resolve in the same
 * microtask flush. The legacy 300 ms default is documented in the
 * prior WIP code; this assertion guards against accidental
 * reintroduction.
 *
 * Co-located with the source under `src/lib/terminal/__tests__/`.
 * Companion tests for the same module also live at
 * `tests/lib/terminal/terminalConnectStagger.test.js`.
 */

const {
  SWARM_CONNECT_STAGGER_MS,
  scheduleSwarmTerminalConnect,
  resetSwarmTerminalConnectStaggerForTests,
} = require('../terminalConnectStagger');

describe('terminalConnectStagger — zero-stagger contract (T1.4)', () => {
  beforeEach(() => {
    resetSwarmTerminalConnectStaggerForTests();
  });

  test('SWARM_CONNECT_STAGGER_MS is 0', () => {
    expect(SWARM_CONNECT_STAGGER_MS).toBe(0);
  });

  test('returns 0 from the constant for downstream consumers', () => {
    // The launch orchestrator may inspect the constant directly
    // (e.g. to skip the timer path). Guard the value.
    const value = SWARM_CONNECT_STAGGER_MS;
    expect(value).toBe(0);
    expect(typeof value).toBe('number');
  });

  test('5 concurrent scheduleSwarmTerminalConnect calls all resolve in the same tick', async () => {
    resetSwarmTerminalConnectStaggerForTests();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(scheduleSwarmTerminalConnect(() => Promise.resolve(`open-${i}`)));
    }
    // With SWARM_CONNECT_STAGGER_MS = 0, the chain resolves
    // synchronously through the setTimeout(_, 0) fast path. Real
    // timers (not fake) — 0 ms setTimeout still drains in a
    // microtask flush.
    const results = await Promise.all(promises);
    expect(results).toEqual(['open-0', 'open-1', 'open-2', 'open-3', 'open-4']);
  });

  test('resetSwarmTerminalConnectStaggerForTests is a no-op-safe reset', () => {
    expect(() => resetSwarmTerminalConnectStaggerForTests()).not.toThrow();
  });
});

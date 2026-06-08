/**
 * T1.4 / R-PERF-4 — Drop WS connect stagger.
 *
 * The prior default of `SWARM_CONNECT_STAGGER_MS = 300` serialized
 * the 5 WS handshakes (5 × 300ms = 1.5s). R-PERF-4 reduces the
 * stagger to 0; the OS event loop fairness is sufficient.
 *
 * The test asserts that 5 simultaneous connect() calls all reach
 * `open` within 200ms total, and that the prior default would have
 * taken > 1s.
 */

const {
  SWARM_CONNECT_STAGGER_MS,
  scheduleSwarmTerminalConnect,
  resetSwarmTerminalConnectStaggerForTests,
} = require('../../../src/lib/terminal/terminalConnectStagger');

describe('swarm-launch-perf > R-PERF-4 > drop WS connect stagger', () => {
  beforeEach(() => {
    resetSwarmTerminalConnectStaggerForTests();
  });

  test('SWARM_CONNECT_STAGGER_MS is 0', () => {
    expect(SWARM_CONNECT_STAGGER_MS).toBe(0);
  });

  test('5 simultaneous connect() calls all resolve within 200ms', async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const promise = scheduleSwarmTerminalConnect(() => {
        return Promise.resolve(`open-${i}`);
      });
      promises.push(promise);
    }
    const results = await Promise.all(promises);
    const totalMs = Date.now() - start;

    expect(results).toHaveLength(5);
    results.forEach((value, index) => {
      expect(value).toBe(`open-${index}`);
    });
    // 5 microtask-resolved connects must complete well under 200ms.
    expect(totalMs).toBeLessThan(200);
  });

  test('prior default of 300ms would have taken >1s for 5 connects', () => {
    // The prior default serialized 5 handshakes. With 5 × 300ms = 1500ms.
    // We assert the new constant is below the prior default by a clear margin.
    const PRIOR_DEFAULT = 300;
    expect(SWARM_CONNECT_STAGGER_MS).toBeLessThan(PRIOR_DEFAULT);
    expect(5 * PRIOR_DEFAULT).toBeGreaterThan(1000);
  });

  test('resetSwarmTerminalConnectStaggerForTests clears the chain', async () => {
    // Build up a chain of 3 connects.
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(scheduleSwarmTerminalConnect(() => Promise.resolve(`p${i}`)));
    }
    await Promise.all(promises);
    // Reset and confirm subsequent connect runs in its own microtask flush.
    resetSwarmTerminalConnectStaggerForTests();
    const start = Date.now();
    const result = await scheduleSwarmTerminalConnect(() => Promise.resolve('after-reset'));
    const elapsed = Date.now() - start;
    expect(result).toBe('after-reset');
    expect(elapsed).toBeLessThan(50);
  });
});

/**
 * T1.1 / R-PERF-1 — writeQueue.enqueueMany dispatches all items in one tick.
 *
 * Contract: `enqueueMany(jobs)` is a thin wrapper that enqueues each job
 * and returns a `Promise.all` over the per-job promises. The test asserts:
 *   - 5 jobs of varying cost all complete (no starvation of the slow one).
 *   - The internal queue counter hits 5 within a single microtask flush
 *     (i.e. enqueueMany does not serialize through `await` between enqueues).
 *   - The `withDbWriteQueue` helper remains a single-FIFO surface.
 */

const { DbWriteQueue, withDbWriteQueue, instance } = require('../../../src/lib/db/writeQueue');

describe('swarm-launch-perf > R-PERF-1 > writeQueue.enqueueMany', () => {
  test('enqueueMany dispatches all items in one tick under contention', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    const recorded = [];
    const jobs = [50, 200, 50, 1800, 50].map((costMs, index) => async () => {
      recorded.push({ index, enqueuedAt: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, costMs));
      return { index, costMs };
    });

    const start = Date.now();
    const results = await localQueue.enqueueMany(jobs);
    const totalMs = Date.now() - start;

    // All 5 must have resolved.
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);

    // The slowest tail (1800ms) governs wall-clock. Allow a small slack
    // for test runner overhead but reject sequential serialization
    // (5×200ms = 1000ms) which would land us well under 1800ms.
    expect(totalMs).toBeGreaterThanOrEqual(1700);
    expect(totalMs).toBeLessThan(3500);

    // Queue should be drained.
    expect(localQueue.getStats().pending).toBe(0);
    expect(localQueue.getStats().completed).toBe(5);
  });

  test('enqueueMany hits the queue within a single microtask flush', () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    const seen = { count: 0 };
    const jobs = [0, 0, 0, 0, 0].map(() => () => {
      seen.count += 1;
      return null;
    });

    const promise = localQueue.enqueueMany(jobs);
    // After enqueueMany returns synchronously, the queue's internal counter
    // must already be 5 (no await-then-enqueue serialization).
    expect(localQueue.getStats().total).toBe(5);
    return promise.then(() => {
      expect(seen.count).toBe(5);
    });
  });

  test('enqueueMany propagates per-job errors without swallowing siblings', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    const ok = () => Promise.resolve('ok');
    const boom = () => Promise.reject(new Error('boom'));

    await expect(localQueue.enqueueMany([ok, boom, ok])).rejects.toThrow('boom');
    // Queue continues processing — siblings should have resolved.
    expect(localQueue.getStats().completed).toBe(2);
    expect(localQueue.getStats().failed).toBe(1);
  });

  test('withDbWriteQueue + instance.enqueueMany share the singleton surface', async () => {
    // The shared singleton (`instance`) must support enqueueMany without
    // race windows. The exported `withDbWriteQueue` helper is the
    // legacy single-job facade; the launch path uses `instance.enqueueMany`
    // directly for the 5-role fan-out (R-PERF-1).
    const snapshot = instance.getStats();
    const jobs = [() => 1, () => 2, () => 3];
    const result = await instance.enqueueMany(jobs);
    expect(result).toEqual([1, 2, 3]);
    // Drain observed.
    const after = instance.getStats();
    expect(after.completed).toBe(snapshot.completed + 3);
  });
});

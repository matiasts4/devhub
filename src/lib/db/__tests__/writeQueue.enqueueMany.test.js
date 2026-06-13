/**
 * T1.1 / R-PERF-1 — writeQueue.enqueueMany contract.
 *
 * Companion to the comprehensive tests at
 * `tests/lib/db/writeQueue.enqueueMany.test.js`. This co-located
 * test asserts the FIFO order and the synchronous-fan-out contract
 * that the launch orchestrator relies on.
 *
 * Co-located with the source under `src/lib/db/__tests__/`.
 */

const { DbWriteQueue } = require('../writeQueue');

describe('writeQueue — enqueueMany FIFO contract (T1.1)', () => {
  test('preserves FIFO order across N jobs', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    const order = [];
    const jobs = [0, 1, 2, 3, 4].map((idx) => () => {
      order.push(idx);
      return idx * 10;
    });

    const results = await localQueue.enqueueMany(jobs);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(results).toEqual([0, 10, 20, 30, 40]);
  });

  test('returns Promise.all semantics (input-order outcomes)', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    const jobs = [
      async () => 'a',
      async () => 'b',
      async () => 'c',
    ];

    const results = await localQueue.enqueueMany(jobs);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  test('validates input shape (rejects non-array)', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    await expect(localQueue.enqueueMany(null)).rejects.toThrow(TypeError);
    await expect(localQueue.enqueueMany('not-an-array')).rejects.toThrow(TypeError);
  });

  test('validates that each entry is a function', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    await expect(
      localQueue.enqueueMany([() => 'ok', 'not-a-fn', () => 'ok'])
    ).rejects.toThrow(TypeError);
  });

  test('returns outcomes in input order even when jobs are slow', async () => {
    const localQueue = new DbWriteQueue({ timeout: 5_000 });
    const jobs = [
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'slow-0';
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return 'fast-1';
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return 'mid-2';
      },
    ];

    const results = await localQueue.enqueueMany(jobs);
    expect(results).toEqual(['slow-0', 'fast-1', 'mid-2']);
  });
});

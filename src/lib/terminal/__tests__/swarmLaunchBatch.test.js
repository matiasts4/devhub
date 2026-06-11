import {
  SWARM_LAUNCH_BATCH_DEADLINE_MS,
  rescheduleSwarmLaunchBatchFlush,
} from '../swarmLaunchBatch';

describe('swarmLaunchBatch', () => {
  test('reschedules flush deadline on every enqueue (sliding window)', () => {
    const clearTimeoutFn = jest.fn();
    const setTimeoutFn = jest.fn(() => 101);
    const onFlush = jest.fn();

    const first = rescheduleSwarmLaunchBatchFlush({
      existingTimerId: null,
      onFlush,
      clearTimeoutFn,
      setTimeoutFn,
    });
    expect(first).toBe(101);
    expect(setTimeoutFn).toHaveBeenCalledWith(onFlush, SWARM_LAUNCH_BATCH_DEADLINE_MS);

    setTimeoutFn.mockReturnValue(202);
    const second = rescheduleSwarmLaunchBatchFlush({
      existingTimerId: first,
      onFlush,
      clearTimeoutFn,
      setTimeoutFn,
    });
    expect(second).toBe(202);
    expect(clearTimeoutFn).toHaveBeenCalledWith(101);
    expect(setTimeoutFn).toHaveBeenLastCalledWith(onFlush, SWARM_LAUNCH_BATCH_DEADLINE_MS);
  });
});

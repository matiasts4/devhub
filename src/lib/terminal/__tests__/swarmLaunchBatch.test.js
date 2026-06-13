import {
  SWARM_LAUNCH_BATCH_DEADLINE_MS,
  SWARM_LAUNCH_MATERIALIZED_EVENT,
  dispatchSwarmLaunchMaterialized,
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

  test('dispatchSwarmLaunchMaterialized emits one materialized event', () => {
    const listeners = new Map();
    class MockCustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    }

    const mockWindow = {
      CustomEvent: MockCustomEvent,
      addEventListener: (type, handler) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      removeEventListener: (type, handler) => {
        const list = listeners.get(type) || [];
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
      },
      dispatchEvent: (event) => {
        for (const handler of listeners.get(event.type) || []) {
          handler(event);
        }
        return true;
      },
    };

    const originalWindow = global.window;
    const originalCustomEvent = global.CustomEvent;
    global.window = mockWindow;
    global.CustomEvent = MockCustomEvent;
    try {
      const handler = jest.fn();
      mockWindow.addEventListener(SWARM_LAUNCH_MATERIALIZED_EVENT, handler);
      dispatchSwarmLaunchMaterialized([{ taskId: 'launch-1:zed', launchId: 'launch-1' }]);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].detail.runtimeRequests).toHaveLength(1);
    } finally {
      global.window = originalWindow;
      global.CustomEvent = originalCustomEvent;
    }
  });
});

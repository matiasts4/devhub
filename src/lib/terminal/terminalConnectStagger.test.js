import {
  resetSwarmTerminalConnectStaggerForTests,
  scheduleSwarmTerminalConnect,
} from './terminalConnectStagger.js';

describe('scheduleSwarmTerminalConnect', () => {
  beforeEach(() => {
    resetSwarmTerminalConnectStaggerForTests();
  });

  // T1.4 / R-PERF-4: the connect stagger was reduced from 300ms to 0
  // to let the 5 WS handshakes race through the OS event loop.
  // This test asserts the new contract: tasks still run sequentially
  // (chain contract preserved) but the inter-task delay is now 0.
  test('runs tasks sequentially with zero stagger delay (R-PERF-4)', async () => {
    const order = [];
    const now = Date.now();

    const first = scheduleSwarmTerminalConnect(async () => {
      order.push('first-start');
      order.push('first-end');
    });
    const second = scheduleSwarmTerminalConnect(async () => {
      order.push('second-start');
      order.push('second-end');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
    // With stagger=0, two microtask-batched tasks complete well under 250ms.
    expect(Date.now() - now).toBeLessThan(250);
  });
});

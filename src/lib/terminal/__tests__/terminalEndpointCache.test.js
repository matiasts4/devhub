/**
 * @jest-environment jsdom
 */

const {
  rememberTerminalEndpoint,
  peekTerminalEndpoint,
  clearTerminalEndpointCache,
  coalesceTerminalEndpointFetch,
} = require('../terminalEndpointCache');

describe('terminalEndpointCache', () => {
  beforeEach(() => {
    clearTerminalEndpointCache();
  });

  test('remember + peek within TTL', () => {
    rememberTerminalEndpoint({ port: 4001, wsPath: '/tty', cwd: 'D:/devhub' }, { now: 1000 });
    expect(peekTerminalEndpoint({ now: 1500 })).toEqual({ port: 4001, wsPath: '/tty' });
  });

  test('peek expires after TTL', () => {
    rememberTerminalEndpoint({ port: 4001, wsPath: '/tty' }, { now: 0 });
    expect(peekTerminalEndpoint({ ttlMs: 10, now: 20 })).toBeNull();
  });

  test('coalesce shares one inflight fetch', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return { port: 4077, wsPath: '/terminal' };
    };
    const [a, b] = await Promise.all([
      coalesceTerminalEndpointFetch(fetcher),
      coalesceTerminalEndpointFetch(fetcher),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual({ port: 4077, wsPath: '/terminal' });
    expect(b).toEqual(a);
    expect(peekTerminalEndpoint()).toEqual(a);
  });

  test('coalesce returns cache without fetching', async () => {
    rememberTerminalEndpoint({ port: 1, wsPath: '/tty' });
    const fetcher = jest.fn();
    await expect(coalesceTerminalEndpointFetch(fetcher)).resolves.toEqual({
      port: 1,
      wsPath: '/tty',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

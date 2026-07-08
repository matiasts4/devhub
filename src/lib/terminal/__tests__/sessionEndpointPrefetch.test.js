'use strict';

describe('sessionEndpointPrefetch', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
  });

  test('getLastKnownTerminalEndpoint is null until confirmed', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ port: 4077, wsPath: '/terminal' }),
    });

    const {
      prefetchTerminalSessionEndpoint,
      getLastKnownTerminalEndpoint,
      markTerminalEndpointConfirmed,
      __resetSessionEndpointPrefetchForTests,
    } = require('../sessionEndpointPrefetch');
    __resetSessionEndpointPrefetchForTests();

    await prefetchTerminalSessionEndpoint('/tmp/proj');
    // API hit alone is NOT enough — only WS-confirmed ports are "last known".
    expect(getLastKnownTerminalEndpoint()).toBeNull();

    markTerminalEndpointConfirmed(4077, '/terminal');
    expect(getLastKnownTerminalEndpoint()).toEqual({ port: 4077, wsPath: '/terminal' });
  });

  test('invalidate clears confirmed cache so next resolve refetches', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ port: 4077, wsPath: '/terminal' }),
    });

    const {
      resolveTerminalSessionEndpoint,
      markTerminalEndpointConfirmed,
      invalidateTerminalEndpointCache,
      __resetSessionEndpointPrefetchForTests,
    } = require('../sessionEndpointPrefetch');
    __resetSessionEndpointPrefetchForTests();

    await resolveTerminalSessionEndpoint('/tmp/a');
    markTerminalEndpointConfirmed(4077, '/terminal');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Confirmed port reused without network.
    await resolveTerminalSessionEndpoint('/tmp/b');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    invalidateTerminalEndpointCache('ws-timeout');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ port: 4088, wsPath: '/terminal' }),
    });
    const fresh = await resolveTerminalSessionEndpoint('/tmp/b', { force: true });
    expect(fresh.port).toBe(4088);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

const {
  prefetchTerminalState,
  takePrefetchedTerminalState,
  peekPrefetchedTerminalState,
  clearTerminalStatePrefetch,
} = require('../terminalStatePrefetch');

function memoryStorage(map = new Map()) {
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

describe('terminalStatePrefetch', () => {
  beforeEach(() => {
    clearTerminalStatePrefetch();
  });

  test('prefetch loads and take consumes once', () => {
    const store = memoryStorage(
      new Map([
        [
          'devhub_terminal_state:proj-1',
          JSON.stringify({ workspaces: [{ id: 'w1' }], activeWsId: 'w1' }),
        ],
        ['devhub_restore_manifest:proj-1', JSON.stringify({ version: 1 })],
      ])
    );

    const snap = prefetchTerminalState('proj-1', store, { now: 1000 });
    expect(snap.terminalState.workspaces).toHaveLength(1);
    expect(peekPrefetchedTerminalState('proj-1')).toBeTruthy();

    const taken = takePrefetchedTerminalState('proj-1', { now: 1000 });
    expect(taken.restoreManifest.version).toBe(1);
    expect(takePrefetchedTerminalState('proj-1')).toBeNull();
  });

  test('expired snapshot is discarded', () => {
    const store = memoryStorage(
      new Map([['devhub_terminal_state:proj-1', JSON.stringify({ workspaces: [] })]])
    );
    prefetchTerminalState('proj-1', store, { now: 0, ttlMs: 10 });
    expect(takePrefetchedTerminalState('proj-1', { now: 100 })).toBeNull();
  });

  test('prefetch does not write storage', () => {
    const writes = [];
    const store = {
      getItem: () => JSON.stringify({ workspaces: [{ id: 'a' }] }),
      setItem: (k, v) => writes.push([k, v]),
    };
    prefetchTerminalState('proj-x', store);
    expect(writes).toHaveLength(0);
  });
});

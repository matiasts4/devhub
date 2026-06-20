const {
  resolveActiveWorkspaceWindowId,
  resolveWorkspaceWindowsForRender,
} = require('@/lib/terminal/workspaceWindowRender.js');

describe('resolveWorkspaceWindowsForRender', () => {
  test('returns persisted window snapshots when present', () => {
    const ws = { id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] };
    const workspaceWindows = {
      ws1: [
        { id: 'v1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'v2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
    };

    expect(resolveWorkspaceWindowsForRender(ws, workspaceWindows)).toEqual(workspaceWindows.ws1);
  });

  test('falls back to a single default window from live columns', () => {
    const ws = { id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] };

    expect(resolveWorkspaceWindowsForRender(ws, {})).toEqual([
      { id: 'ws1-default', columns: ws.columns },
    ]);
  });
});

describe('resolveActiveWorkspaceWindowId', () => {
  test('prefers activeWindowIds entry', () => {
    const workspaceWindows = {
      ws1: [{ id: 'v1' }, { id: 'v2' }],
    };

    expect(resolveActiveWorkspaceWindowId('ws1', workspaceWindows, { ws1: 'v2' })).toBe('v2');
  });

  test('falls back to first window id', () => {
    const workspaceWindows = {
      ws1: [{ id: 'v1' }, { id: 'v2' }],
    };

    expect(resolveActiveWorkspaceWindowId('ws1', workspaceWindows, {})).toBe('v1');
  });
});

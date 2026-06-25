const {
  resolveActiveWorkspaceWindowId,
  resolvePanelVisibleInLayout,
  resolveWorkspaceWindowsForRender,
} = require('../workspaceWindowRender.js');

describe('resolvePanelVisibleInLayout', () => {
  test('shows every panel when no focus panel is set', () => {
    expect(
      resolvePanelVisibleInLayout({
        isWorkspaceVisibleInLayout: true,
        focusedPanelId: null,
        panelId: 'p1',
      })
    ).toBe(true);
  });

  test('shows only the focused panel when it is present in the active window', () => {
    expect(
      resolvePanelVisibleInLayout({
        isWorkspaceVisibleInLayout: true,
        focusedPanelId: 'p1',
        panelId: 'p1',
        activeWindowPanelIds: ['p1', 'p2'],
      })
    ).toBe(true);

    expect(
      resolvePanelVisibleInLayout({
        isWorkspaceVisibleInLayout: true,
        focusedPanelId: 'p1',
        panelId: 'p2',
        activeWindowPanelIds: ['p1', 'p2'],
      })
    ).toBe(false);
  });

  test('ignores stale focus panel when it is missing from the active window (TWS-S1)', () => {
    expect(
      resolvePanelVisibleInLayout({
        isWorkspaceVisibleInLayout: true,
        focusedPanelId: 'p-stale',
        panelId: 'p2',
        activeWindowPanelIds: ['p2', 'p3'],
      })
    ).toBe(true);

    expect(
      resolvePanelVisibleInLayout({
        isWorkspaceVisibleInLayout: true,
        focusedPanelId: 'p-stale',
        panelId: 'p3',
        activeWindowPanelIds: ['p2', 'p3'],
      })
    ).toBe(true);
  });

  test('hides all panels when the workspace itself is not visible', () => {
    expect(
      resolvePanelVisibleInLayout({
        isWorkspaceVisibleInLayout: false,
        focusedPanelId: null,
        panelId: 'p1',
      })
    ).toBe(false);
  });
});

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

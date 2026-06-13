const {
  findPanelCoordinates,
  getAdjacentPanelId,
  getAdjacentWorkspaceId,
  resolveHorizontalNavigation,
  resolveVerticalNavigation,
  resolvePanelNavigationDirection,
  resolveTerminalNavigationAction,
  resolveTerminalShortcutAction,
  resolveTerminalWorkspaceAction,
  shouldHandleTerminalFocusExitShortcut,
  shouldHandleTerminalNavigationShortcut,
  shouldHandleTerminalWorkspaceShortcut,
} = require('../workspaceShortcuts');

describe('workspaceShortcuts navigation', () => {
  const splitWorkspace = {
    id: 'ws1',
    columns: [
      { id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] },
      { id: 'c2', panels: [{ id: 'p3' }] },
    ],
  };

  test('resolveTerminalNavigationAction maps linux-safe bindings', () => {
    expect(resolveTerminalNavigationAction({ ctrlKey: true, key: 'PageUp' })).toBe(
      'previousWorkspace'
    );
    expect(resolveTerminalNavigationAction({ ctrlKey: true, key: 'PageDown' })).toBe(
      'nextWorkspace'
    );
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, shiftKey: true, key: 'ArrowLeft' })
    ).toBe('panelLeft');
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, shiftKey: true, key: 'ArrowRight' })
    ).toBe('panelRight');
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, shiftKey: true, key: 'ArrowUp' })
    ).toBe('panelUp');
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, shiftKey: true, key: 'ArrowDown' })
    ).toBe('panelDown');
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, altKey: true, key: 'ArrowLeft' })
    ).toBeNull();
    expect(resolveTerminalNavigationAction({ ctrlKey: true, key: 'ArrowLeft' })).toBeNull();
    expect(resolveTerminalNavigationAction({ ctrlKey: true, key: 'ArrowUp' })).toBe(
      'previousWorkspace'
    );
    expect(resolveTerminalNavigationAction({ ctrlKey: true, key: 'ArrowDown' })).toBe(
      'nextWorkspace'
    );
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, shiftKey: true, key: 'PageDown' })
    ).toBe('nextWorkspace');
    expect(
      resolveTerminalNavigationAction({ ctrlKey: true, shiftKey: true, key: 'PageUp' })
    ).toBe('previousWorkspace');
  });

  test('resolveTerminalShortcutAction maps ctrl+shift+f to focus toggle', () => {
    expect(
      resolveTerminalShortcutAction({ ctrlKey: true, shiftKey: true, key: 'f' })
    ).toBe('togglePanelFocus');
  });

  test('resolveTerminalWorkspaceAction maps dock and workspace shortcuts', () => {
    expect(
      resolveTerminalWorkspaceAction({ ctrlKey: true, shiftKey: true, key: 'B' })
    ).toBe('openBrowserDock');
    expect(
      resolveTerminalWorkspaceAction({ ctrlKey: true, shiftKey: true, key: 'e' })
    ).toBe('openEditorDock');
    expect(
      resolveTerminalWorkspaceAction({ ctrlKey: true, shiftKey: true, key: 'N' })
    ).toBe('newWorkspace');
    expect(
      resolveTerminalWorkspaceAction({ ctrlKey: true, shiftKey: true, key: 'W' })
    ).toBe('closePanel');
    expect(
      resolveTerminalWorkspaceAction({
        ctrlKey: true,
        shiftKey: true,
        key: '.',
        code: 'Period',
      })
    ).toBe('closeRightDock');
  });

  test('resolvePanelNavigationDirection maps panel actions', () => {
    expect(resolvePanelNavigationDirection('panelLeft')).toBe('left');
    expect(resolvePanelNavigationDirection('panelRight')).toBe('right');
    expect(resolvePanelNavigationDirection('previousWorkspace')).toBeNull();
  });

  test('findPanelCoordinates and getAdjacentPanelId follow split geometry', () => {
    expect(findPanelCoordinates(splitWorkspace.columns, 'p2')).toEqual({
      colIndex: 0,
      panelIndex: 1,
      columnId: 'c1',
    });

    expect(getAdjacentPanelId(splitWorkspace.columns, 'p1', 'down')).toBe('p2');
    expect(getAdjacentPanelId(splitWorkspace.columns, 'p2', 'up')).toBe('p1');
    expect(getAdjacentPanelId(splitWorkspace.columns, 'p1', 'right')).toBe('p3');
    expect(getAdjacentPanelId(splitWorkspace.columns, 'p3', 'left')).toBe('p1');
    expect(getAdjacentPanelId(splitWorkspace.columns, 'p1', 'left')).toBeNull();
  });

  test('resolveHorizontalNavigation prefers adjacent panel before workspace', () => {
    const workspaces = [
      { id: 'ws0', columns: [{ id: 'c0', panels: [{ id: 'p0' }] }] },
      splitWorkspace,
      { id: 'ws2', columns: [{ id: 'c3', panels: [{ id: 'p4' }] }] },
    ];

    expect(resolveHorizontalNavigation(workspaces, splitWorkspace, 'p1', 'next')).toEqual({
      type: 'panel',
      panelId: 'p3',
    });

    expect(resolveHorizontalNavigation(workspaces, splitWorkspace, 'p3', 'next')).toEqual({
      type: 'workspace',
      workspaceId: 'ws2',
    });

    expect(getAdjacentWorkspaceId(workspaces, 'ws1', 'previous')).toBe('ws0');
  });

  test('resolveVerticalNavigation prefers adjacent panel before workspace', () => {
    const verticalSplitWorkspace = {
      id: 'ws1',
      columns: [{ id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] }],
    };
    const workspaces = [
      { id: 'ws0', columns: [{ id: 'c0', panels: [{ id: 'p0' }] }] },
      verticalSplitWorkspace,
      { id: 'ws2', columns: [{ id: 'c2', panels: [{ id: 'p3' }] }] },
    ];

    expect(resolveVerticalNavigation(workspaces, verticalSplitWorkspace, 'p1', 'next')).toEqual({
      type: 'panel',
      panelId: 'p2',
    });

    expect(resolveVerticalNavigation(workspaces, verticalSplitWorkspace, 'p2', 'next')).toEqual({
      type: 'workspace',
      workspaceId: 'ws2',
    });
  });

  test('navigation shortcuts are allowed inside terminal viewport but focus exit is not', () => {
    const root = { nodeType: 1, contains: () => true };
    const terminalViewport = {
      nodeType: 1,
      closest: (selector) =>
        selector === '[data-testid="terminal-viewport-shell"]' ? terminalViewport : null,
    };
    const xtermTextarea = {
      nodeType: 1,
      tagName: 'TEXTAREA',
      isContentEditable: false,
      closest: (selector) =>
        selector === '[data-testid="terminal-viewport-shell"]' ? terminalViewport : null,
    };

    expect(
      shouldHandleTerminalNavigationShortcut(
        { ctrlKey: true, shiftKey: true, key: 'ArrowRight', target: terminalViewport },
        { isVisible: true, rootElement: root, activeElement: terminalViewport }
      )
    ).toBe(true);

    expect(
      shouldHandleTerminalNavigationShortcut(
        { ctrlKey: true, key: 'PageDown', target: xtermTextarea },
        { isVisible: true, rootElement: root, activeElement: xtermTextarea }
      )
    ).toBe(true);

    expect(
      shouldHandleTerminalFocusExitShortcut(
        { key: 'Escape', target: terminalViewport },
        {
          isVisible: true,
          rootElement: root,
          activeElement: terminalViewport,
          focusModeActive: true,
        }
      )
    ).toBe(false);
  });

});
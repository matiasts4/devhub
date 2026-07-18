const {
  resolveWorkspaceSidebarWidth,
  isTerminalesSidebarToggleShortcut,
} = require('../workspaceSidebarUtils');

describe('resolveWorkspaceSidebarWidth', () => {
  test('hides on Terminales unless peek', () => {
    expect(
      resolveWorkspaceSidebarWidth({
        isTerminalRoute: true,
        terminalesSidebarPeek: false,
        collapsed: false,
      })
    ).toBe(0);
    expect(
      resolveWorkspaceSidebarWidth({
        isTerminalRoute: true,
        terminalesSidebarPeek: true,
        collapsed: true,
      })
    ).toBe(48);
    expect(
      resolveWorkspaceSidebarWidth({
        isTerminalRoute: true,
        terminalesSidebarPeek: true,
        collapsed: false,
      })
    ).toBe(256);
  });

  test('uses collapsed widths off Terminales', () => {
    expect(
      resolveWorkspaceSidebarWidth({
        isTerminalRoute: false,
        collapsed: true,
      })
    ).toBe(48);
    expect(
      resolveWorkspaceSidebarWidth({
        isTerminalRoute: false,
        collapsed: false,
      })
    ).toBe(256);
  });

  test('forceHidden wins (maximize / pizarra)', () => {
    expect(
      resolveWorkspaceSidebarWidth({
        isTerminalRoute: true,
        terminalesSidebarPeek: true,
        collapsed: false,
        forceHidden: true,
      })
    ).toBe(0);
  });
});

describe('isTerminalesSidebarToggleShortcut', () => {
  test('matches Ctrl/Cmd+B without Alt/Shift', () => {
    expect(isTerminalesSidebarToggleShortcut({ key: 'b', ctrlKey: true, metaKey: false })).toBe(
      true
    );
    expect(isTerminalesSidebarToggleShortcut({ key: 'B', metaKey: true, ctrlKey: false })).toBe(
      true
    );
    expect(isTerminalesSidebarToggleShortcut({ key: 'b', ctrlKey: true, shiftKey: true })).toBe(
      false
    );
  });
});

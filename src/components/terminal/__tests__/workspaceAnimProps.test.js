const {
  resolveWorkspaceShellVisibilityStyle,
  resolveRightDockTakeoverChromeStyle,
} = require('../workspaceAnimProps.js');

describe('resolveWorkspaceShellVisibilityStyle', () => {
  test('instantly hides inactive or fullscreen-takeover shells', () => {
    expect(
      resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: false,
        isManagerVisible: true,
      })
    ).toMatchObject({
      opacity: 0,
      visibility: 'hidden',
      transition: 'none',
      contain: 'strict',
    });

    expect(
      resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: true,
        isManagerVisible: true,
        isFullscreenTakeover: true,
      }).visibility
    ).toBe('hidden');
  });

  test('shows the active workspace shell instantly without opacity animation', () => {
    expect(
      resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: true,
        isManagerVisible: true,
      })
    ).toMatchObject({
      opacity: 1,
      visibility: 'visible',
      pointerEvents: 'auto',
      transition: 'none',
    });
  });
});

describe('resolveRightDockTakeoverChromeStyle', () => {
  test('adds opaque isolation only during fullscreen takeover', () => {
    expect(resolveRightDockTakeoverChromeStyle(false)).toEqual({});
    expect(resolveRightDockTakeoverChromeStyle(true)).toMatchObject({
      backgroundColor: 'var(--surface-app)',
      isolation: 'isolate',
    });
  });
});

const {
  resolveWorkspaceShellVisibilityStyle,
  resolveRightDockTakeoverChromeStyle,
  getRightDockAnimProps,
} = require('../workspaceAnimProps.js');

describe('getRightDockAnimProps — fullscreen takeover', () => {
  test('uses 220ms opacity fade aligned with useModeTransition enter', () => {
    const props = getRightDockAnimProps({ isVisible: true, isFullscreen: true });
    expect(props.initial).toEqual({ opacity: 0 });
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.transition.duration).toBe(0.22);
    expect(props.transition.ease).toEqual([0.22, 1, 0.36, 1]);
  });
});

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

describe('resolveWorkspaceWindowVisibilityStyle', () => {
  const { resolveWorkspaceWindowVisibilityStyle } = require('../workspaceAnimProps.js');

  test('parks inactive windows with the same hidden contract as inactive workspace tabs', () => {
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: false,
      })
    ).toMatchObject({
      opacity: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
      contain: 'strict',
    });
  });

  test('shows the active window with opaque background', () => {
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: true,
      })
    ).toMatchObject({
      opacity: 1,
      visibility: 'visible',
      pointerEvents: 'auto',
      backgroundColor: 'var(--surface-app)',
    });
  });

  test('fullscreen takeover hides the active window too (matches workspace shell)', () => {
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: true,
        isFullscreenTakeover: true,
      }).visibility
    ).toBe('hidden');
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

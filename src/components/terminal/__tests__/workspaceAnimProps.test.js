const {
  resolveWorkspaceShellVisibilityStyle,
  resolveRightDockTakeoverChromeStyle,
  getRightDockAnimProps,
} = require('../workspaceAnimProps.js');

describe('getRightDockAnimProps — fullscreen takeover', () => {
  test('uses short opacity-only fade (≤160ms), no slide', () => {
    const props = getRightDockAnimProps({ isVisible: true, isFullscreen: true });
    expect(props.initial).toEqual({ opacity: 0 });
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.animate.x).toBeUndefined();
    expect(props.transition.duration).toBeLessThanOrEqual(0.16);
    expect(props.transition.duration).toBeGreaterThan(0);
  });

  test('reduced motion zeros dock duration', () => {
    const props = getRightDockAnimProps({
      isVisible: true,
      isFullscreen: false,
      motionMode: 'reduced',
    });
    expect(props.transition.duration).toBe(0);
  });

  test('normal dock slide is capped at 160ms', () => {
    const props = getRightDockAnimProps({ isVisible: true, isFullscreen: false });
    expect(props.transition.duration).toBeLessThanOrEqual(0.16);
  });
});

describe('getWorkspaceAnimProps — mount', () => {
  const { getWorkspaceAnimProps } = require('../workspaceAnimProps.js');

  test('skips mount fade (instant opacity)', () => {
    const props = getWorkspaceAnimProps(false);
    expect(props.initial).toBe(false);
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.transition.duration).toBe(0);
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
      pointerEvents: 'none',
      transition: 'none',
      contain: 'layout paint',
    });
    expect(
      resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: false,
        isManagerVisible: true,
      }).visibility
    ).toBeUndefined();

    expect(
      resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: true,
        isManagerVisible: true,
        isFullscreenTakeover: true,
      })
    ).toMatchObject({
      opacity: 0,
      pointerEvents: 'none',
    });
  });

  test('shows the active workspace shell instantly without opacity animation', () => {
    expect(
      resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: true,
        isManagerVisible: true,
      })
    ).toMatchObject({
      opacity: 1,
      pointerEvents: 'auto',
      transition: 'none',
      contain: 'layout paint',
    });
  });
});

describe('resolveWorkspaceWindowVisibilityStyle', () => {
  const { resolveWorkspaceWindowVisibilityStyle } = require('../workspaceAnimProps.js');

  test('parks inactive windows with opacity-only keep-alive (Option B)', () => {
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: false,
      })
    ).toMatchObject({
      opacity: 0,
      pointerEvents: 'none',
      contain: 'layout paint',
    });
  });

  test('shows the active window with opaque background', () => {
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: true,
      })
    ).toMatchObject({
      opacity: 1,
      pointerEvents: 'auto',
      backgroundColor: 'var(--surface-app)',
    });
  });

  test('fullscreen takeover hides the active window too (matches workspace shell)', () => {
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: true,
        isFullscreenTakeover: true,
      })
    ).toMatchObject({
      opacity: 0,
      pointerEvents: 'none',
    });
  });

  test('warm-mounted manager off-route keeps active window pointer-events none', () => {
    // Descendant pointer-events:auto would otherwise steal wheel scroll on
    // Kanban/roadmap while the terminal shell stays opacity:0 keep-alive.
    expect(
      resolveWorkspaceWindowVisibilityStyle({
        isActiveWindow: true,
        isManagerVisible: false,
      })
    ).toMatchObject({
      opacity: 0,
      pointerEvents: 'none',
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

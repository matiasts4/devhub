const {
  resolveWorkspaceShellVisibilityStyle,
  resolveRightDockTakeoverChromeStyle,
  getRightDockAnimProps,
} = require('../workspaceAnimProps.js');

describe('getRightDockAnimProps — dock hosting WebView2', () => {
  test('uses opacity-only fade (no horizontal slide) for normal dock', () => {
    const props = getRightDockAnimProps({ isVisible: true, isFullscreen: false });
    expect(props.initial).toEqual({ opacity: 0 });
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.initial.x).toBeUndefined();
    expect(props.animate.x).toBeUndefined();
    expect(props.transition.duration).toBe(0.22);
  });

  test('fullscreen takeover enters at full opacity (blank-pizarra hardening)', () => {
    const props = getRightDockAnimProps({ isVisible: true, isFullscreen: true });
    expect(props.initial).toEqual({ opacity: 1 });
    expect(props.animate).toEqual({ opacity: 1 });
    expect(props.transition.duration).toBe(0);
    expect(props.initial.x).toBeUndefined();
  });

  test('fullscreen exit still fades out', () => {
    const props = getRightDockAnimProps({ isVisible: false, isFullscreen: true });
    expect(props.animate).toEqual({ opacity: 0 });
    expect(props.transition.duration).toBe(0.22);
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

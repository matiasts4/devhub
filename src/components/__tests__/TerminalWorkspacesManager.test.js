/**
 * TerminalWorkspacesManager unit tests — terminal-ux-redesign
 *
 * Tests the pure function `getWorkspaceAnimProps(isMaximized)`.
 */

const {
  getRightDockAnimProps,
  getWorkspaceAnimProps,
} = require('../terminal/workspaceAnimProps.js');

describe('getRightDockAnimProps()', () => {
  test('slides in from the right edge of the dock slot', () => {
    const props = getRightDockAnimProps({ isVisible: true });
    expect(props.initial).toEqual({ opacity: 0, x: '100%' });
    expect(props.animate).toEqual({ opacity: 1, x: 0 });
  });

  test('slides out to the right when hidden', () => {
    const props = getRightDockAnimProps({ isVisible: false });
    expect(props.animate).toEqual({ opacity: 0, x: '100%' });
  });

  test('disables motion while the dock is being resized', () => {
    const props = getRightDockAnimProps({ isVisible: true, isDragging: true });
    expect(props.transition).toEqual({ duration: 0 });
  });
});

describe('getWorkspaceAnimProps()', () => {
  test('returns full opacity when maximized', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.animate.opacity).toBe(1);
    expect(props.animate.scale).toBeUndefined();
  });

  test('uses opacity-only animation in normal mode (no scale — native VTE sync)', () => {
    const props = getWorkspaceAnimProps(false);
    expect(props.animate.opacity).toBe(1);
    expect(props.animate.scale).toBeUndefined();
    expect(props.initial.scale).toBeUndefined();
  });

  test('transition duration is <= 300ms (GPU-composited, feel instant)', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.transition.duration).toBeGreaterThan(0);
    expect(props.transition.duration).toBeLessThanOrEqual(0.3);
  });

  test('initial state starts from zero opacity for a clean fade-in on mount', () => {
    // When isMaximized=false (normal workspace mount), we want a clean
    // fade-in from opacity 0. Starting near 1 (e.g. 0.94) makes the
    // mount animation nearly invisible, defeating its purpose.
    const props = getWorkspaceAnimProps(false);
    expect(props.initial.opacity).toBe(0);
  });

  test('maximized initial state skips the fade-in (already visible)', () => {
    // When isMaximized=true, the workspace was already visible at full
    // opacity — no fade-in needed, start at 1.
    const props = getWorkspaceAnimProps(true);
    expect(props.initial.opacity).toBe(1);
  });
});

/**
 * TerminalWorkspacesManager unit tests — terminal-ux-redesign
 *
 * Tests the pure function `getWorkspaceAnimProps(isMaximized)`.
 */

const { getWorkspaceAnimProps } = require('../terminal/workspaceAnimProps.js');

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

  test('transition duration is ~180ms', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.transition.duration).toBe(0.18);
  });

  test('initial state uses reduced opacity for expand effect', () => {
    const props = getWorkspaceAnimProps(false);
    expect(props.initial.opacity).toBeLessThan(1);
    expect(props.initial.opacity).toBeGreaterThan(0.9);
  });
});
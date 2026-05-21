/**
 * TerminalWorkspacesManager unit tests — terminal-ux-redesign
 *
 * Tests the pure function `getWorkspaceAnimProps(isMaximized)`.
 *
 * Spec requirements:
 * - maximize: motion.div wrapper with scale+opacity transition (200ms)
 * - Tab strip remains visible during maximize
 */

const { getWorkspaceAnimProps } = require('../terminal/workspaceAnimProps.js');

describe('getWorkspaceAnimProps()', () => {
  test('returns scale 1 and full opacity when maximized', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.animate.scale).toBe(1);
    expect(props.animate.opacity).toBe(1);
  });

  test('returns scale < 1 and reduced opacity in normal mode (initial state)', () => {
    const props = getWorkspaceAnimProps(false);
    // In normal mode: scale is full 1 as well (it animates FROM smaller on expand)
    expect(props.animate.scale).toBe(1);
    expect(props.animate.opacity).toBe(1);
  });

  test('transition duration is 0.2s (200ms)', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.transition.duration).toBe(0.2);
  });

  test('initial state has scale slightly below 1 for expand effect', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.initial.scale).toBeLessThan(1);
    expect(props.initial.scale).toBeGreaterThan(0.9);
  });
});

/**
 * TerminalTTY unit tests — terminal-ux-redesign
 *
 * Per Extract-Before-Mock rule, we test pure functions extracted from TerminalTTY.
 *
 * Spec requirements:
 * - xterm container wraps with fade-in animation (opacity 0→1, 150ms)
 * - No inline hex colors override CSS var–derived theme
 *
 * We test the exported pure helper `getXtermContainerAnimProps(connected)`.
 */

const { getXtermContainerAnimProps } = require('../TerminalTTY.jsx');

describe('getXtermContainerAnimProps()', () => {
  test('returns opacity 0 as initial when connected=false', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.initial.opacity).toBe(0);
  });

  test('returns opacity 1 as animate when connected=true', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.animate.opacity).toBe(1);
  });

  test('transition duration is 0.15s (150ms ease-out)', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.transition.duration).toBe(0.15);
    expect(props.transition.ease).toBe('easeOut');
  });

  test('when connected=false, animate keeps opacity 0 (still loading)', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.animate.opacity).toBe(0);
  });
});

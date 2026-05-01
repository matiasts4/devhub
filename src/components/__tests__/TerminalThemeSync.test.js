/**
 * TerminalThemeSync unit tests — terminal-ux-redesign
 *
 * Tests the pure function `buildXtermTheme(getVar)` which accepts
 * a CSS var resolver function and returns an xterm-compatible theme.
 *
 * Spec requirements:
 * - cursorColor maps to --accent-primary (amber oklch(0.74 0.16 57))
 * - All xterm theme properties derive from CSS vars
 * - No hard-coded blue hex in primary mappings
 */

const { buildXtermTheme } = require('../terminal/TerminalThemeSync.js');

describe('buildXtermTheme()', () => {
  // Helper: simulate CSS var resolution with known values
  const makeGetVar = (overrides = {}) =>
    (name) => {
      const defaults = {
        '--accent-primary': 'oklch(0.74 0.16 57)',
        '--terminal-bg': 'transparent',
        '--terminal-fg': '#F0F6FC',
        '--terminal-selection': 'rgba(88,166,255,0.3)',
        '--terminal-black': '#484F58',
        '--terminal-red': '#FF7B72',
        '--terminal-green': '#3FB950',
        '--terminal-yellow': '#D29922',
        '--terminal-blue': '#58A6FF',
        '--terminal-magenta': '#BC8CFF',
        '--terminal-cyan': '#39C5CF',
        '--terminal-white': '#B1BAC4',
        '--terminal-bright-black': '#6E7681',
        '--terminal-bright-red': '#FFA198',
        '--terminal-bright-green': '#56D364',
        '--terminal-bright-yellow': '#E3B341',
        '--terminal-bright-blue': '#79C0FF',
        '--terminal-bright-magenta': '#D2A8FF',
        '--terminal-bright-cyan': '#56D4DD',
        '--terminal-bright-white': '#F0F6FC',
      };
      return overrides[name] ?? defaults[name] ?? '';
    };

  test('cursorColor maps to --accent-primary value', () => {
    const getVar = makeGetVar({ '--accent-primary': 'oklch(0.74 0.16 57)' });
    const theme = buildXtermTheme(getVar);
    expect(theme.cursor).toBe('oklch(0.74 0.16 57)');
  });

  test('cursorColor changes when --accent-primary changes (triangulation)', () => {
    const getVar = makeGetVar({ '--accent-primary': '#e06c75' });
    const theme = buildXtermTheme(getVar);
    expect(theme.cursor).toBe('#e06c75');
  });

  test('background maps to --terminal-bg', () => {
    const getVar = makeGetVar({ '--terminal-bg': '#1a1a1a' });
    const theme = buildXtermTheme(getVar);
    expect(theme.background).toBe('#1a1a1a');
  });

  test('foreground maps to --terminal-fg', () => {
    const getVar = makeGetVar({ '--terminal-fg': '#eeeeee' });
    const theme = buildXtermTheme(getVar);
    expect(theme.foreground).toBe('#eeeeee');
  });

  test('theme object has all required xterm color keys', () => {
    const theme = buildXtermTheme(makeGetVar());
    const requiredKeys = [
      'background', 'foreground', 'cursor', 'selectionBackground',
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
      'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
    ];
    requiredKeys.forEach((key) => {
      expect(theme).toHaveProperty(key);
      expect(typeof theme[key]).toBe('string');
    });
  });
});

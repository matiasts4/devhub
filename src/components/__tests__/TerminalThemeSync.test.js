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

const { buildXtermTheme, getTerminalFontOptions, normalizeColorForXterm } = require('../terminal/TerminalThemeSync.js');

describe('normalizeColorForXterm()', () => {
  test('passes through hex, rgb/rgba and named colors unchanged', () => {
    expect(normalizeColorForXterm('#1a1a1a')).toBe('#1a1a1a');
    expect(normalizeColorForXterm('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(normalizeColorForXterm('rgba(88,166,255,0.3)')).toBe('rgba(88,166,255,0.3)');
    expect(normalizeColorForXterm('transparent')).toBe('transparent');
  });

  test('returns empty string for empty or non-string input', () => {
    expect(normalizeColorForXterm('')).toBe('');
    expect(normalizeColorForXterm('   ')).toBe('');
    expect(normalizeColorForXterm(null)).toBe('');
    expect(normalizeColorForXterm(undefined)).toBe('');
  });

  test('in jsdom (no canvas 2d) wide-gamut colors normalize to empty, never throw', () => {
    // jsdom has no canvas 2d context, so oklch cannot be converted here; the
    // important contract is: no throw, no passthrough of unparseable values.
    expect(() => normalizeColorForXterm('oklch(0.13 0.01 240)')).not.toThrow();
    expect(normalizeColorForXterm('oklch(0.13 0.01 240)')).toBe('');
    expect(normalizeColorForXterm('not-a-color(')).toBe('');
  });
});

describe('buildXtermTheme()', () => {
  // Helper: simulate CSS var resolution with known values
  const makeGetVar =
    (overrides = {}) =>
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

  test('background falls back to --surface-app when --terminal-bg is missing', () => {
    const getVar = makeGetVar({ '--terminal-bg': '', '--surface-app': '#10151c' });
    const theme = buildXtermTheme(getVar);
    expect(theme.background).toBe('#10151c');
  });

  test('foreground maps to --terminal-fg', () => {
    const getVar = makeGetVar({ '--terminal-fg': '#eeeeee' });
    const theme = buildXtermTheme(getVar);
    expect(theme.foreground).toBe('#eeeeee');
  });

  test('theme object has all required xterm color keys', () => {
    const theme = buildXtermTheme(makeGetVar());
    const requiredKeys = [
      'background',
      'foreground',
      'cursor',
      'selectionBackground',
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ];
    requiredKeys.forEach((key) => {
      expect(theme).toHaveProperty(key);
      expect(typeof theme[key]).toBe('string');
    });
  });

  test('morphology chrome vars do not mutate xterm theme mappings', () => {
    const baseline = buildXtermTheme(makeGetVar());
    const chromeShifted = buildXtermTheme(
      makeGetVar({
        '--chrome-panel-fill': 'rgba(12, 16, 24, 0.95)',
        '--chrome-panel-fill-emphasis': 'rgba(18, 24, 34, 0.98)',
        '--chrome-border-color': 'rgba(240, 246, 252, 0.14)',
        '--chrome-radius-panel': '28px',
      })
    );

    expect(chromeShifted).toEqual(baseline);
  });

  test('theme hue changes still propagate through xterm independently of morphology chrome', () => {
    const theme = buildXtermTheme(
      makeGetVar({
        '--accent-primary': '#e6b450',
        '--chrome-panel-fill': 'rgba(30, 30, 30, 0.92)',
      })
    );

    expect(theme.cursor).toBe('#e6b450');
    expect(theme.background).toBe('transparent');
  });
});

describe('getTerminalFontOptions()', () => {
  test('returns clean standard defaults when CSS vars are unset', () => {
    const opts = getTerminalFontOptions();
    expect(opts.fontWeight).toBe('500');
    expect(opts.fontWeightBold).toBe('800');
    expect(opts.lineHeight).toBe(1.5);
    expect(opts.letterSpacing).toBe(0);
    expect(opts.fontFamily).toContain('monospace');
  });
});

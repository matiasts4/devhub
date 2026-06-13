const { JSDOM } = require('jsdom');

const {
  buildTerminalChromeVars,
  buildXtermTheme,
} = require('../../src/components/terminal/TerminalThemeSync');

const { TERMINAL_HEADER_STYLES, THEME_OPTIONS } = require('../../src/lib/theme/themes');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  return dom;
}

describe('buildTerminalChromeVars', () => {
  test('dragon style returns gradient background and visible accent bar', () => {
    const vars = buildTerminalChromeVars('dragon');
    expect(vars['--terminal-header-bg']).toBe('var(--surface-card)');
    expect(vars['--terminal-header-gradient']).toBe(
      'linear-gradient(180deg, var(--surface-elevated), var(--chrome-panel-fill))'
    );
    expect(vars['--terminal-accent-bar']).toBe('var(--accent-primary)');
  });

  test('minimal style returns flat background and hidden accent bar', () => {
    const vars = buildTerminalChromeVars('minimal');
    expect(vars['--terminal-header-bg']).toBe('var(--surface-card)');
    expect(vars['--terminal-header-gradient']).toBe('var(--surface-card)');
    expect(vars['--terminal-accent-bar']).toBe('transparent');
  });

  test('gradient style returns gradient background without accent bar', () => {
    const vars = buildTerminalChromeVars('gradient');
    expect(vars['--terminal-header-bg']).toBe('var(--surface-card)');
    expect(vars['--terminal-header-gradient']).toBe(
      'linear-gradient(180deg, var(--surface-elevated), var(--surface-card))'
    );
    expect(vars['--terminal-accent-bar']).toBe('transparent');
  });

  test('plain style returns flat solid background without accent bar', () => {
    const vars = buildTerminalChromeVars('plain');
    expect(vars['--terminal-header-bg']).toBe('var(--surface-card)');
    expect(vars['--terminal-header-gradient']).toBe('var(--surface-card)');
    expect(vars['--terminal-accent-bar']).toBe('transparent');
  });

  test('unknown style defaults to plain (transparent accent bar)', () => {
    const vars = buildTerminalChromeVars('unknown-style');
    expect(vars['--terminal-accent-bar']).toBe('transparent');
  });
});

describe('buildXtermTheme — terminal CSS var priority', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.localStorage;
  });

  test('reads --terminal-bg before falling back to --surface-app', () => {
    // Set up CSS vars: terminal-bg is set, surface-app is also set
    document.documentElement.style.setProperty('--terminal-bg', '#1a1a1a');
    document.documentElement.style.setProperty('--surface-app', '#0d1117');
    document.documentElement.style.setProperty('--terminal-fg', '#ffffff');
    document.documentElement.style.setProperty('--accent-primary', '#58A6FF');

    const resolver = (name) => document.documentElement.style.getPropertyValue(name).trim();
    const theme = buildXtermTheme(resolver);

    expect(theme.background).toBe('#1a1a1a');
  });

  test('falls back to --surface-app when --terminal-bg is empty', () => {
    document.documentElement.style.setProperty('--surface-app', '#0d1117');
    document.documentElement.style.setProperty('--terminal-fg', '#ffffff');
    document.documentElement.style.setProperty('--accent-primary', '#58A6FF');
    // --terminal-bg intentionally not set

    const resolver = (name) => document.documentElement.style.getPropertyValue(name).trim();
    const theme = buildXtermTheme(resolver);

    expect(theme.background).toBe('#0d1117');
  });

  test('reads --terminal-fg before fallback for foreground', () => {
    document.documentElement.style.setProperty('--terminal-bg', '#1a1a1a');
    document.documentElement.style.setProperty('--terminal-fg', '#ffeecc');
    document.documentElement.style.setProperty('--accent-primary', '#58A6FF');

    const resolver = (name) => document.documentElement.style.getPropertyValue(name).trim();
    const theme = buildXtermTheme(resolver);

    expect(theme.foreground).toBe('#ffeecc');
  });
});

describe('themes.js terminalBg structure', () => {
  test('every theme in THEME_OPTIONS has terminalBg with bg, fg, headerBg', () => {
    THEME_OPTIONS.forEach((theme) => {
      expect(theme).toHaveProperty('terminalBg');
      expect(theme.terminalBg).toHaveProperty('bg');
      expect(theme.terminalBg).toHaveProperty('fg');
      expect(theme.terminalBg).toHaveProperty('headerBg');

      // Values should be non-empty hex color strings
      expect(typeof theme.terminalBg.bg).toBe('string');
      expect(theme.terminalBg.bg.length).toBeGreaterThan(0);
      expect(typeof theme.terminalBg.fg).toBe('string');
      expect(theme.terminalBg.fg.length).toBeGreaterThan(0);
      expect(typeof theme.terminalBg.headerBg).toBe('string');
      expect(theme.terminalBg.headerBg.length).toBeGreaterThan(0);
    });
  });
});

describe('TERMINAL_HEADER_STYLES constant', () => {
  test('has all four required style values', () => {
    expect(TERMINAL_HEADER_STYLES.DRAGON).toBe('dragon');
    expect(TERMINAL_HEADER_STYLES.MINIMAL).toBe('minimal');
    expect(TERMINAL_HEADER_STYLES.GRADIENT).toBe('gradient');
    expect(TERMINAL_HEADER_STYLES.PLAIN).toBe('plain');
  });
});

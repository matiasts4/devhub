/**
 * CSS Token Tests — terminal-ux-redesign
 *
 * Tests read globals.css and assert token presence via regex.
 * Jest doesn't run a real browser, so we use file-read-based assertions.
 *
 * Spec requirements:
 * - --accent-primary resolves to the current deep-sea token value
 * - No blue hex (#0969da, #58a6ff, #2f81f7) in the default theme token block
 * - Geist font loaded from Google Fonts CDN
 * - JetBrains Mono declared for code/terminal elements
 */

const fs = require('fs');
const path = require('path');

const GLOBALS_CSS_PATH = path.resolve(__dirname, '../../../src/app/globals.css');
const INDEX_CSS_PATH = path.resolve(__dirname, '../../../src/index.css');

describe('CSS Tokens — globals.css', () => {
  let css;

  beforeAll(() => {
    css = fs.readFileSync(GLOBALS_CSS_PATH, 'utf8');
  });

  test('--accent-primary matches the canonical deep-sea OKLCH token value', () => {
    expect(css).toMatch(/--accent-primary\s*:\s*oklch\(0\.73\s+0\.15\s+234\)/);
  });

  test('Geist font is imported from Google Fonts CDN', () => {
    expect(css).toMatch(/fonts\.googleapis\.com.*Geist/);
  });

  test('JetBrains Mono is declared for code/terminal elements', () => {
    expect(css).toMatch(/JetBrains Mono/);
  });

  test('Inter font import is replaced — no Inter import in globals.css', () => {
    // Inter should no longer be imported via Google Fonts in globals.css
    expect(css).not.toMatch(/fonts\.googleapis\.com.*Inter/);
  });

  test('--surface-app uses OKLCH value', () => {
    expect(css).toMatch(/--surface-app\s*:\s*oklch\(/);
  });

  test('--text-primary uses OKLCH value', () => {
    expect(css).toMatch(/--text-primary\s*:\s*oklch\(/);
  });

  test('defines morphology chrome token families on the shared runtime stylesheet', () => {
    expect(css).toMatch(/--chrome-radius-panel\s*:/);
    expect(css).toMatch(/--chrome-radius-control\s*:/);
    expect(css).toMatch(/--chrome-border-width\s*:/);
    expect(css).toMatch(/--chrome-shadow-panel\s*:/);
    expect(css).toMatch(/--chrome-shadow-control\s*:/);
    expect(css).toMatch(/--chrome-panel-fill\s*:/);
    expect(css).toMatch(/--chrome-control-fill\s*:/);
    expect(css).toMatch(/--chrome-press-offset\s*:/);
  });

  test('defines a brutalist-stage morphology override block without owning theme hue tokens', () => {
    const match = css.match(/\[data-morphology=['"]brutalist-stage['"]\]\s*\{([\s\S]*?)\n\s*\}/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/--chrome-radius-panel\s*:/);
    expect(match[1]).toMatch(/--chrome-radius-control\s*:/);
    expect(match[1]).toMatch(/--chrome-border-width\s*:/);
    expect(match[1]).not.toMatch(/--accent-primary\s*:/);
    expect(match[1]).not.toMatch(/--surface-app\s*:/);
  });

  test('xterm viewport keeps native vertical scrolling enabled', () => {
    expect(css).toMatch(
      /\.devhub-xterm-container \.xterm-viewport\s*\{[\s\S]*overflow-y:\s*auto\s*!important;/
    );
    expect(css).toMatch(
      /\.devhub-xterm-container \.xterm-viewport\s*\{[\s\S]*overflow-x:\s*hidden\s*!important;/
    );
  });

  test('xterm viewport reserves stable scrollbar gutter to avoid offset artifacts', () => {
    expect(css).toMatch(
      /\.devhub-xterm-container \.xterm-viewport\s*\{[\s\S]*scrollbar-gutter:\s*stable;/
    );
  });

  test('xterm viewport no longer uses transparent background that corrupts TUI canvas rendering', () => {
    expect(css).toMatch(
      /\.devhub-xterm-container \.xterm-viewport\s*\{[\s\S]*background-color:\s*var\(--surface-app\)\s*!important;/
    );
    expect(css).not.toMatch(
      /\.devhub-xterm-container \.xterm-viewport\s*\{[\s\S]*background-color:\s*transparent\s*!important;/
    );
  });

  test('xterm layers inherit a solid app-surface background', () => {
    expect(css).toMatch(
      /\.devhub-xterm-container \.xterm,\s*[\s\S]*\.devhub-xterm-container \.xterm-screen,\s*[\s\S]*\.devhub-xterm-container \.xterm-viewport\s*\{[\s\S]*background-color:\s*var\(--surface-app\)\s*!important;/
    );
  });

  test('blue hex accent #0969da does not appear in default :root token block', () => {
    // Extract just the :root block (default theme)
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/s);
    if (rootMatch) {
      expect(rootMatch[1]).not.toContain('#0969da');
    } else {
      // If root is defined differently, just check the accent-primary line
      const accentLine = css.match(/--accent-primary\s*:[^\n]+/);
      expect(accentLine?.[0] || '').not.toContain('#0969da');
    }
  });

  test('blue hex accent #58a6ff does not appear as --accent-primary value in default theme', () => {
    const rootMatch = css.match(/:root[^{]*\{([^}]+)\}/s);
    if (rootMatch) {
      const accentPrimaryLine = rootMatch[1].match(/--accent-primary\s*:[^\n;]+/);
      expect(accentPrimaryLine?.[0] || '').not.toContain('#58a6ff');
    }
  });
});

describe('CSS Tokens — index.css cleanup', () => {
  let indexCss;

  beforeAll(() => {
    indexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
  });

  test('index.css does not redefine --accent-primary in its local :root block', () => {
    const rootMatch = indexCss.match(/:root\s*\{([^}]+)\}/s);
    if (rootMatch) {
      const accentLine = rootMatch[1].match(/--accent-primary\s*:[^\n;]+/);
      expect(accentLine).toBeNull();
    }
  });

  test('index.css imports or mirrors the morphology runtime token layer needed by the desktop shell', () => {
    expect(indexCss).toMatch(/data-morphology|globals\.css/);
  });
});

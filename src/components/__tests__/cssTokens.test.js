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
});

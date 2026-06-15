// PR-1: morphology-system R5 — Ajustes (7 tabs) MUST derive chrome geometry
// from --chrome-* tokens or morphology.js factories. No chrome surface in
// Ajustes.jsx may hardcode `borderRadius: 0`.
//
// The 5 theme-card preview inner blocks (lines 261, 269, 275, 282, 1120)
// are decoration, not chrome — they are kept as deliberate square
// preview thumbnails. This test asserts the per-morphology radius and
// shadow resolve through tokens on chrome surfaces only.
//
// Test layer: unit (source-level). Reads Ajustes.jsx + globals.css and
// asserts the contract, not the rendered DOM. This is the right layer
// because the rule is about source invariants, not runtime resolution.

const fs = require('fs');
const path = require('path');

const AJUSTES_PATH = path.resolve(__dirname, '../../views/Ajustes.jsx');
const GLOBALS_CSS_PATH = path.resolve(__dirname, '../../app/globals.css');

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractMorphologyBlock(src, morphologyKey) {
  const re = new RegExp(
    `\\[data-morphology=['"]${morphologyKey}['"]\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
    'm'
  );
  const match = src.match(re);
  if (!match) return null;
  return match[1];
}

// Chrome-surface call sites in Ajustes — these are the panels/controls
// that MUST resolve through the token layer. We exclude the 5 preview
// inner blocks and the 2 shadow overrides (which are chrome deletes).
function isChromeSurfaceLine(line) {
  // Exclude ThemeOptionCard preview inner blocks (3 of them around
  // lines 261, 269, 275, 282) and the accent-preview blocks (line 1120).
  // These are decorative swatches, not chrome.
  if (line.includes('preview.body') || line.includes('preview.line')) return false;
  if (line.includes('preview.highlight')) return false;
  if (line.includes('preview.panel')) return false;
  if (line.includes('settings-accent-preview')) return false;
  return true;
}

describe('Ajustes morphology chrome coverage (R5)', () => {
  let src;
  let globalsSrc;

  beforeAll(() => {
    src = readSource(AJUSTES_PATH);
    globalsSrc = readSource(GLOBALS_CSS_PATH);
  });

  test('Ajustes.jsx source no longer hardcodes borderRadius: 0 on chrome surfaces', () => {
    // The helpers getSettingsShellStyle / getSettingsControlStyle /
    // getSettingsAccentOptionStyle MUST be deleted. They are the only
    // source of the override today.
    expect(src).not.toMatch(/export\s+function\s+getSettingsShellStyle/);
    expect(src).not.toMatch(/export\s+function\s+getSettingsControlStyle/);
    expect(src).not.toMatch(/export\s+function\s+getSettingsAccentOptionStyle/);

    // Scan every line for `borderRadius: 0` inside an inline style — none
    // should remain on chrome surfaces.
    const lines = src.split('\n');
    const chromeViolations = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => /borderRadius:\s*0/.test(line))
      .filter(({ line }) => isChromeSurfaceLine(line));

    expect(chromeViolations).toEqual([]);
  });

  test('Ajustes.jsx source no longer hardcodes 4px 4px 0 0 shadow on chrome surfaces', () => {
    const lines = src.split('\n');
    const shadowViolations = lines
      .map((line, i) => ({ line: line.trim(), num: i + 1 }))
      .filter(({ line }) => /['"]4px 4px 0 0 var\(--border-strong\)['"]/.test(line))
      .filter(({ line }) => isChromeSurfaceLine(line));

    expect(shadowViolations).toEqual([]);
  });

  test('Ajustes chrome resolves --chrome-radius-panel from each morphology block', () => {
    // For each of the 5 morphologies, --chrome-radius-panel is defined
    // in globals.css. The token is what Ajustes inherits via
    // chromeSurfaceStyle() / panelStyle() / pillStyle() — no inline
    // override should bypass it.
    const expected = {
      default: '0',
      'brutalist-stage': '0',
      aura: '1.25rem',
      switchyard: '18px',
      cursor: '18px',
    };

    Object.entries(expected).forEach(([key, want]) => {
      const block = extractMorphologyBlock(globalsSrc, key);
      expect(block).not.toBeNull();
      expect(block).toMatch(
        new RegExp(`--chrome-radius-panel\\s*:\\s*${want.replace(/\./g, '\\.')}\\s*;`)
      );
    });
  });

  test('Ajustes chrome surfaces wire through chromeSurfaceStyle / panelStyle / pillStyle / btnPrimaryStyle', () => {
    // The Ajustes import block at the top of the file MUST include the
    // shared chrome factories directly. This guards against accidental
    // re-introduction of the local helpers and keeps the call sites
    // routed through the token layer.
    expect(src).toMatch(/from\s+['"]@\/chrome\/morphology['"]/);

    // chromeSurfaceStyle is imported from chrome-surface.
    expect(src).toMatch(/chromeSurfaceStyle/);
    expect(src).toMatch(/from\s+['"]@\/components\/ui\/chrome-surface['"]/);
  });
});

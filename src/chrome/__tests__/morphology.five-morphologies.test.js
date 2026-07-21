// PR-1: morphology-system R5 — Ajustes (7 tabs) MUST derive chrome geometry
// from --chrome-* tokens or morphology.js factories. No chrome surface in
// Ajustes.jsx may hardcode `borderRadius: 0`.
//
// The theme-card preview inner blocks are decoration, not chrome — they are
// kept as deliberate square preview thumbnails. This test asserts the
// per-morphology radius and shadow resolve through tokens on chrome surfaces
// only. Six morphologies: default, brutalist-stage, aura, switchyard, cursor,
// opencode-desktop.
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
// that MUST resolve through the token layer. We exclude the 5 theme
// preview inner blocks and the accent preview swatches (decoration, not
// chrome) by detecting them through context (the lines around a
// `borderRadius: 0` line are inspected for `preview.*` or
// `accent-preview` references — both indicate the swatch block).
function isChromeSurfaceLine(line, context) {
  if (line.includes('preview.body') || line.includes('preview.line')) return false;
  if (line.includes('preview.highlight')) return false;
  if (line.includes('preview.panel')) return false;
  if (line.includes('settings-accent-preview')) return false;
  for (const ctx of context) {
    if (
      ctx.includes('preview.body') ||
      ctx.includes('preview.line') ||
      ctx.includes('preview.highlight') ||
      ctx.includes('preview.panel') ||
      ctx.includes('settings-accent-preview')
    ) {
      return false;
    }
  }
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
      .map((line, i) => ({ line, num: i + 1 }))
      .filter(({ line }) => /borderRadius:\s*0/.test(line))
      .filter(({ line, num }) => {
        const start = Math.max(0, num - 6);
        const end = Math.min(lines.length, num + 4);
        const context = lines.slice(start, end);
        return isChromeSurfaceLine(line, context);
      });

    expect(chromeViolations).toEqual([]);
  });

  test('Ajustes.jsx source no longer hardcodes 4px 4px 0 0 shadow on chrome surfaces', () => {
    const lines = src.split('\n');
    const shadowViolations = lines
      .map((line, i) => ({ line, num: i + 1 }))
      .filter(({ line }) => /['"]4px 4px 0 0 var\(--border-strong\)['"]/.test(line))
      .filter(({ line, num }) => {
        const start = Math.max(0, num - 6);
        const end = Math.min(lines.length, num + 4);
        const context = lines.slice(start, end);
        return isChromeSurfaceLine(line, context);
      });

    expect(shadowViolations).toEqual([]);
  });

  test('Ajustes chrome resolves --chrome-radius-panel from each morphology block', () => {
    // For each of the 6 morphologies, --chrome-radius-panel is defined
    // in globals.css. The token is what Ajustes inherits via
    // chromeSurfaceStyle() / panelStyle() / pillStyle() — no inline
    // override should bypass it.
    const expected = {
      default: '0',
      'brutalist-stage': '0',
      aura: '1.25rem',
      switchyard: '18px',
      cursor: '18px',
      'opencode-desktop': '12px',
    };

    Object.entries(expected).forEach(([key, want]) => {
      const block = extractMorphologyBlock(globalsSrc, key);
      expect(block).not.toBeNull();
      expect(block).toMatch(
        new RegExp(`--chrome-radius-panel\\s*:\\s*${want.replace(/\./g, '\\.')}\\s*;`)
      );
    });
  });

  test('opencode-desktop morphology has quiet control radius and no accent lock', () => {
    const block = extractMorphologyBlock(globalsSrc, 'opencode-desktop');
    expect(block).not.toBeNull();
    expect(block).toMatch(/--chrome-radius-control\s*:\s*8px\s*;/);
    expect(block).toMatch(/--chrome-border-width\s*:\s*1px\s*;/);
    expect(block).not.toMatch(/--accent-primary\s*:/);
    expect(block).not.toMatch(/--accent-glow\s*:/);
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

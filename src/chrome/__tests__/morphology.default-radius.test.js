// PR-1: morphology-system R6 amendment — default morphology MUST set
// `--chrome-radius-panel: 0` to preserve the legacy Ajustes square look.
// Other morphologies (brutalist-stage, aura, switchyard, cursor) MUST keep
// their existing radius values unchanged.
//
// This test reads `src/app/globals.css` directly and asserts the resolved
// token under `[data-morphology='default']` is `0` — not `1rem`.

const fs = require('fs');
const path = require('path');

const GLOBALS_CSS_PATH = path.resolve(__dirname, '../../app/globals.css');

function readSource() {
  return fs.readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

function extractMorphologyBlock(src, morphologyKey) {
  // Match the [data-morphology='KEY'] { ... } block, non-greedy until the
  // closing brace of the same depth.
  const re = new RegExp(
    `\\[data-morphology=['"]${morphologyKey}['"]\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
    'm'
  );
  const match = src.match(re);
  if (!match) return null;
  return match[1];
}

describe('morphology default radius (R6 amendment)', () => {
  let src;

  beforeAll(() => {
    src = readSource();
  });

  test('default morphology sets --chrome-radius-panel: 0', () => {
    const block = extractMorphologyBlock(src, 'default');
    expect(block).not.toBeNull();

    // Match the actual declaration line. Allow any whitespace before
    // the value and any comment between.
    const re = /--chrome-radius-panel\s*:\s*([^;]+);/;
    const match = block.match(re);
    expect(match).not.toBeNull();
    const value = match[1].trim();

    // The R6 amendment: default may be 0 or 0px. Must not be 1rem.
    expect(value).toBe('0');
    expect(value).not.toBe('1rem');
  });

  test('all other morphologies keep their pre-cursor radius values', () => {
    // brutalist-stage stays at 0
    const brutalist = extractMorphologyBlock(src, 'brutalist-stage');
    expect(brutalist).not.toBeNull();
    expect(brutalist).toMatch(/--chrome-radius-panel\s*:\s*0\s*;/);

    // aura stays at 1.25rem
    const aura = extractMorphologyBlock(src, 'aura');
    expect(aura).not.toBeNull();
    expect(aura).toMatch(/--chrome-radius-panel\s*:\s*1\.25rem\s*;/);

    // switchyard stays at 18px
    const switchyard = extractMorphologyBlock(src, 'switchyard');
    expect(switchyard).not.toBeNull();
    expect(switchyard).toMatch(/--chrome-radius-panel\s*:\s*18px\s*;/);

    // cursor stays at 18px
    const cursor = extractMorphologyBlock(src, 'cursor');
    expect(cursor).not.toBeNull();
    expect(cursor).toMatch(/--chrome-radius-panel\s*:\s*18px\s*;/);
  });
});

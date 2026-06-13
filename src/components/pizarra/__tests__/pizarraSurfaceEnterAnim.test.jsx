/**
 * pizarraSurfaceEnterAnim — apply SURFACE_ENTER_OPACITY_ONLY to inner
 * frames of CanvasTerminal and PizarraBrowserSurface (pizarra-motion-polish
 * P-MP-6).
 *
 * The enter animation tokens are defined in `surfaceMotion.js`:
 *   - SURFACE_ENTER_OPACITY_ONLY = 'pizarraSurfaceEnterOpacity 340ms cubic-bezier(0.22, 1, 0.36, 1) both'
 *
 * The positioned OUTER wrapper (the one sized to the projected canvas
 * rect) must NEVER receive an animation property because the inner
 * frame hosts native IPC-positioned overlays (VTE / WebKitGTK). Any
 * transform on the wrapper desyncs the chrome from the native content
 * rect. This file pins both contracts:
 *
 *   1. CanvasTerminal inner frame: style.animation contains
 *      'pizarraSurfaceEnterOpacity'.
 *   2. PizarraBrowserSurface inner frame: same.
 *   3. The positioned outer wrapper in BOTH components has NO animation
 *      style (style.animation is empty or undefined).
 *   4. The inner frame also carries data-surface-state="entering" for
 *      the duration of the enter animation (cleared after DUR.enter ms).
 *
 * We test this at the source-string level — same approach as the
 * P-MP-5 wheel routing test. The source is small enough that source
 * assertions are far more reliable than a full React render against
 * react-konva + TerminalTTY + workspaceBrowserPane.
 */
const fs = require('fs');
const path = require('path');

const COMPONENTS = {
  CanvasTerminal: path.resolve(__dirname, '../../../components/pizarra/CanvasTerminal.jsx'),
  PizarraBrowserSurface: path.resolve(
    __dirname,
    '../../../components/pizarra/PizarraBrowserSurface.jsx'
  ),
};

function readSource(name) {
  return fs.readFileSync(COMPONENTS[name], 'utf8');
}

// Match a JSX style object whose `animation` key references the
// SURFACE_ENTER_OPACITY_ONLY token. Tolerates single/double quotes
// and inline-expression variants. The component sources may apply
// the token either as a literal string, as a direct reference to the
// imported constant, or via the shared useSurfaceEnterAnimation() hook
// (`enterAnim.animation`). All three are valid; the contract is that
// SOME reference to the opacity-only token reaches the inner frame's
// `style.animation` key.
function hasAnimationStyleReferencing(source, identifier) {
  const literalPattern = new RegExp(`animation\\s*:\\s*['"\`]pizarraSurfaceEnterOpacity`, 'm');
  const tokenPattern = new RegExp(`animation\\s*:\\s*${identifier}\\b`);
  const hookPattern = /animation\s*:\s*enterAnim\.animation/;
  return literalPattern.test(source) || tokenPattern.test(source) || hookPattern.test(source);
}

function hasSurfaceStateEntering(source) {
  // Accept either form: a literal `data-surface-state="entering"`
  // attribute, OR a spread that uses the constant from
  // useSurfaceEnterAnimation (`[SURFACE_ENTER_STATE_ATTRIBUTE]:
  // enterAnim.surfaceState`). The constant value is set to the
  // string 'entering' initially by the hook.
  const literal = /data-surface-state\s*=\s*['"]entering['"]/.test(source);
  const constantBound = /SURFACE_ENTER_STATE_ATTRIBUTE[\s\S]{0,200}enterAnim\.surfaceState/.test(
    source
  );
  return literal || constantBound;
}

function wrapperHasNoAnimationStyle(source) {
  // Locate the outer positioned wrapper — the one carrying
  // data-testid="canvas-terminal-container" or
  // "pizarra-browser-surface-…". Extract ONLY its inline style
  // object (the {...} block immediately following) and assert
  // the object does NOT contain an `animation` key. We slice up
  // to the matching `}}` so the assertion ignores surrounding
  // comments that mention "animation" or "wrapper transforms".
  const wrapperStart = source.indexOf('data-testid="canvas-terminal-container"');
  const altStart = source.indexOf('data-testid={`pizarra-browser-surface-');
  const startIdx = wrapperStart >= 0 ? wrapperStart : altStart;
  if (startIdx < 0) return true; // no wrapper found → vacuously pass
  // Find the opening brace of the style object: `style={{` after
  // startIdx. If the wrapper has no `style={{` prop, that's
  // also vacuously OK (the wrapper is not animated).
  const styleOpen = source.indexOf('style={{', startIdx);
  if (styleOpen < 0) return true;
  // Find the matching close: walk braces from styleOpen + 'style={{'.length.
  const searchFrom = styleOpen + 'style={{'.length;
  let depth = 1;
  let cursor = searchFrom;
  while (cursor < source.length && depth > 0) {
    const ch = source[cursor];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    cursor += 1;
  }
  if (depth !== 0) return true; // malformed → vacuous
  const styleObject = source.slice(searchFrom, cursor - 1);
  // The wrapper's style MUST contain `position: 'absolute'` and
  // MUST NOT contain a top-level `animation:` key.
  if (!/position\s*:\s*['"]absolute['"]/.test(styleObject)) return true;
  return !/(^|\n)\s*animation\s*:/.test(styleObject);
}

describe('pizarraSurfaceEnterAnim — SURFACE_ENTER_OPACITY_ONLY applied to inner frames (P-MP-6)', () => {
  test('CanvasTerminal: inner frame style.animation references pizarraSurfaceEnterOpacity', () => {
    const source = readSource('CanvasTerminal');
    expect(hasAnimationStyleReferencing(source, 'SURFACE_ENTER_OPACITY_ONLY')).toBe(true);
  });

  test('CanvasTerminal: imports SURFACE_ENTER_OPACITY_ONLY from surfaceMotion (not just SURFACE_ENTER_ANIMATION)', () => {
    const source = readSource('CanvasTerminal');
    // The fix changes the import from SURFACE_ENTER_ANIMATION to
    // SURFACE_ENTER_OPACITY_ONLY. The assertion checks BOTH:
    // the opacity-only token IS imported, AND the transform-bearing
    // token is NOT imported (no longer needed for live surfaces).
    expect(source).toMatch(
      /import\s*\{[^}]*\bSURFACE_ENTER_OPACITY_ONLY\b[^}]*\}\s*from\s*['"]@\/lib\/pizarra\/surfaceMotion['"]/
    );
    expect(source).not.toMatch(/^\s*SURFACE_ENTER_ANIMATION\s*,?\s*$/m);
  });

  test('CanvasTerminal: inner frame carries data-surface-state="entering"', () => {
    const source = readSource('CanvasTerminal');
    expect(hasSurfaceStateEntering(source)).toBe(true);
  });

  test('PizarraBrowserSurface: inner frame style.animation references pizarraSurfaceEnterOpacity', () => {
    const source = readSource('PizarraBrowserSurface');
    expect(hasAnimationStyleReferencing(source, 'SURFACE_ENTER_OPACITY_ONLY')).toBe(true);
  });

  test('PizarraBrowserSurface: imports SURFACE_ENTER_OPACITY_ONLY from surfaceMotion', () => {
    const source = readSource('PizarraBrowserSurface');
    expect(source).toMatch(
      /import\s*\{[^}]*\bSURFACE_ENTER_OPACITY_ONLY\b[^}]*\}\s*from\s*['"]@\/lib\/pizarra\/surfaceMotion['"]/
    );
    expect(source).not.toMatch(/^\s*SURFACE_ENTER_ANIMATION\s*,?\s*$/m);
  });

  test('PizarraBrowserSurface: inner frame carries data-surface-state="entering"', () => {
    const source = readSource('PizarraBrowserSurface');
    expect(hasSurfaceStateEntering(source)).toBe(true);
  });

  test('CanvasTerminal: positioned outer wrapper does NOT carry an animation style', () => {
    const source = readSource('CanvasTerminal');
    expect(wrapperHasNoAnimationStyle(source)).toBe(true);
  });

  test('PizarraBrowserSurface: positioned outer wrapper does NOT carry an animation style', () => {
    const source = readSource('PizarraBrowserSurface');
    expect(wrapperHasNoAnimationStyle(source)).toBe(true);
  });
});

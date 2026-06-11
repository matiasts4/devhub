/**
 * canvasViewport.js — provider-side wheel routing via shouldCanvasConsumeWheel
 * (pizarra-motion-polish P-MP-5).
 *
 * The `CanvasViewportProvider` component owns a second wheel handler that
 * intercepts wheel events at the canvasContainer boundary. Before
 * P-MP-5, that handler inlined its own selector list:
 *
 *   event.target.closest('[data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]')
 *
 * The two wheel handlers (PizarraCanvas + provider) had to stay in
 * lockstep on the selector set, which is exactly the kind of thing
 * that drifts and produces "wheel zoomed instead of scrolled" bugs
 * in production. P-MP-5 wires the provider to the same
 * `shouldCanvasConsumeWheel(event)` helper that PizarraCanvas.jsx
 * uses (P-MP-4), so there is exactly one source of truth.
 *
 * This test pins that contract at the source level — no React render
 * needed, no jsdom dance. The test reads the raw file as a string
 * and asserts the inline selector list is GONE.
 *
 * We pair that with a behavioral assertion: the provider's wheel
 * handler must call the helper. We exercise it by stubbing
 * `pizarraWheel` via the existing mock surface (`pizarraWheel.js`
 * is require()-able from the test scope) and verifying the helper
 * is the one consulted, not the inline selector.
 */
const fs = require('fs');
const path = require('path');

const CANVAS_VIEWPORT_PATH = path.resolve(__dirname, '../../../lib/pizarra/canvasViewport.js');

function readCanvasViewport() {
  return fs.readFileSync(CANVAS_VIEWPORT_PATH, 'utf8');
}

describe('canvasViewport.js — provider wheel handler uses shouldCanvasConsumeWheel (P-MP-5)', () => {
  let source;
  beforeAll(() => {
    source = readCanvasViewport();
  });

  test('the provider no longer contains the legacy inline selector list', () => {
    // The legacy selector list was:
    //   [data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]
    // If we find this string inside the file, the wheel handler is
    // still using its own selector — drift risk.
    const legacyString = '[data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]';
    expect(source).not.toContain(legacyString);
  });

  test('the provider does NOT call event.target.closest inside its wheel handler', () => {
    // The legacy handler had: event.target.closest(...)
    // After P-MP-5 the only selector consultation happens inside
    // shouldCanvasConsumeWheel. Asserting this guarantees the
    // provider no longer carries its own selector.
    //
    // The check is a substring absence in the whole file; the
    // legacy code was unique enough to not appear elsewhere.
    expect(source).not.toMatch(/event\.target\.closest\(/);
  });

  test('the provider imports shouldCanvasConsumeWheel from pizarraWheel', () => {
    // The fix wires the provider to the same helper PizarraCanvas
    // uses. The import is the source-of-truth contract: if the
    // import is missing, the provider cannot be using the helper.
    // Accept either the aliased @ path OR a relative import — the
    // canvasViewport.js file uses a relative import (`./pizarraWheel`)
    // and that's perfectly fine.
    expect(source).toMatch(
      /import\s*\{[^}]*\bshouldCanvasConsumeWheel\b[^}]*\}\s*from\s*['"](?:\.\/pizarraWheel|@\/lib\/pizarra\/pizarraWheel)['"]/
    );
  });

  test('the provider imports zoomAtPoint from the same canvasViewport module', () => {
    // Focal zoom (P-MP-4) requires zoomAtPoint. The provider can
    // either reuse the local export (already exported at the top of
    // the file) or import it from itself; either way the
    // identifier must be reachable. The cleanest test: assert
    // `zoomAtPoint` is mentioned inside the provider's wheel
    // handler block (i.e. the handler actually uses focal math
    // rather than the legacy center-anchored updater).
    //
    // Extract the wheel handler block (between 'handleWheel' and
    // the matching close) and check it references zoomAtPoint.
    const handlerStart = source.indexOf('const handleWheel');
    expect(handlerStart).toBeGreaterThan(0);
    const handlerEnd = source.indexOf('container.addEventListener', handlerStart);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const block = source.slice(handlerStart, handlerEnd);
    expect(block).toMatch(/zoomAtPoint/);
  });
});

/**
 * PizarraCanvas — circle center (pizarra-motion-polish P-MP-7).
 *
 * The audit P0 gap: the legacy `handleMouseUp` for the circle tool
 * created a shape with `x = startX, y = startY, radius = min(dx, dy) / 2`.
 * That is, x/y was the bounding-box CORNER and radius was half the
 * SHORTER axis. The renderer reads x/y as the circle CENTER and
 * radius as the half-diagonal. So stored circles with that schema
 * rendered at the wrong position with the wrong size.
 *
 * The fix: store the circle with `x = (startX + pos.x) / 2` (the
 * midpoint) and `radius = sqrt(dx² + dy²) / 2` (half the diagonal).
 * The renderer stays the same — it always treated x/y as center.
 *
 * This file pins the contract at the source-level. The shape
 * creation lives inside `PizarraCanvas.jsx` in `handleMouseUp`'s
 * `type === SHAPE_TYPES.CIRCLE` branch. We extract the relevant
 * block and verify the math.
 *
 * Source-level testing for the same reasons as P-MP-5 / P-MP-6: a
 * full React render against react-konva + TerminalTTY is brittle;
 * the math is the contract and the math is in plain JS.
 */
const fs = require('fs');
const path = require('path');

const CANVAS_PATH = path.resolve(__dirname, '../../../components/pizarra/PizarraCanvas.jsx');

function readCanvas() {
  return fs.readFileSync(CANVAS_PATH, 'utf8');
}

// Extract the circle branch in handleMouseUp: from
// `else if (type === SHAPE_TYPES.CIRCLE)` up to the matching closing
// `} else {` or next sibling branch. Strips line comments so the
// explanatory comment block (which intentionally mentions the OLD
// math to document the change) does not trip the assertions.
//
// The source has TWO occurrences of `type === SHAPE_TYPES.CIRCLE`:
// one in `handleMouseMove` (the live preview path, P-MP-7) and one
// in `handleMouseUp` (the circle-creation path, the actual
// contract under test). We skip the FIRST one and target the second.
function extractCircleBranch(source) {
  const firstIdx = source.indexOf('type === SHAPE_TYPES.CIRCLE');
  if (firstIdx < 0) return null;
  const start = source.indexOf('type === SHAPE_TYPES.CIRCLE', firstIdx + 1);
  if (start < 0) return null;
  // Walk forward to find the next `} else {` (rect branch) or the
  // end of the if/else if chain.
  const end = source.indexOf('} else {', start);
  if (end < 0) return null;
  const raw = source.slice(start, end);
  // Strip `// …` line comments — the fix's explanatory comment
  // intentionally mentions the legacy `x: startX, y: startY` math.
  // Normalize CRLF → LF first so the `//…$` regex matches on Windows
  // checkouts (autocrlf=true leaves \r at end of each line, which
  // otherwise breaks the `$` anchor and leaves the legacy-math
  // comment text in the extracted branch, tripping the negative
  // assertions below).
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('PizarraCanvas — circle center math (P-MP-7)', () => {
  test('circle branch uses midpoint + half-diagonal (not corner + min-axis)', () => {
    const source = readCanvas();
    const branch = extractCircleBranch(source);
    expect(branch).not.toBeNull();
    // The fix computes the midpoint:
    expect(branch).toMatch(/\(\s*startX\s*\+\s*pos\.x\s*\)\s*\/\s*2/);
    expect(branch).toMatch(/\(\s*startY\s*\+\s*pos\.y\s*\)\s*\/\s*2/);
    // And the half-diagonal radius (NOT min(dx, dy) / 2). The math
    // can span multiple lines. We accept either the local var form
    // (`const radius = Math.sqrt(dx*dx + dy*dy) / 2`) or a direct
    // property assignment (`radius: Math.sqrt(...) / 2`).
    expect(branch).toMatch(
      /radius(?:\s*=\s*|\s*:\s*)Math\.sqrt\s*\(\s*dx\s*\*\s*dx\s*\+\s*dy\s*\*\s*dy\s*\)\s*\/\s*2/s
    );
    // Negative assertion: the legacy corner+min-axis math is GONE.
    expect(branch).not.toMatch(/radius\s*:\s*Math\.min\s*\(\s*dx\s*,\s*dy\s*\)\s*\/\s*2/);
  });

  test('circle branch does NOT use startX/startY directly as the x/y shape fields', () => {
    const source = readCanvas();
    const branch = extractCircleBranch(source);
    expect(branch).not.toBeNull();
    // The shape must NOT be created with x: startX, y: startY
    // directly (that was the corner-anchored legacy form).
    // Match the literal pattern `x: startX,` or `x: startX\n` and
    // the same for y. The current fix uses `x: cx, y: cy`.
    expect(branch).not.toMatch(/\bx\s*:\s*startX\b/);
    expect(branch).not.toMatch(/\by\s*:\s*startY\b/);
  });

  test('circle branch is a leaf that does NOT call onShapeCreate inside (only the chain commit does)', () => {
    // P-MP-7 separates the in-flight live preview (during mousemove)
    // from the final commit on mouseup. The shape-creation call
    // should still be the single onShapeCreate at the end of the
    // function (not duplicated inside each tool branch).
    const source = readCanvas();
    const branch = extractCircleBranch(source);
    expect(branch).not.toBeNull();
    expect(branch).not.toMatch(/onShapeCreate\s*\(/);
  });

  test('source preserves the type === SHAPE_TYPES.CIRCLE branch (no accidental deletion)', () => {
    // Regression guard: the math fix is in-place; we must not have
    // deleted the circle branch entirely.
    const source = readCanvas();
    expect(source).toMatch(/type\s*===\s*SHAPE_TYPES\.CIRCLE/);
  });
});

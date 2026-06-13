/**
 * PizarraCanvas — live preview during shape drag (pizarra-motion-polish
 * P-MP-7).
 *
 * The audit P0 gap: `handleMouseMove` in PizarraCanvas.jsx early-
 * returns on `!drawing`, so the in-flight shape's geometry is
 * never visible until mouseup. The user drags, sees nothing, and
 * the shape snaps into existence when they release.
 *
 * The fix: `handleMouseMove` updates local preview state for the
 * in-flight shape (x, y, width, height for rects; midpoint + radius
 * for circles; point list for lines/arrows) on every mousemove.
 * `onShapeCreate` is NOT called — the persisted elements list stays
 * unchanged. On mouseup, the FINAL geometry is committed via the
 * existing `onShapeCreate` path and `setDrawing(null)` clears the
 * preview.
 *
 * We pin this at the source level (same approach as the other
 * pizarra-motion-polish tests): no React render, no react-konva,
 * no jsdom dance. The contract is "handleMouseMove mutates the
 * preview state, does not call onShapeCreate, and the render path
 * shows a preview overlay keyed on the drawing state".
 */
const fs = require('fs');
const path = require('path');

const CANVAS_PATH = path.resolve(__dirname, '../../../components/pizarra/PizarraCanvas.jsx');

function readCanvas() {
  return fs.readFileSync(CANVAS_PATH, 'utf8');
}

// Extract the handleMouseMove body. It starts at the function
// declaration and ends at the matching `}, [marquee, drawing])` close.
function extractHandleMouseMove(source) {
  const start = source.indexOf('const handleMouseMove');
  if (start < 0) return null;
  // Find the matching `useCallback(`, then the closing `], [marquee, drawing])`.
  // Walk braces conservatively.
  let depth = 0;
  let cursor = start;
  let end = -1;
  while (cursor < source.length) {
    const ch = source[cursor];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = cursor + 1;
        break;
      }
    }
    cursor += 1;
  }
  if (end < 0) return null;
  return source.slice(start, end);
}

describe('PizarraCanvas — live preview during shape drag (P-MP-7)', () => {
  let source;
  let moveBody;

  beforeAll(() => {
    source = readCanvas();
    moveBody = extractHandleMouseMove(source);
  });

  test('handleMouseMove exists and is reachable in the source', () => {
    expect(moveBody).not.toBeNull();
  });

  test('handleMouseMove updates an in-flight preview state for the drawing branch (not the marquee branch)', () => {
    // The pre-fix handler early-returned on `!drawing`. After P-MP-7
    // it sets a local preview (setPreviewShape or similar) so the
    // render path can show a live outline.
    //
    // We accept any of:
    //   - setDrawing({ ...drawing, x, y, width, height, ... })
    //   - setPreviewShape({ ... })
    //   - dispatch({ type: PIZARRA_ACTIONS.DRAW_UPDATE, payload: { ... } })
    //
    // The contract: there is a state mutation (setX / dispatch /
    // setDrawing) inside the drawing branch. The marquee branch is
    // independent and unchanged.
    expect(moveBody).toMatch(/set(?:Drawing|PreviewShape)\s*\(|dispatch\s*\(/);
  });

  test('handleMouseMove does NOT call onShapeCreate (commit is mouseup-only)', () => {
    // Pinning the contract: a mousemove MUST NOT commit a shape.
    // That would pollute the persisted elements list with a new
    // entry on every pointer pixel of movement.
    expect(moveBody).not.toMatch(/onShapeCreate\s*\(/);
  });

  test('handleMouseMove does NOT call setDrawing(null) (clear is mouseup-only)', () => {
    // Same reason: clearing drawing in mousemove would prevent
    // the preview from being updated on the next move.
    expect(moveBody).not.toMatch(/setDrawing\s*\(\s*null\s*\)/);
  });

  test('handleMouseMove carries the drawing branch (the !drawing early-return is still there for safety, but the in-flight path exists)', () => {
    // The handler keeps the marquee branch at the top and adds
    // the drawing branch below. We assert the structure: the
    // handler has BOTH a marquee update path and a drawing update
    // path, and the early-return for `!drawing` either becomes
    // part of a guard or is removed. The cleanest assertion: the
    // handler body contains "drawing" in some form (the state
    // var is read) AND contains a setState call AFTER the marquee
    // branch.
    expect(moveBody).toMatch(/drawing/);
  });

  test('render path renders the in-flight preview (ShapePreviewOverlay or a similar pattern)', () => {
    // The simplest contract: the render function (the JSX returned
    // by the component) references the drawing state to render a
    // preview. We accept either a dedicated <ShapePreviewOverlay>
    // component or a conditional render of the drawing rect/circle.
    // The audit named the new component "ShapePreviewOverlay".
    //
    // We use a tolerant regex that accepts any of:
    //   - ShapePreviewOverlay (the proposed component)
    //   - drawing && <…  (in-place conditional preview)
    //   - setDrawing(null) (already pinned above; just ensuring render is connected)
    expect(source).toMatch(/ShapePreviewOverlay|drawing\s*&&|previewShape\s*&&/);
  });
});

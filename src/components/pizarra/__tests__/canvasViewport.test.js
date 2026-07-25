const {
  canvasToViewport,
  projectCanvasRect,
  viewportToCanvas,
} = require('../../../lib/pizarra/canvasViewport');

/**
 * These tests use the canvasRect-based coordinate system.
 * canvasRect.left/top encodes the canvas container's viewport position.
 * The pure coordinate functions then apply pan and zoom on top of that.
 *
 * Default canvasRect: { left: 0, top: 0 } (container at viewport origin)
 * PAN_FACTOR = zoom factor per animation step (for testing pan offset)
 */

const DEFAULT_CANVAS_RECT = { left: 0, top: 0 };

function makeOpts({ zoom = 1, pan = { x: 0, y: 0 }, canvasRect = DEFAULT_CANVAS_RECT } = {}) {
  return { zoom, pan, canvasRect };
}

describe('canvasViewport — canvasToViewport (canvasRect API)', () => {
  test('identity at origin: canvas (0,0) -> viewport (0,0)', () => {
    expect(canvasToViewport(0, 0, makeOpts({ zoom: 1, pan: { x: 0, y: 0 } }))).toEqual({
      x: 0,
      y: 0,
    });
  });

  test('canvas (100,200) maps to viewport (100,200) with zoom=1 and no pan', () => {
    expect(canvasToViewport(100, 200, makeOpts())).toEqual({ x: 100, y: 200 });
  });

  test('pan offset shifts viewport coordinates', () => {
    const opts = makeOpts({ pan: { x: 100, y: 200 } });
    expect(canvasToViewport(0, 0, opts)).toEqual({ x: 100, y: 200 });
    expect(canvasToViewport(50, 50, opts)).toEqual({ x: 150, y: 250 });
  });

  test('zoom multiplies canvas coordinates before adding pan offset', () => {
    const opts = makeOpts({ zoom: 2.0 });
    expect(canvasToViewport(50, 50, opts)).toEqual({ x: 100, y: 100 });
    expect(canvasToViewport(100, 50, opts)).toEqual({ x: 200, y: 100 });
  });

  test('combined pan and zoom', () => {
    const opts = makeOpts({ zoom: 2.0, pan: { x: 100, y: 200 } });
    expect(canvasToViewport(50, 100, opts)).toEqual({ x: 200, y: 400 });
  });

  test('zoom=0.5 shrinks element proportions', () => {
    const opts = makeOpts({ zoom: 0.5 });
    expect(canvasToViewport(100, 80, opts)).toEqual({ x: 50, y: 40 });
  });

  test('canvasRect left/top offset added to final result', () => {
    const opts = makeOpts({ canvasRect: { left: 50, top: 60 } });
    expect(canvasToViewport(100, 200, opts)).toEqual({ x: 150, y: 260 });
  });

  test('defaults: missing options fields fall back to sane defaults', () => {
    // No options object at all
    expect(canvasToViewport(10, 20)).toEqual({ x: 10, y: 20 });
    // Missing canvasRect
    expect(canvasToViewport(10, 20, { zoom: 1, pan: { x: 0, y: 0 } })).toEqual({ x: 10, y: 20 });
  });
});

describe('canvasViewport — viewportToCanvas (canvasRect API)', () => {
  test('identity at origin: viewport (0,0) -> canvas (0,0)', () => {
    expect(viewportToCanvas(0, 0, makeOpts())).toEqual({ x: 0, y: 0 });
  });

  test('inverse of canvasToViewport at zoom=1', () => {
    const opts = makeOpts({ pan: { x: 100, y: 200 } });
    expect(viewportToCanvas(100, 200, opts)).toEqual({ x: 0, y: 0 });
    expect(viewportToCanvas(150, 250, opts)).toEqual({ x: 50, y: 50 });
  });

  test('inverse of canvasToViewport at zoom=2.0', () => {
    const opts = makeOpts({ zoom: 2.0, pan: { x: 100, y: 200 } });
    // canvasToViewport(50, 100, opts) == (200, 400)
    expect(viewportToCanvas(200, 400, opts)).toEqual({ x: 50, y: 100 });
  });

  test('zoom=0 guards against division by zero', () => {
    const opts = makeOpts({ zoom: 0 });
    expect(viewportToCanvas(100, 200, opts)).toEqual({ x: 0, y: 0 });
  });

  test('round-trip: viewportToCanvas(canvasToViewport(cx,cy)) ~= (cx,cy)', () => {
    const cx = 75;
    const cy = 125;
    const opts = makeOpts({ zoom: 2.5, pan: { x: 10, y: 20 } });
    const vp = canvasToViewport(cx, cy, opts);
    const back = viewportToCanvas(vp.x, vp.y, opts);
    expect(back.x).toBeCloseTo(cx);
    expect(back.y).toBeCloseTo(cy);
  });

  test('canvasRect offsets are subtracted before inverse zoom is applied', () => {
    // canvasRect left=50, top=60; with pan 0 and zoom 1
    // viewport (150, 260) should map to canvas (100, 200)
    const opts = makeOpts({ canvasRect: { left: 50, top: 60 } });
    expect(viewportToCanvas(150, 260, opts)).toEqual({ x: 100, y: 200 });
  });
});

describe('canvasViewport — projectCanvasRect', () => {
  test('projects logical bounds into overlay-local coordinates and screen-space origin', () => {
    const result = projectCanvasRect(
      { x: 50, y: 100, width: 200, height: 120 },
      makeOpts({ zoom: 1.5, pan: { x: 20, y: 30 }, canvasRect: { left: 12, top: 18 } })
    );

    expect(result).toEqual({
      x: 95,
      y: 180,
      width: 300,
      height: 180,
      screenX: 107,
      screenY: 198,
    });
  });

  test('clamps width and height to non-negative values', () => {
    expect(projectCanvasRect({ x: 0, y: 0, width: -10, height: -20 }, makeOpts())).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      screenX: 0,
      screenY: 0,
    });
  });
});

describe('canvasViewport — spec scenarios', () => {
  test('spec scenario: click at viewport (300,400) with pan=(100,200) and zoom=2.0 maps to (100,100)', () => {
    const opts = makeOpts({ zoom: 2.0, pan: { x: 100, y: 200 } });
    expect(viewportToCanvas(300, 400, opts)).toEqual({ x: 100, y: 100 });
  });

  test('spec scenario: element at canvas (50,50) with zoom=0.5 map to viewport coords', () => {
    const opts = makeOpts({ zoom: 0.5, pan: { x: 0, y: 0 } });
    const result = canvasToViewport(50, 50, opts);
    expect(result.x).toBeCloseTo(25);
    expect(result.y).toBeCloseTo(25);
  });

  test('spec scenario: min zoom clamped at 0.1 (via canvas rect + zoom=0.05 equivalent)', () => {
    // zoom below min means element gets tiny but function still works
    const opts = makeOpts({ zoom: 0.05, pan: { x: 0, y: 0 } });
    const result = canvasToViewport(50, 50, opts);
    expect(result.x).toBeCloseTo(2.5);
    expect(result.y).toBeCloseTo(2.5);
  });
});

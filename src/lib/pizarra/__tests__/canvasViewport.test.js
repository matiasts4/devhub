import {
  canvasToViewport,
  viewportToCanvas,
  zoomAtPoint,
} from '../canvasViewport';

// Minimal DOMRect-like object for test factories
function makeRect({ left = 0, top = 0, width = 800, height = 600 } = {}) {
  return { left, top, width, height };
}

describe('canvasToViewport', () => {
  describe('spec scenario: canvas to viewport translation', () => {
    it('translates canvas logical (100,200) at zoom=0.5, pan={x:50,y:30}, rect=(200,100)', () => {
      const canvasRect = makeRect({ left: 200, top: 100 });
      const result = canvasToViewport(100, 200, {
        zoom: 0.5,
        pan: { x: 50, y: 30 },
        canvasRect,
      });
      // viewportX = 200 + 50 + (100 * 0.5) = 300
      // viewportY = 100 + 30 + (200 * 0.5) = 230
      expect(result.x).toBe(300);
      expect(result.y).toBe(230);
    });
  });

  it('returns identity at zoom=1.0 with zero pan and zero rect', () => {
    const result = canvasToViewport(100, 200, {
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasRect: makeRect({ left: 0, top: 0 }),
    });
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('returns identity at zoom=1.0 (default) with nullish pan/rect', () => {
    const result = canvasToViewport(50, 75, {});
    expect(result.x).toBe(50);
    expect(result.y).toBe(75);
  });

  it('scales at zoom=2.0 with positive rect offset', () => {
    const canvasRect = makeRect({ left: 100, top: 50 });
    const result = canvasToViewport(100, 200, {
      zoom: 2,
      pan: { x: 0, y: 0 },
      canvasRect,
    });
    expect(result.x).toBe(100 + 0 + 100 * 2); // 300
    expect(result.y).toBe(50 + 0 + 200 * 2); // 450
  });

  it('handles negative zoom input gracefully (defaults to 1)', () => {
    const result = canvasToViewport(10, 20, { zoom: -1 });
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it('handles undefined individual pan axes', () => {
    const result = canvasToViewport(5, 10, { zoom: 1, pan: { x: 0 }, canvasRect: makeRect({ left: 0, top: 0 }) });
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('handles zero zoom by clamping to default of 1', () => {
    const canvasRect = makeRect({ left: 50, top: 50 });
    const result = canvasToViewport(100, 200, {
      zoom: 0,
      pan: { x: 0, y: 0 },
      canvasRect,
    });
    // zoom=0 is clamped to default of 1 → left + 0 + 100*1 = 150
    expect(result.x).toBe(150);
    expect(result.y).toBe(250);
  });
});

describe('viewportToCanvas', () => {
  describe('spec scenario: viewport to canvas translation', () => {
    it('translates viewport (350,400) at zoom=0.5, pan={x:50,y:30}, rect=(200,100)', () => {
      const canvasRect = makeRect({ left: 200, top: 100 });
      const result = viewportToCanvas(350, 400, {
        zoom: 0.5,
        pan: { x: 50, y: 30 },
        canvasRect,
      });
      // canvasX = (350 - 200 - 50) / 0.5 = 100 / 0.5 = 200
      // canvasY = (400 - 100 - 30) / 0.5 = 270 / 0.5 = 540
      expect(result.x).toBe(200);
      expect(result.y).toBe(540);
    });
  });

  it('returns identity at zoom=1.0 with zero pan and zero rect', () => {
    const result = viewportToCanvas(100, 200, {
      zoom: 1,
      pan: { x: 0, y: 0 },
      canvasRect: makeRect({ left: 0, top: 0 }),
    });
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('returns identity at zoom=1.0 (default) with nullish pan/rect', () => {
    const result = viewportToCanvas(50, 75, {});
    expect(result.x).toBe(50);
    expect(result.y).toBe(75);
  });

  it('inverts canvasToViewport at zoom=1.0', () => {
    const opts = { zoom: 1, pan: { x: 0, y: 0 }, canvasRect: makeRect({ left: 0, top: 0 }) };
    const original = canvasToViewport(100, 200, opts);
    const roundTrip = viewportToCanvas(original.x, original.y, opts);
    expect(roundTrip.x).toBe(100);
    expect(roundTrip.y).toBe(200);
  });

  it('inverts canvasToViewport at zoom=0.5', () => {
    const opts = { zoom: 0.5, pan: { x: 50, y: 30 }, canvasRect: makeRect({ left: 200, top: 100 }) };
    const original = canvasToViewport(100, 200, opts);
    const roundTrip = viewportToCanvas(original.x, original.y, opts);
    expect(roundTrip.x).toBe(100);
    expect(roundTrip.y).toBe(200);
  });

  it('handles undefined individual pan axes', () => {
    const result = viewportToCanvas(5, 10, { zoom: 1, pan: { y: 0 }, canvasRect: makeRect({ left: 0, top: 0 }) });
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('guards against division by zero at zoom=0 by returning (0,0)', () => {
    const canvasRect = makeRect({ left: 50, top: 50 });
    const result = viewportToCanvas(100, 200, {
      zoom: 0,
      pan: { x: 0, y: 0 },
      canvasRect,
    });
    // Guard in viewportToCanvas: if z===0 return {x:0, y:0} to avoid Infinity/NaN
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe('zoomAtPoint', () => {
  it('keeps the focal canvas point fixed when zooming in', () => {
    const before = { zoom: 1, pan: { x: 0, y: 0 } };
    const focalX = 400;
    const focalY = 300;
    const result = zoomAtPoint({
      currentZoom: before.zoom,
      currentPan: before.pan,
      deltaY: -80,
      focalX,
      focalY,
    });

    const canvasX = (focalX - before.pan.x) / before.zoom;
    const canvasY = (focalY - before.pan.y) / before.zoom;
    const projectedX = result.pan.x + canvasX * result.zoom;
    const projectedY = result.pan.y + canvasY * result.zoom;

    expect(result.zoom).toBeCloseTo(1.08, 5);
    expect(projectedX).toBeCloseTo(focalX, 5);
    expect(projectedY).toBeCloseTo(focalY, 5);
  });

  it('clamps zoom to configured bounds', () => {
    const zoomedOut = zoomAtPoint({
      currentZoom: 0.11,
      currentPan: { x: 0, y: 0 },
      deltaY: 200,
      focalX: 100,
      focalY: 100,
    });
    expect(zoomedOut.zoom).toBe(0.1);

    const zoomedIn = zoomAtPoint({
      currentZoom: 4.95,
      currentPan: { x: 0, y: 0 },
      deltaY: -200,
      focalX: 100,
      focalY: 100,
    });
    expect(zoomedIn.zoom).toBe(5);
  });
});

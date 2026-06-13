import {
  clampElementPosition,
  clampElementRect,
  clampPanToContent,
  computeElementsBounds,
  computeLayoutZones,
  computeViewportFitToBounds,
  detectZoneAtPoint,
  getPreferredZoneForType,
  getVisibleCanvasBounds,
  isLayoutPlacementPlaceholder,
  resolveFitBoundsForView,
  resolveZoneSnap,
} from '../canvasBounds';

describe('canvasBounds', () => {
  const bounds = { x: 0, y: 0, width: 1000, height: 700 };

  test('getVisibleCanvasBounds accounts for pan and zoom', () => {
    expect(
      getVisibleCanvasBounds({
        canvasWidth: 800,
        canvasHeight: 600,
        zoom: 2,
        pan: { x: -100, y: -50 },
      })
    ).toEqual({ x: 50, y: 25, width: 400, height: 300 });
  });

  test('clampElementPosition keeps card inside visible area', () => {
    const clamped = clampElementPosition(
      { x: -900, y: -700, width: 640, height: 400 },
      bounds
    );
    expect(clamped.x).toBeGreaterThan(-900);
    expect(clamped.y).toBeGreaterThan(-700);
    expect(clamped.x + 640).toBeGreaterThan(bounds.x);
    expect(clamped.y + 400).toBeGreaterThan(bounds.y);
  });

  test('clampElementRect limits oversized resize', () => {
    const clamped = clampElementRect(
      { x: 0, y: 0, width: 2000, height: 1200 },
      bounds
    );
    expect(clamped.width).toBeLessThanOrEqual(bounds.width);
    expect(clamped.height).toBeLessThanOrEqual(bounds.height);
  });

  test('clampPanToContent prevents panning content completely off-screen', () => {
    const clamped = clampPanToContent({
      pan: { x: 5000, y: 5000 },
      zoom: 1,
      canvasWidth: 800,
      canvasHeight: 600,
      contentBounds: { x: 100, y: 100, width: 400, height: 300 },
    });
    expect(clamped.x).toBeLessThan(5000);
    expect(clamped.y).toBeLessThan(5000);
  });

  test('computeLayoutZones returns left/right split areas', () => {
    const zones = computeLayoutZones(bounds);
    expect(zones.left.x).toBeLessThan(zones.right.x);
    expect(zones.left.width).toBeGreaterThan(0);
    expect(zones.right.width).toBeGreaterThan(0);
    expect(zones.splitLine).toBeCloseTo(bounds.x + bounds.width / 2);
  });

  test('resolveZoneSnap fills zone by pointer position not surface type', () => {
    const zones = computeLayoutZones(bounds);
    const card = { x: 520, y: 200, width: 280, height: 200 };
    const snap = resolveZoneSnap(card, zones);
    const cx = card.x + card.width / 2;
    const cy = card.y + card.height / 2;
    expect(snap).not.toBeNull();
    expect(snap.zone).toBe(detectZoneAtPoint(cx, cy, zones));
    expect(snap.width).toBeGreaterThan(200);
    expect(snap.height).toBeGreaterThan(150);
  });

  test('getPreferredZoneForType is position-neutral (center for all)', () => {
    expect(getPreferredZoneForType('browser')).toBe('center');
    expect(getPreferredZoneForType('terminal')).toBe('center');
  });

  test('detectZoneAtPoint returns zone name for center point', () => {
    const zones = computeLayoutZones(bounds);
    const cx = zones.right.x + zones.right.width / 2;
    const cy = zones.right.y + zones.right.height / 2;
    expect(detectZoneAtPoint(cx, cy, zones)).toBe('right');
  });

  test('isLayoutPlacementPlaceholder flags off-screen provisional surfaces', () => {
    expect(isLayoutPlacementPlaceholder({ x: -10000, y: -10000, _layoutResolved: false })).toBe(
      true
    );
    expect(isLayoutPlacementPlaceholder({ x: 120, y: 80, width: 640, height: 400 })).toBe(false);
  });

  test('computeElementsBounds ignores off-screen placeholders', () => {
    const bbox = computeElementsBounds([
      { x: 200, y: 100, width: 640, height: 400 },
      { x: -10000, y: -10000, width: 640, height: 400, _layoutResolved: false },
    ]);
    expect(bbox.x).toBeGreaterThan(150);
    expect(bbox.width).toBeLessThan(800);
  });

  test('computeViewportFitToBounds does not floor to 12% for normal view bounds', () => {
    const { zoom } = computeViewportFitToBounds(
      { x: 0, y: 0, width: 1680, height: 960 },
      1400,
      900,
      { padding: 24, maxZoom: 1.25 }
    );
    expect(zoom).toBeGreaterThan(0.5);
    expect(zoom).toBeLessThanOrEqual(1.25);
  });

  test('resolveFitBoundsForView rejects outlier layout bounds', () => {
    const viewBounds = { x: 0, y: 0, width: 1680, height: 960 };
    const outlier = { x: -500, y: 0, width: 12000, height: 960 };
    expect(resolveFitBoundsForView(outlier, viewBounds)).toEqual(viewBounds);
    expect(resolveFitBoundsForView({ x: 10, y: 10, width: 800, height: 600 }, viewBounds)).toEqual({
      x: 10,
      y: 10,
      width: 800,
      height: 600,
    });
  });
});
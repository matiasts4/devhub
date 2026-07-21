const {
  normalizeBounds,
  clampBoundsToContent,
  boundsEqual,
  defaultSpikeBounds,
} = require('../../../../desktop/electron/browser/bounds');
const {
  normalizeAvoidRects,
  applyAvoidRects,
  subtractRect,
  rectArea,
} = require('../../../../desktop/electron/browser/avoidRects');

describe('electron browser bounds', () => {
  test('normalizeBounds rounds and floors negatives on size', () => {
    expect(normalizeBounds({ x: 1.2, y: 3.8, width: 10.4, height: -2 })).toEqual({
      x: 1,
      y: 4,
      width: 10,
      height: 0,
    });
  });

  test('normalizeBounds returns null for invalid input', () => {
    expect(normalizeBounds(null)).toBeNull();
    expect(normalizeBounds(undefined)).toBeNull();
  });

  test('clampBoundsToContent keeps rect inside window', () => {
    const clamped = clampBoundsToContent(
      { x: 1000, y: 800, width: 500, height: 400 },
      { width: 1200, height: 900 }
    );
    expect(clamped).toEqual({ x: 700, y: 800, width: 500, height: 100 });
  });

  test('boundsEqual', () => {
    const a = { x: 1, y: 2, width: 3, height: 4 };
    expect(boundsEqual(a, { ...a })).toBe(true);
    expect(boundsEqual(a, { ...a, x: 0 })).toBe(false);
  });

  test('defaultSpikeBounds is positive', () => {
    const b = defaultSpikeBounds();
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThan(0);
  });
});

describe('electron browser avoidRects', () => {
  test('normalizeAvoidRects drops zero-area', () => {
    expect(
      normalizeAvoidRects([
        { x: 0, y: 0, width: 0, height: 10 },
        { x: 1, y: 2, width: 3, height: 4, source: 'modal' },
      ])
    ).toEqual([{ x: 1, y: 2, width: 3, height: 4, source: 'modal' }]);
  });

  test('applyAvoidRects with no avoids returns original', () => {
    const bounds = { x: 100, y: 100, width: 400, height: 300 };
    const result = applyAvoidRects(bounds, []);
    expect(result.hide).toBe(false);
    expect(result.effectiveBounds).toEqual(bounds);
    expect(result.areaRatio).toBe(1);
  });

  test('applyAvoidRects shrinks to largest free region (avoid top strip)', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 200 };
    // Avoid covers top half → largest free is bottom half
    const result = applyAvoidRects(bounds, [{ x: 0, y: 0, width: 200, height: 100 }]);
    expect(result.hide).toBe(false);
    expect(result.effectiveBounds).toEqual({ x: 0, y: 100, width: 200, height: 100 });
    expect(result.areaRatio).toBeCloseTo(0.5);
  });

  test('applyAvoidRects hides when avoid covers most of panel', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 200 };
    const result = applyAvoidRects(bounds, [{ x: 0, y: 0, width: 200, height: 190 }]);
    expect(result.hide).toBe(true);
    expect(result.areaRatio).toBeLessThan(0.2);
  });

  test('subtractRect yields non-overlapping residuals', () => {
    const free = { x: 0, y: 0, width: 100, height: 100 };
    const avoid = { x: 25, y: 25, width: 50, height: 50 };
    const parts = subtractRect(free, avoid);
    const total = parts.reduce((sum, p) => sum + rectArea(p), 0);
    // Area of free minus avoid = 10000 - 2500 = 7500
    expect(total).toBe(7500);
  });
});

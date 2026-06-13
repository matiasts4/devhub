import {
  BROWSER_ZONE_RATIO,
  computeAdaptiveVisibleLayout,
  computeViewDevSplitSlots,
  computeViewZones,
  fitSurfaceToViewZone,
  getCameraPanForView,
  getSurfaceViewId,
  getViewIndex,
  getViewWorldOrigin,
  getWorldBoundsForViewCount,
  surfaceBelongsToView,
  VIEW_WORLD_GAP,
  VIEW_WORLD_HEIGHT,
  VIEW_WORLD_WIDTH,
} from '../pizarraViewLayout';

describe('pizarraViewLayout', () => {
  test('getViewWorldOrigin spaces views horizontally', () => {
    expect(getViewWorldOrigin(0)).toEqual({ x: 0, y: 0 });
    expect(getViewWorldOrigin(1)).toEqual({
      x: VIEW_WORLD_WIDTH + VIEW_WORLD_GAP,
      y: 0,
    });
  });

  test('computeViewZones uses fixed 62/38 browser/terminal split', () => {
    const zones = computeViewZones({ x: 0, y: 0 });
    const splitRatio = zones.left.width / (zones.left.width + zones.right.width);
    expect(splitRatio).toBeCloseTo(BROWSER_ZONE_RATIO, 1);
    expect(zones.bounds).toEqual({
      x: 0,
      y: 0,
      width: VIEW_WORLD_WIDTH,
      height: VIEW_WORLD_HEIGHT,
    });
  });

  test('getCameraPanForView centers view in viewport', () => {
    const pan = getCameraPanForView({ x: 0, y: 0 }, 800, 600, 1);
    expect(pan.x).toBe(800 / 2 - VIEW_WORLD_WIDTH / 2);
    expect(pan.y).toBe(600 / 2 - VIEW_WORLD_HEIGHT / 2);
  });

  test('fitSurfaceToViewZone pads inside zone', () => {
    const zone = { x: 100, y: 50, width: 900, height: 500 };
    const fitted = fitSurfaceToViewZone(zone, 'browser');
    expect(fitted.x).toBeGreaterThan(zone.x);
    expect(fitted.width).toBeLessThan(zone.width);
    expect(fitted.height).toBeLessThan(zone.height);
  });

  test('surface view membership respects pizarra.viewId', () => {
    const views = [{ id: 'v1' }, { id: 'v2' }];
    const surface = { pizarra: { viewId: 'v2' } };
    expect(getSurfaceViewId(surface, views, 'v1')).toBe('v2');
    expect(surfaceBelongsToView(surface, 'v2', views)).toBe(true);
    expect(surfaceBelongsToView(surface, 'v1', views)).toBe(false);
  });

  test('getSurfaceViewId returns null without stored viewId or fallback', () => {
    const views = [{ id: 'v1' }, { id: 'v2' }];
    expect(getSurfaceViewId({ pizarra: {} }, views)).toBeNull();
    expect(surfaceBelongsToView({ pizarra: {} }, 'v1', views)).toBe(false);
    expect(getSurfaceViewId({ pizarra: {} }, views, 'v2')).toBe('v2');
  });

  test('computeViewDevSplitSlots fills left/right zones', () => {
    const slots = computeViewDevSplitSlots({ x: 0, y: 0 });
    const zones = computeViewZones({ x: 0, y: 0 });
    expect(slots.browser.x).toBeGreaterThanOrEqual(zones.left.x);
    expect(slots.terminals[0].x).toBeGreaterThanOrEqual(zones.right.x);
  });

  test('getWorldBoundsForViewCount spans multiple views', () => {
    expect(getWorldBoundsForViewCount(2).width).toBe(VIEW_WORLD_WIDTH * 2 + VIEW_WORLD_GAP);
  });

  test('getViewIndex resolves view id', () => {
    const views = [{ id: 'v1' }, { id: 'v2' }];
    expect(getViewIndex('v2', views)).toBe(1);
    expect(getViewIndex('missing', views)).toBe(0);
  });

  test('computeAdaptiveVisibleLayout fills the visible viewport region', () => {
    const vis = { x: 100, y: 50, width: 1200, height: 800 };
    const surfaces = [
      { id: 'b1', type: 'browser', pizarra: { visible: true } },
      { id: 't1', type: 'terminal', pizarra: { visible: true } },
      { id: 't2', type: 'terminal', pizarra: { visible: true } },
    ];
    const { layouts } = computeAdaptiveVisibleLayout(vis, surfaces);
    expect(layouts).toHaveLength(3);
    for (const layout of layouts) {
      expect(layout.x).toBeGreaterThanOrEqual(vis.x);
      expect(layout.y).toBeGreaterThanOrEqual(vis.y);
      expect(layout.x + layout.width).toBeLessThanOrEqual(vis.x + vis.width + 4);
      expect(layout.y + layout.height).toBeLessThanOrEqual(vis.y + vis.height + 4);
    }
  });
});
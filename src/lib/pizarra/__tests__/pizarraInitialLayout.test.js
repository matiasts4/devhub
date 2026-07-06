import {
  computeAutoFitSlotMap,
  isSurfacePositioned,
  isLiveElementPositioned,
  resolveSurfaceRenderBounds,
  resolveRegistrySurfacesBoundsByView,
} from '../pizarraInitialLayout';

describe('pizarraInitialLayout', () => {
  const vis = { x: 0, y: 0, width: 1200, height: 800 };

  test('isSurfacePositioned requires numeric x and y', () => {
    expect(isSurfacePositioned({ x: 10, y: 20 })).toBe(true);
    expect(isSurfacePositioned({ x: null, y: 20 })).toBe(false);
    expect(isSurfacePositioned({})).toBe(false);
  });

  test('isLiveElementPositioned accepts pizarra or root coords', () => {
    expect(isLiveElementPositioned({ pizarra: { x: 1, y: 2 } })).toBe(true);
    expect(isLiveElementPositioned({ x: 3, y: 4 })).toBe(true);
    expect(isLiveElementPositioned({ pizarra: { x: null, y: null } })).toBe(false);
  });

  test('computeAutoFitSlotMap distributes 3 terminals side by side', () => {
    const surfaces = [
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
      { id: 't3', type: 'terminal' },
    ];
    const map = computeAutoFitSlotMap(vis, surfaces);
    expect(map.size).toBe(3);
    const positions = [...map.values()];
    const xs = positions.map((p) => p.x);
    expect(new Set(xs).size).toBe(3);
  });

  test('resolveRegistrySurfacesBoundsByView places V2 surfaces in V2 world origin', () => {
    const views = [{ id: 'v1' }, { id: 'v2' }];
    const surfaces = [
      {
        id: 't2',
        type: 'terminal',
        pizarra: { viewId: 'v2', x: null, y: null, width: 640, height: 400 },
      },
    ];
    const resolved = resolveRegistrySurfacesBoundsByView(surfaces, views, 'v1');
    expect(resolved[0].x).toBeGreaterThan(1500);
  });

  test('resolveSurfaceRenderBounds does not stack unpositioned surfaces at (100,100)', () => {
    const surfaces = [
      { id: 't1', type: 'terminal', pizarra: { x: null, y: null, width: 640, height: 400 } },
      { id: 't2', type: 'terminal', pizarra: { x: null, y: null, width: 640, height: 400 } },
      { id: 't3', type: 'terminal', pizarra: { x: null, y: null, width: 640, height: 400 } },
    ];
    const resolved = resolveSurfaceRenderBounds(surfaces, vis);
    const xs = resolved.map((s) => s.x);
    expect(xs.every((x) => x !== 100)).toBe(true);
    expect(new Set(xs).size).toBe(3);
    expect(resolved.every((s) => s._layoutResolved === true)).toBe(true);
  });
});

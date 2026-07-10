/**
 * pizarraClipboard — Phase 2 session clipboard contracts.
 *
 * Covers: round-trip serialization (id stripped, points copied),
 * singleton storage semantics, surface stubbing, and the pure
 * buildPastedShapes reconstruction (fresh ids, +offset, zIndex stack,
 * surface skip).
 */

const {
  copyPizarra,
  readPizarra,
  clearPizarra,
  hasPizarraClipboard,
  buildPastedShapes,
  buildPastedSurfaces,
  clipboardShapesOrigin,
} = require('@/lib/pizarra/pizarraClipboard');
const { createShape, SHAPE_TYPES } = require('@/lib/pizarra/shapeModel');

describe('pizarraClipboard — singleton storage', () => {
  beforeEach(() => clearPizarra());

  test('copyPizarra then readPizarra round-trips shape data without id', () => {
    const s = createShape(SHAPE_TYPES.RECT, { x: 10, y: 20, width: 30, height: 40 });
    copyPizarra([s]);
    const items = readPizarra();
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('shape');
    expect(items[0].data.id).toBeUndefined();
    expect(items[0].data.x).toBe(10);
    expect(items[0].data.y).toBe(20);
    expect(items[0].data.type).toBe(SHAPE_TYPES.RECT);
  });

  test('hasPizarraClipboard reflects state; clearPizarra empties', () => {
    expect(hasPizarraClipboard()).toBe(false);
    copyPizarra([createShape(SHAPE_TYPES.RECT, { x: 0, y: 0 })]);
    expect(hasPizarraClipboard()).toBe(true);
    clearPizarra();
    expect(hasPizarraClipboard()).toBe(false);
    expect(readPizarra()).toEqual([]);
  });

  test('readPizarra returns a new array (callers cannot mutate the store)', () => {
    copyPizarra([createShape(SHAPE_TYPES.RECT, { x: 0, y: 0 })]);
    const a = readPizarra();
    a.push({ kind: 'shape', data: { type: 'rect' } });
    // Mutating the returned array must not affect the singleton.
    expect(readPizarra()).toHaveLength(1);
  });

  test('points array is copied, not aliased to the original', () => {
    const line = createShape(SHAPE_TYPES.LINE, { points: [0, 0, 50, 60] });
    copyPizarra([line]);
    const [item] = readPizarra();
    expect(item.data.points).toEqual([0, 0, 50, 60]);
    // Mutating the stored points must not touch the original shape.
    item.data.points[0] = 999;
    expect(line.points[0]).toBe(0);
  });

  test('mixed selection serializes shapes and surface stubs (no runtime)', () => {
    const rect = createShape(SHAPE_TYPES.RECT, { x: 1, y: 2 });
    const term = {
      type: SHAPE_TYPES.TERMINAL,
      panelId: 'live-panel-7',
      pizarra: { x: 5, y: 5 },
      label: 't',
    };
    copyPizarra([rect, term]);
    const items = readPizarra();
    expect(items).toHaveLength(2);
    const surfaceItem = items.find((it) => it.kind === 'surface');
    expect(surfaceItem).toBeDefined();
    // The live panelId must NOT be captured — only metadata.
    expect(JSON.stringify(surfaceItem.data)).not.toContain('live-panel-7');
    expect(surfaceItem.data.type).toBe(SHAPE_TYPES.TERMINAL);
  });
});

describe('pizarraClipboard — clipboardShapesOrigin', () => {
  beforeEach(() => clearPizarra());

  test('returns the min (x, y) of the shape items', () => {
    copyPizarra([
      createShape(SHAPE_TYPES.RECT, { x: 100, y: 50 }),
      createShape(SHAPE_TYPES.RECT, { x: 30, y: 200 }),
      createShape(SHAPE_TYPES.RECT, { x: 250, y: 10 }),
    ]);
    const origin = clipboardShapesOrigin(readPizarra());
    expect(origin).toEqual({ x: 30, y: 10 });
  });

  test('ignores surface items when computing the origin', () => {
    copyPizarra([
      createShape(SHAPE_TYPES.RECT, { x: 80, y: 90 }),
      { type: SHAPE_TYPES.TERMINAL, pizarra: { x: 5, y: 5 } },
    ]);
    const origin = clipboardShapesOrigin(readPizarra());
    expect(origin).toEqual({ x: 80, y: 90 });
  });

  test('empty clipboard returns (0, 0)', () => {
    expect(clipboardShapesOrigin([])).toEqual({ x: 0, y: 0 });
    expect(clipboardShapesOrigin(undefined)).toEqual({ x: 0, y: 0 });
  });
});

describe('pizarraClipboard — buildPastedShapes', () => {
  beforeEach(() => clearPizarra());

  test('mints fresh ids, applies +20 offset, stacks zIndex above maxZ', () => {
    const orig = createShape(SHAPE_TYPES.RECT, { x: 100, y: 100, zIndex: 2 });
    copyPizarra([orig]);
    const items = readPizarra();
    const pasted = buildPastedShapes(items, 2);
    expect(pasted).toHaveLength(1);
    expect(pasted[0].id).not.toBe(orig.id);
    expect(pasted[0].x).toBe(120);
    expect(pasted[0].y).toBe(120);
    expect(pasted[0].zIndex).toBe(3);
  });

  test('multiple items get incrementing zIndex starting at maxZ+1', () => {
    const a = createShape(SHAPE_TYPES.RECT, { x: 0, y: 0 });
    const b = createShape(SHAPE_TYPES.CIRCLE, { x: 10, y: 10 });
    copyPizarra([a, b]);
    const pasted = buildPastedShapes(readPizarra(), 5);
    expect(pasted).toHaveLength(2);
    expect(pasted[0].zIndex).toBe(6);
    expect(pasted[1].zIndex).toBe(7);
    expect(pasted.map((s) => s.id)).not.toContain(a.id);
    expect(pasted.map((s) => s.id)).not.toContain(b.id);
  });

  test('respects a custom offset delta (e.g. paste-here at a click point)', () => {
    const orig = createShape(SHAPE_TYPES.RECT, { x: 50, y: 60 });
    copyPizarra([orig]);
    const pasted = buildPastedShapes(readPizarra(), 0, { x: 300, y: 200 });
    // offset is a delta added to the original position (Phase 3 paste-here
    // will compute the delta from the click point and the clipboard bounds).
    expect(pasted[0].x).toBe(350);
    expect(pasted[0].y).toBe(260);
  });

  test('skips surface items (Phase 2 reconstructs shapes only)', () => {
    const rect = createShape(SHAPE_TYPES.RECT, { x: 0, y: 0 });
    const term = { type: SHAPE_TYPES.TERMINAL, pizarra: { x: 0, y: 0 } };
    copyPizarra([rect, term]);
    const pasted = buildPastedShapes(readPizarra(), 0);
    expect(pasted).toHaveLength(1);
    expect(pasted[0].type).toBe(SHAPE_TYPES.RECT);
  });

  test('empty/nullish items returns empty array (defensive)', () => {
    expect(buildPastedShapes([], 0)).toEqual([]);
    expect(buildPastedShapes(undefined, 0)).toEqual([]);
    expect(buildPastedShapes(null, 0)).toEqual([]);
  });

  test('points are reconstructed as a fresh array on paste', () => {
    const line = createShape(SHAPE_TYPES.LINE, { points: [1, 2, 3, 4] });
    copyPizarra([line]);
    const [pasted] = buildPastedShapes(readPizarra(), 0);
    expect(pasted.points).toEqual([1, 2, 3, 4]);
    pasted.points[0] = 999;
    // The stored item's points are not aliased to the pasted copy.
    expect(readPizarra()[0].data.points[0]).toBe(1);
  });
});

// pizarra-editing-ux Phase 4: surface paste builds spawn descriptors
// (metadata only, NO id/panelId) ready for registry.addSurface — the
// provider mints fresh ids and spawns a new process/webview. This keeps
// the spawn-shaping logic pure + testable independent of the registry.
describe('pizarraClipboard — buildPastedSurfaces', () => {
  beforeEach(() => clearPizarra());

  test('returns spawn descriptors with no id/panelId and +20 offset', () => {
    const term = {
      type: SHAPE_TYPES.TERMINAL,
      panelId: 'live-panel-7',
      pizarra: { x: 100, y: 80, width: 640, height: 400, viewId: 'v1', zIndex: 2, locked: true },
      label: 'ops',
      cwd: '/repo',
      initialCommand: 'npm t',
      requestedRendererMode: 'xterm-webgl',
    };
    copyPizarra([term]);
    const [desc] = buildPastedSurfaces(readPizarra());
    // No id / panelId — the provider mints fresh ones and spawns.
    expect(desc.id).toBeUndefined();
    expect(desc.panelId).toBeUndefined();
    expect(desc.type).toBe(SHAPE_TYPES.TERMINAL);
    expect(desc.label).toBe('ops');
    expect(desc.cwd).toBe('/repo');
    expect(desc.initialCommand).toBe('npm t');
    expect(desc.requestedRendererMode).toBe('xterm-webgl');
    // Position offset by +20; size + viewId preserved.
    expect(desc.pizarra.x).toBe(120);
    expect(desc.pizarra.y).toBe(100);
    expect(desc.pizarra.width).toBe(640);
    expect(desc.pizarra.height).toBe(400);
    expect(desc.pizarra.viewId).toBe('v1');
    // Pasted copies start unlocked (editable), regardless of the source.
    expect(desc.pizarra.locked).toBe(false);
    // The live panelId must NOT leak into the descriptor.
    expect(JSON.stringify(desc)).not.toContain('live-panel-7');
  });

  test('preserves browser url + label and offsets position', () => {
    const browser = {
      type: SHAPE_TYPES.BROWSER,
      panelId: 'pizarra-browser-x',
      pizarra: { x: 40, y: 30, width: 1024, height: 700 },
      label: 'docs',
      url: 'http://localhost:3100/',
    };
    copyPizarra([browser]);
    const [desc] = buildPastedSurfaces(readPizarra(), { x: 100, y: 50 });
    expect(desc.type).toBe(SHAPE_TYPES.BROWSER);
    expect(desc.url).toBe('http://localhost:3100/');
    expect(desc.label).toBe('docs');
    expect(desc.pizarra.x).toBe(140);
    expect(desc.pizarra.y).toBe(80);
    expect(JSON.stringify(desc)).not.toContain('pizarra-browser-x');
  });

  test('skips shape items (only surfaces spawn)', () => {
    const rect = createShape(SHAPE_TYPES.RECT, { x: 0, y: 0 });
    const term = { type: SHAPE_TYPES.TERMINAL, pizarra: { x: 0, y: 0 } };
    copyPizarra([rect, term]);
    const descriptors = buildPastedSurfaces(readPizarra());
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].type).toBe(SHAPE_TYPES.TERMINAL);
  });

  test('empty/nullish items returns empty array (defensive)', () => {
    expect(buildPastedSurfaces([])).toEqual([]);
    expect(buildPastedSurfaces(undefined)).toEqual([]);
    expect(buildPastedSurfaces(null)).toEqual([]);
  });
});

// pizarra-editing-ux Phase 5: cross-pizarra paste. The clipboard is
// app-level (singleton), so a surface copied in workspace A can be pasted
// in workspace B. A's viewId may not exist in B, so the paste path remaps
// the descriptor to the destination workspace's active view. panelId is
// never carried (the provider mints a fresh one), so cross-workspace
// panelId collisions are impossible by construction.
describe('pizarraClipboard — buildPastedSurfaces cross-pizarra viewId remap', () => {
  beforeEach(() => clearPizarra());

  test('destinationViewId remaps the surface to the destination view', () => {
    const term = {
      type: SHAPE_TYPES.TERMINAL,
      panelId: 'wsA-panel-1',
      pizarra: { x: 10, y: 10, width: 640, height: 400, viewId: 'wsA-v1' },
      label: 'ops',
    };
    copyPizarra([term]);
    // Paste in workspace B whose active view is 'wsB-v1'.
    const [desc] = buildPastedSurfaces(
      readPizarra(),
      { x: 20, y: 20 },
      {
        destinationViewId: 'wsB-v1',
      }
    );
    expect(desc.pizarra.viewId).toBe('wsB-v1');
    // No panelId carried — the destination provider mints a fresh one.
    expect(desc.panelId).toBeUndefined();
    expect(JSON.stringify(desc)).not.toContain('wsA-panel-1');
    // Source viewId must not leak either.
    expect(desc.pizarra.viewId).not.toBe('wsA-v1');
  });

  test('omitting destinationViewId preserves the stored viewId (same-workspace paste)', () => {
    const browser = {
      type: SHAPE_TYPES.BROWSER,
      pizarra: { x: 0, y: 0, width: 1024, height: 700, viewId: 'v1' },
      url: 'http://localhost:3100/',
    };
    copyPizarra([browser]);
    const [desc] = buildPastedSurfaces(readPizarra());
    expect(desc.pizarra.viewId).toBe('v1');
  });

  test('a mixed cross-workspace clipboard pastes surfaces in the destination view', () => {
    const term = {
      type: SHAPE_TYPES.TERMINAL,
      pizarra: { x: 5, y: 5, viewId: 'wsA-v2' },
    };
    const browser = {
      type: SHAPE_TYPES.BROWSER,
      pizarra: { x: 50, y: 50, viewId: 'wsA-v1' },
      url: 'http://localhost:3200/',
    };
    copyPizarra([term, browser]);
    const descriptors = buildPastedSurfaces(
      readPizarra(),
      { x: 20, y: 20 },
      {
        destinationViewId: 'wsB-active',
      }
    );
    expect(descriptors).toHaveLength(2);
    expect(descriptors.every((d) => d.pizarra.viewId === 'wsB-active')).toBe(true);
    expect(descriptors.every((d) => d.id === undefined && d.panelId === undefined)).toBe(true);
  });
});

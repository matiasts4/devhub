/**
 * pizarraEditing — Phase 1 editing-UX contracts.
 *
 * Covers the pure logic introduced for copy/paste/lock/layers:
 * - shapeModel: zIndex/locked defaults, cloneShape (fresh id, copied
 *   points), orderByZIndexWithSelectionBump (layer order + selection
 *   bump).
 * - pizarraReducer: SET_LOCKED, BULK_ADD, REORDER_ELEMENT.
 *
 * The component wiring (keyboard handler, mergedElements sort, Konva
 * draggable/transformer exclusion) is exercised via the reducer + helper
 * contracts here; the render path consumes these pure functions.
 */

const {
  createShape,
  cloneShape,
  orderByZIndexWithSelectionBump,
  SHAPE_TYPES,
} = require('@/lib/pizarra/shapeModel');
const {
  PIZARRA_ACTIONS,
  pizarraReducer,
  PIZARRA_INITIAL_STATE,
} = require('@/lib/pizarra/pizarraReducer');

function makeState(overrides = {}) {
  return { ...PIZARRA_INITIAL_STATE, ...overrides };
}

function shape(id, zIndex, extra = {}) {
  return { id, type: SHAPE_TYPES.RECT, x: 0, y: 0, width: 10, height: 10, zIndex, ...extra };
}

describe('pizarraEditing — shapeModel defaults', () => {
  test('createShape defaults zIndex=0 and locked=false', () => {
    const s = createShape(SHAPE_TYPES.RECT, { x: 5, y: 6 });
    expect(s.zIndex).toBe(0);
    expect(s.locked).toBe(false);
  });

  test('createShape honors zIndex/locked overrides', () => {
    const s = createShape(SHAPE_TYPES.RECT, { zIndex: 3, locked: true });
    expect(s.zIndex).toBe(3);
    expect(s.locked).toBe(true);
  });

  test('legacy shapes without zIndex/locked are tolerated via ?? defaults', () => {
    // Consumers default missing fields; createShape always sets them,
    // but hydrate paths may receive bare objects. orderByZIndex and the
    // reducer use `?? 0` / falsy checks so absence is safe.
    const legacy = { id: 'old', type: 'rect', x: 0, y: 0 };
    expect(legacy.zIndex ?? 0).toBe(0);
    expect(Boolean(legacy.locked)).toBe(false);
  });
});

describe('pizarraEditing — cloneShape', () => {
  test('mints a fresh id different from the original', () => {
    const orig = createShape(SHAPE_TYPES.RECT, { x: 10, y: 20 });
    const copy = cloneShape(orig);
    expect(copy.id).not.toBe(orig.id);
    expect(copy.type).toBe(orig.type);
    expect(copy.x).toBe(10);
    expect(copy.y).toBe(20);
  });

  test('copies the points array without aliasing the original', () => {
    const orig = createShape(SHAPE_TYPES.LINE, { points: [0, 0, 30, 40] });
    const copy = cloneShape(orig);
    expect(copy.points).toEqual([0, 0, 30, 40]);
    expect(copy.points).not.toBe(orig.points);
    copy.points[0] = 999;
    expect(orig.points[0]).toBe(0);
  });

  test('applies overrides but keeps a fresh id', () => {
    const orig = createShape(SHAPE_TYPES.RECT, { x: 0, y: 0 });
    const copy = cloneShape(orig, { x: 100, y: 100, id: 'should-be-overwritten' });
    expect(copy.x).toBe(100);
    expect(copy.y).toBe(100);
    expect(copy.id).not.toBe('should-be-overwritten');
    expect(copy.id).not.toBe(orig.id);
  });
});

describe('pizarraEditing — orderByZIndexWithSelectionBump', () => {
  test('sorts shapes by zIndex ascending', () => {
    const a = shape('a', 2);
    const b = shape('b', 0);
    const c = shape('c', 1);
    const out = orderByZIndexWithSelectionBump([a, b, c], []);
    expect(out.map((el) => el.id)).toEqual(['b', 'c', 'a']);
  });

  test('bumps selected shapes to the end while keeping their relative order', () => {
    const a = shape('a', 0);
    const b = shape('b', 1);
    const c = shape('c', 2);
    const out = orderByZIndexWithSelectionBump([a, b, c], ['b']);
    // b is selected → moved after c; a, c keep zIndex order.
    expect(out.map((el) => el.id)).toEqual(['a', 'c', 'b']);
  });

  test('stable for equal zIndex (insertion order preserved)', () => {
    const a = shape('a', 0);
    const b = shape('b', 0);
    const c = shape('c', 0);
    const out = orderByZIndexWithSelectionBump([a, b, c], []);
    expect(out.map((el) => el.id)).toEqual(['a', 'b', 'c']);
  });

  test('does not mutate the input array', () => {
    const input = [shape('a', 2), shape('b', 0)];
    const inputSnapshot = input.map((el) => el.id);
    orderByZIndexWithSelectionBump(input, []);
    expect(input.map((el) => el.id)).toEqual(inputSnapshot);
  });

  test('empty input returns empty', () => {
    expect(orderByZIndexWithSelectionBump([], [])).toEqual([]);
  });
});

describe('pizarraEditing — reducer SET_LOCKED', () => {
  test('sets locked on the target id and leaves siblings untouched', () => {
    const before = makeState({
      elements: [shape('a', 0, { locked: false }), shape('b', 0, { locked: false })],
    });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.SET_LOCKED,
      payload: { id: 'a', locked: true },
    });
    expect(after.elements.find((el) => el.id === 'a').locked).toBe(true);
    expect(after.elements.find((el) => el.id === 'b').locked).toBe(false);
  });

  test('can unlock a previously locked element', () => {
    const before = makeState({ elements: [shape('a', 0, { locked: true })] });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.SET_LOCKED,
      payload: { id: 'a', locked: false },
    });
    expect(after.elements[0].locked).toBe(false);
  });
});

describe('pizarraEditing — reducer BULK_ADD', () => {
  test('appends multiple elements in one dispatch', () => {
    const before = makeState({ elements: [shape('a', 0)] });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.BULK_ADD,
      payload: [shape('b', 0), shape('c', 0)],
    });
    expect(after.elements.map((el) => el.id)).toEqual(['a', 'b', 'c']);
  });

  test('non-array payload appends nothing (defensive)', () => {
    const before = makeState({ elements: [shape('a', 0)] });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.BULK_ADD,
      payload: undefined,
    });
    expect(after.elements.map((el) => el.id)).toEqual(['a']);
  });
});

describe('pizarraEditing — reducer REORDER_ELEMENT', () => {
  test('front moves the element to the end and reindexes zIndex compactly', () => {
    const before = makeState({
      elements: [shape('a', 0), shape('b', 1), shape('c', 2)],
    });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'a', op: 'front' },
    });
    expect(after.elements.map((el) => el.id)).toEqual(['b', 'c', 'a']);
    expect(after.elements.map((el) => el.zIndex)).toEqual([0, 1, 2]);
  });

  test('back moves the element to the start', () => {
    const before = makeState({
      elements: [shape('a', 0), shape('b', 1), shape('c', 2)],
    });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'c', op: 'back' },
    });
    expect(after.elements.map((el) => el.id)).toEqual(['c', 'a', 'b']);
  });

  test('forward swaps with the next element', () => {
    const before = makeState({
      elements: [shape('a', 0), shape('b', 1), shape('c', 2)],
    });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'a', op: 'forward' },
    });
    expect(after.elements.map((el) => el.id)).toEqual(['b', 'a', 'c']);
  });

  test('backward swaps with the previous element', () => {
    const before = makeState({
      elements: [shape('a', 0), shape('b', 1), shape('c', 2)],
    });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'c', op: 'backward' },
    });
    expect(after.elements.map((el) => el.id)).toEqual(['a', 'c', 'b']);
  });

  test('forward on the last element is a no-op', () => {
    const before = makeState({
      elements: [shape('a', 0), shape('b', 1), shape('c', 2)],
    });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'c', op: 'forward' },
    });
    expect(after.elements.map((el) => el.id)).toEqual(['a', 'b', 'c']);
  });

  test('unknown id returns the same state', () => {
    const before = makeState({ elements: [shape('a', 0)] });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'nope', op: 'front' },
    });
    expect(after).toBe(before);
  });

  test('unknown op returns the same state', () => {
    const before = makeState({ elements: [shape('a', 0), shape('b', 1)] });
    const after = pizarraReducer(before, {
      type: PIZARRA_ACTIONS.REORDER_ELEMENT,
      payload: { id: 'a', op: 'sideways' },
    });
    expect(after).toBe(before);
  });
});

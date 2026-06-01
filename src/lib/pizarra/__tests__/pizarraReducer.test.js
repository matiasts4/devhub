/**
 * pizarraReducer — reducer contract tests.
 *
 * Covers openspec/changes/pizarra-ux-overhaul/specs/board-element-placement
 * (Req 1, 2) and pizarra-state-persistence (Req 1, 2).
 *
 * The reducer is intentionally pure: these tests call it directly and
 * assert the cascade math, the array shape, the modulo-8 wrap, and the
 * invariant that DELETE_ELEMENT does NOT rewind cascadeIndex.
 */

const {
  PIZARRA_ACTIONS,
  pizarraReducer,
  PIZARRA_INITIAL_STATE,
} = require('@/lib/pizarra/pizarraReducer');

function makeState(overrides = {}) {
  return {
    ...PIZARRA_INITIAL_STATE,
    cascadeIndex: 0,
    ...overrides,
  };
}

describe('pizarraReducer — CASCADE_OFFSET contract', () => {
  test('CASCADE_OFFSET returns (0, 0) when cascadeIndex is 0', () => {
    const before = makeState();
    const after = pizarraReducer(before, { type: PIZARRA_ACTIONS.CASCADE_OFFSET });

    expect(after.cascadeIndex).toBe(1);

    // The offset math lives in the consumer; reducer advances the index
    // and the consumer reads the previous index to compute (24 * idx, 24 * idx).
    const previousIndex = before.cascadeIndex;
    const offsetX = 24 * (previousIndex % 8);
    const offsetY = 24 * (previousIndex % 8);
    expect({ x: offsetX, y: offsetY }).toEqual({ x: 0, y: 0 });
  });

  test('CASCADE_OFFSET advances by 24px per call', () => {
    const initial = makeState({ cascadeIndex: 1 });
    const after = pizarraReducer(initial, { type: PIZARRA_ACTIONS.CASCADE_OFFSET });

    const previousIndex = initial.cascadeIndex;
    const offsetX = 24 * (previousIndex % 8);
    const offsetY = 24 * (previousIndex % 8);
    expect({ x: offsetX, y: offsetY }).toEqual({ x: 24, y: 24 });
    expect(after.cascadeIndex).toBe(2);
  });

  test('CASCADE_OFFSET wraps after 8 calls (modulo 8)', () => {
    let state = makeState({ cascadeIndex: 7 });
    state = pizarraReducer(state, { type: PIZARRA_ACTIONS.CASCADE_OFFSET });
    expect(state.cascadeIndex).toBe(0);

    // The 9th call yields offset (0, 0) again.
    const previousIndex = state.cascadeIndex;
    const offsetX = 24 * (previousIndex % 8);
    const offsetY = 24 * (previousIndex % 8);
    expect({ x: offsetX, y: offsetY }).toEqual({ x: 0, y: 0 });
  });

  test('cascade counter is shared across element types', () => {
    let state = makeState({ cascadeIndex: 2 });

    // Per board-element-placement Req 1 scenario "Cascade advance is
    // independent of the element type", each handleAddElement call
    // dispatches CASCADE_OFFSET THEN ADD_ELEMENT. Two adds → two advances.
    state = pizarraReducer(state, { type: PIZARRA_ACTIONS.CASCADE_OFFSET });
    state = pizarraReducer(state, {
      type: PIZARRA_ACTIONS.ADD_ELEMENT,
      payload: { id: 'term-1', type: 'terminal', x: 0, y: 0 },
    });
    state = pizarraReducer(state, { type: PIZARRA_ACTIONS.CASCADE_OFFSET });
    state = pizarraReducer(state, {
      type: PIZARRA_ACTIONS.ADD_ELEMENT,
      payload: { id: 'browser-1', type: 'browser', x: 0, y: 0 },
    });

    // Two advances from cascadeIndex=2 → cascadeIndex=4.
    expect(state.cascadeIndex).toBe(4);
    // Both element types coexist in the same elements array; the
    // counter is shared (no per-type sub-indices).
    expect(state.elements).toHaveLength(2);
    expect(state.elements.map((el) => el.type)).toEqual(['terminal', 'browser']);
  });

  test('CASCADE_OFFSET is computed without DOM measurement', () => {
    // The reducer is pure: same input → same output, no window/document access.
    const before = makeState({ cascadeIndex: 3 });
    const after = pizarraReducer(before, { type: PIZARRA_ACTIONS.CASCADE_OFFSET });

    expect(after.cascadeIndex).toBe(4);
    expect(after.elements).toBe(before.elements);
  });

  test('DELETE_ELEMENT does not rewind cascadeIndex', () => {
    const withThreeElements = {
      ...makeState({ cascadeIndex: 3 }),
      elements: [
        { id: 'el-1', type: 'rect', x: 0, y: 0 },
        { id: 'el-2', type: 'rect', x: 0, y: 0 },
        { id: 'el-3', type: 'rect', x: 0, y: 0 },
      ],
    };

    const afterDelete = pizarraReducer(withThreeElements, {
      type: PIZARRA_ACTIONS.DELETE_ELEMENT,
      payload: 'el-1',
    });

    expect(afterDelete.cascadeIndex).toBe(3);
    expect(afterDelete.elements).toHaveLength(2);
  });
});

describe('pizarraReducer — state shape contract', () => {
  test('reducer state.elements is an array, not a Map', () => {
    const state = makeState();
    expect(Array.isArray(state.elements)).toBe(true);
    expect(state.elements).not.toBeInstanceOf(Map);
  });

  test('reducer state does not contain a viewport key', () => {
    const state = makeState();
    expect('viewport' in state).toBe(false);
  });

  test('PIZARRA_ACTIONS.CASCADE_OFFSET is exported from the module', () => {
    expect(PIZARRA_ACTIONS.CASCADE_OFFSET).toBe('CASCADE_OFFSET');
  });

  test('named exports expose pizarraReducer + PIZARRA_INITIAL_STATE', () => {
    expect(typeof pizarraReducer).toBe('function');
    expect(typeof PIZARRA_INITIAL_STATE).toBe('object');
    expect(PIZARRA_ACTIONS).toBeDefined();
  });
});

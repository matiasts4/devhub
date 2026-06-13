const {
  createEmptyState,
  serialize,
  deserialize,
  validateState,
} = require('../../../lib/pizarra/stateHelpers');

describe('createEmptyState', () => {
  test('returns an object with elements as empty Map', () => {
    const state = createEmptyState();
    expect(state.elements).toBeInstanceOf(Map);
    expect(state.elements.size).toBe(0);
  });

  test('returns viewport with correct defaults', () => {
    const state = createEmptyState();
    expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  test('returns activeTool as select', () => {
    const state = createEmptyState();
    expect(state.activeTool).toBe('select');
  });

  test('returns toolSettings with color, strokeWidth, fontSize', () => {
    const state = createEmptyState();
    expect(state.toolSettings).toEqual({
      color: '#000000',
      strokeWidth: 2,
      fontSize: 16,
    });
  });

  test('returns activeBoardId as string', () => {
    const state = createEmptyState();
    expect(typeof state.activeBoardId).toBe('string');
    expect(state.activeBoardId.length).toBeGreaterThan(0);
  });

  test('returns boards as empty Map', () => {
    const state = createEmptyState();
    expect(state.boards).toBeInstanceOf(Map);
    expect(state.boards.size).toBe(0);
  });
});

describe('serialize', () => {
  test('serializes state with elements Map as plain object', () => {
    const state = createEmptyState();
    state.elements.set('el-1', { id: 'el-1', type: 'rect', x: 10, y: 20 });
    const json = serialize(state);
    const parsed = JSON.parse(json);
    expect(parsed.elements).toEqual({ 'el-1': { id: 'el-1', type: 'rect', x: 10, y: 20 } });
  });

  test('serializes boards Map as plain object', () => {
    const state = createEmptyState();
    state.boards.set('board-1', { id: 'board-1', name: 'Main', createdAt: 1234567890 });
    const json = serialize(state);
    const parsed = JSON.parse(json);
    expect(parsed.boards).toEqual({ 'board-1': { id: 'board-1', name: 'Main', createdAt: 1234567890 } });
  });

  test('includes schemaVersion field', () => {
    const state = createEmptyState();
    const json = serialize(state);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
  });

  test('serializes all top-level state fields', () => {
    const state = createEmptyState();
    state.viewport = { x: 5, y: 10, zoom: 2 };
    state.activeTool = 'rect';
    state.toolSettings = { color: '#ff0000', strokeWidth: 4, fontSize: 20 };
    state.activeBoardId = 'my-board';
    const json = serialize(state);
    const parsed = JSON.parse(json);
    expect(parsed.viewport).toEqual({ x: 5, y: 10, zoom: 2 });
    expect(parsed.activeTool).toBe('rect');
    expect(parsed.toolSettings).toEqual({ color: '#ff0000', strokeWidth: 4, fontSize: 20 });
    expect(parsed.activeBoardId).toBe('my-board');
  });
});

describe('deserialize', () => {
  test('happy path — returns state with Maps reconstructed from plain objects', () => {
    const state = createEmptyState();
    state.elements.set('el-1', { id: 'el-1', type: 'circle', x: 1, y: 2 });
    state.boards.set('board-1', { id: 'board-1', name: 'Test', createdAt: 999 });
    const json = serialize(state);
    const result = deserialize(json);
    expect(result).not.toBeNull();
    expect(result.elements).toBeInstanceOf(Map);
    expect(result.elements.get('el-1')).toEqual({ id: 'el-1', type: 'circle', x: 1, y: 2 });
    expect(result.boards).toBeInstanceOf(Map);
    expect(result.boards.get('board-1')).toEqual({ id: 'board-1', name: 'Test', createdAt: 999 });
  });

  test('malformed JSON returns null', () => {
    expect(deserialize('not valid json')).toBeNull();
    expect(deserialize('{ "broken":')).toBeNull();
    expect(deserialize('')).toBeNull();
  });

  test('missing top-level keys returns null', () => {
    expect(deserialize('{"viewport":{}}')).toBeNull();
    expect(deserialize('{"activeTool":"select"}')).toBeNull();
    expect(deserialize('{}')).toBeNull();
  });

  test('valid structure with missing optional fields falls back gracefully', () => {
    const json = JSON.stringify({
      elements: {},
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTool: 'rect',
      toolSettings: { color: '#000', strokeWidth: 2, fontSize: 16 },
      activeBoardId: 'default',
      boards: {},
      schemaVersion: 1,
    });
    const result = deserialize(json);
    expect(result).not.toBeNull();
    expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(result.activeTool).toBe('rect');
  });
});

describe('validateState', () => {
  test('returns true for valid state', () => {
    const state = createEmptyState();
    expect(validateState(state)).toBe(true);
  });

  test('returns false for missing viewport', () => {
    const state = { elements: new Map(), activeTool: 'select', toolSettings: { color: '#000', strokeWidth: 2, fontSize: 16 }, activeBoardId: 'x', boards: new Map() };
    expect(validateState(state)).toBe(false);
  });

  test('returns false for invalid activeTool', () => {
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: new Map(),
      activeTool: 'not-a-tool',
      toolSettings: { color: '#000', strokeWidth: 2, fontSize: 16 },
      activeBoardId: 'x',
      boards: new Map(),
    };
    expect(validateState(state)).toBe(false);
  });

  test('returns false for missing toolSettings fields', () => {
    const state = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: new Map(),
      activeTool: 'select',
      toolSettings: { color: '#000' },
      activeBoardId: 'x',
      boards: new Map(),
    };
    expect(validateState(state)).toBe(false);
  });
});